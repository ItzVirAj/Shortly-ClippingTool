"""Unit tests for Live Clipper Cutter (Section 7.5 and Section 9 Task 5)."""
import json
import os
from pathlib import Path
import subprocess
import pytest

from live_clipper.cutter import (
    calculate_clip_window,
    check_buffer_and_gaps,
    extract_clip,
    find_covering_segments,
    map_to_recording_time,
    probe_duration,
)
from live_clipper.models import GapRecord, LiveConfig
from spike_core.models import DetectorConfig, Spike


@pytest.fixture
def temp_dir(tmp_path: Path) -> Path:
    return tmp_path


def make_test_spike(onset: float = 60.0, peak: float = 70.0, end: float = 80.0) -> Spike:
    return Spike(
        id="spk-123",
        onset=onset,
        peak=peak,
        end=end,
        peak_count=50,
        baseline=5.0,
        ratio=10.0,
        unique_users=20,
        emote_share=0.5,
        spam_share=0.1,
        score=85.0,
        suggested_start=onset - 25.0,
        suggested_end=end + 10.0,
        tags=["test_spike"],
    )


def test_calculate_clip_window_with_sync_offset():
    """Verify window calculation applies before/after buffers and shifts by sync_offset_sec."""
    spike = make_test_spike(onset=100.0, peak=110.0, end=120.0)
    # Default detector: before_sec=25, after_sec=10 -> [75.0, 130.0]
    # With sync_offset_sec = +5.0 -> [80.0, 135.0]
    config = LiveConfig(
        channel="testchannel",
        permission_ack=True,
        sync_offset_sec=5.0,
        detector=DetectorConfig(before_sec=25.0, after_sec=10.0, min_len=20.0, max_len=60.0),
    )
    start, end, tags = calculate_clip_window(spike, config, session_duration=3600.0)
    assert start == pytest.approx(80.0)
    assert end == pytest.approx(135.0)
    assert "test_spike" in tags


def test_map_to_recording_time():
    """Verify session time maps to recording time accounting for offset."""
    assert map_to_recording_time(100.0, recording_offset_sec=10.0) == pytest.approx(90.0)
    assert map_to_recording_time(5.0, recording_offset_sec=10.0) == pytest.approx(0.0)
    assert map_to_recording_time(50.0, recording_offset_sec=None) == pytest.approx(50.0)


def test_check_buffer_and_gaps_clamping():
    """Verify window clamps at buffer boundary and tags 'clamped'."""
    buffer_index = {
        "segments": [
            {"path": "/tmp/seg1.mp4", "start_sec": 30.0, "duration": 10.0, "end_sec": 40.0},
            {"path": "/tmp/seg2.mp4", "start_sec": 40.0, "duration": 10.0, "end_sec": 50.0},
        ]
    }
    # Window requested: [20.0, 45.0]. Oldest segment starts at 30.0 -> clamps to [30.0, 45.0]
    start, end, tags, err = check_buffer_and_gaps(
        start_rec=20.0,
        end_rec=45.0,
        buffer_index=buffer_index,
        gaps=[],
        min_len=10.0,
    )
    assert err is None
    assert start == pytest.approx(30.0)
    assert end == pytest.approx(45.0)
    assert "clamped" in tags


def test_check_buffer_and_gaps_min_len_skip():
    """Verify clip is skipped if clamped duration is shorter than min_len."""
    buffer_index = {
        "segments": [
            {"path": "/tmp/seg1.mp4", "start_sec": 40.0, "duration": 10.0, "end_sec": 50.0},
        ]
    }
    # Window requested: [10.0, 45.0]. Clamps to [40.0, 45.0] (5s). min_len is 20s.
    start, end, tags, err = check_buffer_and_gaps(
        start_rec=10.0,
        end_rec=45.0,
        buffer_index=buffer_index,
        gaps=[],
        min_len=20.0,
    )
    assert start is None
    assert end is None
    assert "Remaining duration" in (err or "")


def test_check_buffer_and_gaps_gap_protection():
    """Verify gap rules: <= 3s overlap adds 'near_gap'; > 3s skips the clip."""
    buffer_index = {
        "segments": [
            {"path": "/tmp/seg1.mp4", "start_sec": 0.0, "duration": 60.0, "end_sec": 60.0},
        ]
    }

    # Case A: Small gap of 2 seconds inside window [10, 40]
    small_gap = GapRecord(kind="video", start=20.0, end=22.0)
    start_a, end_a, tags_a, err_a = check_buffer_and_gaps(
        start_rec=10.0,
        end_rec=40.0,
        buffer_index=buffer_index,
        gaps=[small_gap],
        min_len=15.0,
    )
    assert err_a is None
    assert "near_gap" in tags_a
    assert start_a == 10.0
    assert end_a == 40.0

    # Case B: Large gap of 5 seconds inside window [10, 40]
    large_gap = GapRecord(kind="video", start=20.0, end=25.0)
    start_b, end_b, tags_b, err_b = check_buffer_and_gaps(
        start_rec=10.0,
        end_rec=40.0,
        buffer_index=buffer_index,
        gaps=[large_gap],
        min_len=15.0,
    )
    assert start_b is None
    assert "Video gap overlap" in (err_b or "")


def test_find_covering_segments():
    """Verify find_covering_segments selects and sorts only overlapping segments."""
    buffer_index = {
        "segments": [
            {"file": "seg0.mp4", "session_start": 0.0, "duration": 10.0},   # [0, 10]
            {"file": "seg1.mp4", "session_start": 10.0, "duration": 10.0},  # [10, 20]
            {"file": "seg2.mp4", "session_start": 20.0, "duration": 10.0},  # [20, 30]
            {"file": "seg3.mp4", "session_start": 30.0, "duration": 10.0},  # [30, 40]
        ]
    }
    # Window [15.0, 25.0] overlaps seg1 [10, 20] and seg2 [20, 30]
    covering = find_covering_segments(15.0, 25.0, buffer_index)
    assert len(covering) == 2
    assert covering[0]["start_sec"] == 10.0
    assert covering[1]["start_sec"] == 20.0


def test_real_ffmpeg_stream_copy_and_ffprobe(temp_dir: Path):
    """Generate a synthetic test MP4 via FFmpeg and verify stream-copy cut and ffprobe duration."""
    # Check if ffmpeg is available
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except Exception:
        pytest.skip("ffmpeg not available on host")

    # Generate a 15-second test video
    src_video = temp_dir / "test_source.mp4"
    cmd_gen = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", "testsrc=duration=15:size=320x240:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=1000:duration=15",
        "-c:v", "libx264", "-preset", "ultrafast",
        "-c:a", "aac",
        str(src_video),
    ]
    subprocess.run(cmd_gen, capture_output=True, check=True, timeout=30.0)
    assert src_video.exists()

    # Probe duration
    src_dur = probe_duration(src_video)
    assert src_dur is not None
    assert abs(src_dur - 15.0) < 0.5

    # Extract a 5-second cut [3.0 to 8.0]
    out_clip = temp_dir / "test_cut.mp4"
    segments = [{
        "path": str(src_video),
        "start_sec": 0.0,
        "duration": 15.0,
        "end_sec": 15.0,
    }]

    ok = extract_clip(
        covering_segments=segments,
        start_rec=3.0,
        end_rec=8.0,
        out_path=out_clip,
    )
    assert ok is True
    assert out_clip.exists()

    # Verify cut duration is within 2s of 5.0s target
    cut_dur = probe_duration(out_clip)
    assert cut_dur is not None
    assert abs(cut_dur - 5.0) <= 2.0
