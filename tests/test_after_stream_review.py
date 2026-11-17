"""Unit and integration tests for After-Stream Review (Phase 5, Task 1)."""
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest

from spike_core.models import ChatEvent
from live_clipper.models import LiveConfig, LiveSession, QueueItem
from live_clipper.review import review_session, cut_review_clip, inspect_session_recording
from live_clipper.queue import global_queue


class TestAfterStreamReview(unittest.TestCase):
    """Test after-stream batch review and clip extraction."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="shortly_review_test_")
        self.session_dir = Path(self.tmp_dir) / "test_session"
        self.session_dir.mkdir(parents=True, exist_ok=True)
        (self.session_dir / "clips").mkdir(exist_ok=True)

        # Write session.json
        self.session_id = "11111111-2222-3333-4444-555555555555"
        self.session_data = {
            "id": self.session_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "config": {
                "channel": "teststreamer",
                "permission_ack": True,
                "platform": "kick",
                "recording_mode": "full",
                "buffer_minutes": 8,
                "confirm_delay_sec": 5.0,
                "cooldown_sec": 30.0,
                "max_clips_per_hour": 10,
                "max_pending": 10,
                "sync_offset_sec": 0.0,
                "max_session_hours": 2.0,
                "max_disk_gb": 10.0,
                "hook_mode": "auto",
                "auto_process": False,
                "wait_for_live": False,
            },
            "state": "stopped",
            "chat_state": "disconnected",
            "recorder_state": "stopped",
            "gaps": [],
            "stats": {"events_total": 0, "clips_cut": 0},
            "error": None,
        }
        with open(self.session_dir / "session.json", "w", encoding="utf-8") as f:
            json.dump(self.session_data, f)

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def _generate_synthetic_events(self, num_normal: int = 100, burst_t: float = 120.0):
        """Write normal chat events plus a sharp burst at burst_t."""
        events_path = self.session_dir / "events.jsonl"
        with open(events_path, "w", encoding="utf-8") as f:
            # Baseline chat: ~1 msg every 2 seconds
            for i in range(num_normal):
                t = i * 2.0
                line = json.dumps({"t": t, "user": f"user{i%10}", "text": "normal chat", "emotes": 0, "is_bot": False})
                f.write(line + "\n")

            # Burst: 40 messages within 3 seconds around burst_t
            for j in range(40):
                t = burst_t + (j * 0.05)
                line = json.dumps({"t": t, "user": f"hyped{j}", "text": "LETS GOOO OMEGALUL", "emotes": 2, "is_bot": False})
                f.write(line + "\n")

    def test_review_session_detection(self):
        """Review detects chat burst and produces time-series graph points."""
        self._generate_synthetic_events(num_normal=120, burst_t=100.0)

        # Run review with standard balanced threshold
        res = review_session(self.session_dir, params={"ratio_threshold": 3.0, "min_count": 5})

        self.assertEqual(res["session_id"], self.session_id)
        self.assertGreater(res["events_total"], 100)
        self.assertGreater(len(res["series"]), 0)
        self.assertGreaterEqual(len(res["spikes"]), 1)

        # The burst was at t=100.0s
        spike = res["spikes"][0]
        self.assertAlmostEqual(spike["onset"], 100.0, delta=10.0)
        self.assertGreater(spike["score"], 2.0)

    def test_review_tunable_sensitivity(self):
        """Higher thresholds filter out moderate bursts; lower thresholds detect them."""
        self._generate_synthetic_events(num_normal=120, burst_t=100.0)

        # Very strict threshold (ratio 20.0)
        res_strict = review_session(self.session_dir, params={"ratio_threshold": 20.0, "min_count": 50})
        self.assertEqual(len(res_strict["spikes"]), 0)

        # Sensitive threshold (ratio 2.0)
        res_sensitive = review_session(self.session_dir, params={"ratio_threshold": 2.0, "min_count": 5})
        self.assertGreaterEqual(len(res_sensitive["spikes"]), 1)

    def test_review_reports_missing_recording(self):
        """If recording files were not kept, review reports has_recording=False with clear message."""
        self._generate_synthetic_events(num_normal=50, burst_t=50.0)
        # Update session config to rolling mode
        self.session_data["config"]["recording_mode"] = "rolling"
        with open(self.session_dir / "session.json", "w", encoding="utf-8") as f:
            json.dump(self.session_data, f)

        res = review_session(self.session_dir)

        self.assertFalse(res["has_recording"])
        self.assertIn("not kept", res["message"].lower())

    def test_cut_review_clip_success(self):
        """Extracting a clip from a recording creates a protected QueueItem."""
        self._generate_synthetic_events(num_normal=50, burst_t=50.0)

        # Create a mock video segment in recording/
        rec_dir = self.session_dir / "recording"
        rec_dir.mkdir(parents=True, exist_ok=True)
        seg_file = rec_dir / "mock_full.mp4"

        # Generate a real short test video with ffmpeg
        res = os.system(f'ffmpeg -y -f lavfi -i testsrc=duration=60:size=320x240:rate=10 -f lavfi -i anullsrc=r=44100:cl=mono -t 60 -c:v libx264 -preset ultrafast -c:a aac "{seg_file}" >nul 2>&1')
        if res != 0 or not seg_file.exists():
            self.skipTest("FFmpeg not available to generate test video")

        index_data = {
            "mode": "full",
            "segments": [{
                "file": "mock_full.mp4",
                "path": str(seg_file.resolve()),
                "start_sec": 0.0,
                "duration": 60.0,
                "end_sec": 60.0,
            }]
        }
        with open(rec_dir / "index.json", "w", encoding="utf-8") as f:
            json.dump(index_data, f)

        session_obj = LiveSession.from_dict(self.session_data)
        item, err = cut_review_clip(
            session_dir=self.session_dir,
            session=session_obj,
            start_sec=10.0,
            end_sec=25.0,
            title="Great play",
        )

        self.assertIsNone(err)
        self.assertIsNotNone(item)
        self.assertTrue(item.keep_forever)  # Review cuts are protected by default
        self.assertTrue(Path(item.clip_path).exists())
        self.assertIn("after_stream_review", item.tags)


if __name__ == "__main__":
    unittest.main()
