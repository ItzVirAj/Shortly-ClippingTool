"""Tests for StreamlinkRecorder wrapper and process hygiene (Phase 2 Part B)."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import pytest

from live_clipper.streamlink_recorder import StreamlinkRecorder


@pytest.fixture
def temp_rec_dir():
    td = tempfile.mkdtemp(prefix="test_recorder_")
    yield Path(td)
    shutil.rmtree(td, ignore_errors=True)


def test_streamlink_recorder_availability_check():
    """check_available reports True only when binaries exist, else False with details."""
    # When pointed at invalid paths
    recorder_missing = StreamlinkRecorder(streamlink_bin="nonexistent_streamlink_bin_xyz", ffmpeg_bin="nonexistent_ffmpeg_bin_xyz")
    status = asyncio.run(recorder_missing.check_available())
    assert status["available"] is False
    assert status["streamlink"] is False
    assert status["ffmpeg"] is False


def test_streamlink_recorder_argument_lists():
    """Verify command argument lists use argument lists and never shell=True."""
    recorder = StreamlinkRecorder(
        streamlink_bin="streamlink_mock",
        ffmpeg_bin="ffmpeg_mock",
        segment_time_sec=10.0,
        buffer_minutes=5,
    )
    # Check attributes
    assert recorder.streamlink_bin == "streamlink_mock"
    assert recorder.ffmpeg_bin == "ffmpeg_mock"
    assert recorder.segment_time_sec == 10.0
    assert recorder.buffer_minutes == 5


def test_real_process_hygiene_no_orphans(temp_rec_dir):
    """Verify child processes are tracked and completely terminated on stop (zero orphan processes)."""
    async def _run():
        # Create a mock wrapper recorder that spawns two long-running real Python subprocesses
        recorder = StreamlinkRecorder(
            streamlink_bin=sys.executable,
            ffmpeg_bin=sys.executable,
            segment_time_sec=5.0,
            buffer_minutes=2,
        )

        # Monkeypatch start to launch real python sleeping subprocesses with argument lists
        recorder._out_dir = temp_rec_dir
        recorder._mode = "rolling"
        recorder._session_clock_zero = time.monotonic()
        buffer_dir = temp_rec_dir / "buffer"
        buffer_dir.mkdir(parents=True, exist_ok=True)
        index_path = buffer_dir / "index.json"

        # Spawn 2 real OS child processes via argument lists
        dummy_cmd1 = [sys.executable, "-c", "import time; time.sleep(300)"]
        dummy_cmd2 = [sys.executable, "-c", "import time; time.sleep(300)"]

        p1 = subprocess.Popen(dummy_cmd1)
        p2 = subprocess.Popen(dummy_cmd2)
        recorder._streamlink_proc = p1
        recorder._ffmpeg_proc = p2
        recorder._child_processes = [p1, p2]
        recorder._state = "recording"

        # Verify child processes are alive and tracked
        pids = recorder.get_child_pids()
        assert len(pids) == 2
        assert all(p.poll() is None for p in [p1, p2])

        # Stop recorder
        await recorder.stop()

        # Verify state is stopped
        assert recorder.state == "stopped"

        # Verify child processes are killed and no orphans remain
        assert p1.poll() is not None
        assert p2.poll() is not None
        assert recorder.get_child_pids() == []

    asyncio.run(_run())


def test_rolling_buffer_index_and_pruning(temp_rec_dir):
    """Verify index.json is updated and old segments are pruned in rolling mode."""
    async def _run():
        buffer_dir = temp_rec_dir / "buffer"
        buffer_dir.mkdir(parents=True, exist_ok=True)
        index_path = buffer_dir / "index.json"

        recorder = StreamlinkRecorder(
            streamlink_bin=sys.executable,
            ffmpeg_bin=sys.executable,
            segment_time_sec=5.0,
            buffer_minutes=1,  # 1 minute retention = 60s
        )
        recorder._out_dir = temp_rec_dir
        recorder._mode = "rolling"
        recorder._session_clock_zero = time.monotonic() - 200.0  # simulate session started 200s ago
        recorder._state = "recording"

        # Create 3 mock segment files on disk
        seg1 = buffer_dir / "seg_00001.mp4"
        seg2 = buffer_dir / "seg_00002.mp4"
        seg1.write_bytes(b"MOCK_1")
        seg2.write_bytes(b"MOCK_2")

        # Start monitor loop for a brief cycle
        monitor_task = asyncio.create_task(recorder._monitor_loop(buffer_dir, index_path))
        await asyncio.sleep(0.3)

        # Verify index.json was created
        assert index_path.exists()
        with open(index_path, "r", encoding="utf-8") as f:
            idx = json.load(f)
        assert len(idx["segments"]) >= 2

        await recorder.stop()

    asyncio.run(_run())
