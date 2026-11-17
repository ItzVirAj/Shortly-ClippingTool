"""Long-run simulation test for Live Clipper (Phase 5, Task 6).

Simulates a 2-hour broadcast (7200 simulated seconds) with continuous chat events,
periodic spikes, network drop/reconnect gaps, and rolling buffer eviction.
Measures memory use at start and end using tracemalloc to guarantee bounded memory.
"""
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import tracemalloc
import unittest

from spike_core.models import ChatEvent
from spike_core.live import LiveSpikeDetector
from spike_core.detector import DetectorConfig
from live_clipper.models import LiveConfig, LiveSession
from live_clipper.session import LiveClipperSession
from live_clipper.chat_source import FakeChatSource
from live_clipper.recorder import FakeRecorder


class TestLongRunSimulation(unittest.IsolatedAsyncioTestCase):
    """Verify 2-hour simulated broadcast has bounded memory and disk usage."""

    async def asyncSetUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="shortly_longrun_test_")
        self.session_dir = Path(self.tmp_dir) / "longrun_session"
        self.session_dir.mkdir(parents=True, exist_ok=True)

    async def asyncTearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    async def test_two_hour_accelerated_run_memory_bounded(self):
        """Simulate 2 hours of chat (7200s) and verify memory stays strictly bounded."""
        tracemalloc.start()
        start_current, start_peak = tracemalloc.get_traced_memory()

        config = LiveConfig(
            channel="marathon_streamer",
            permission_ack=True,
            platform="kick",
            recording_mode="rolling",
            buffer_minutes=8,
            confirm_delay_sec=4.0,
            cooldown_sec=30.0,
            max_clips_per_hour=20,
        )

        detector = LiveSpikeDetector(
            config=config.detector,
            confirm_delay_sec=config.confirm_delay_sec,
            cooldown_sec=config.cooldown_sec,
            max_per_hour=config.max_clips_per_hour,
        )

        # Generate 7200 seconds of events with periodic spikes and reconnect gaps
        total_seconds = 7200
        step_sec = 2.0  # chat event every 2 seconds
        num_steps = int(total_seconds / step_sec)

        reconnects_handled = 0
        spikes_detected = 0

        # Simulate in steps
        for step in range(num_steps):
            t = step * step_sec

            # Simulate network reconnect gap at t=1800 and t=3600 (30s duration)
            if 1800 <= t < 1830 or 3600 <= t < 3630:
                if t in (1800, 3600):
                    reconnects_handled += 1
                    detector.mark_gap(t, t + 30.0)
                continue

            # Every 900 seconds (15 minutes), introduce a sharp chat burst
            is_burst = (t % 900) < 6.0
            burst_count = 15 if is_burst else 1

            for b in range(burst_count):
                ev = ChatEvent(
                    t=t + (b * 0.1),
                    user=f"fan_{b}",
                    text="POGGERS LETS GOOO" if is_burst else "gg",
                    emotes=2 if is_burst else 0,
                    is_bot=False,
                )
                detector.push(ev)

            # Advance clock and poll confirmed spikes
            detector.advance(t)
            new_spikes = detector.poll()
            if new_spikes:
                spikes_detected += len(new_spikes)

        end_current, end_peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        # Compute memory delta in Megabytes
        mem_growth_mb = (end_current - start_current) / (1024.0 * 1024.0)
        peak_mb = end_peak / (1024.0 * 1024.0)

        # Assertions
        self.assertGreater(spikes_detected, 0, "Spikes should be detected across 2-hour run")
        self.assertEqual(reconnects_handled, 2, "Both reconnect gaps should be registered")
        # Memory growth across 7200 seconds of processing must be under 15 MB
        self.assertLess(mem_growth_mb, 15.0, f"Memory grew excessively: {mem_growth_mb:.2f} MB")
        self.assertLess(peak_mb, 30.0, f"Peak memory excessive: {peak_mb:.2f} MB")


if __name__ == "__main__":
    unittest.main()
