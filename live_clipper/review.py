"""After-stream review module for Live Clipper (Phase 5, Task 1).

Analyzes saved events.jsonl with spike_core's batch detector, computes chat
velocity graph data with tunable thresholds, and extracts manual or spike-selected
clips from preserved full recordings into the review queue.
"""
from dataclasses import asdict
import json
import logging
import math
import os
from pathlib import Path
import subprocess
import time
from typing import Any, Dict, List, Optional, Tuple
import uuid

from spike_core.detector import detect_spikes
from spike_core.models import ChatEvent, DetectorConfig, Spike
from spike_core.windows import compute_clip_window

from .models import GapRecord, LiveConfig, LiveSession, QueueItem
from .cutter import extract_clip, find_covering_segments, probe_duration
from .queue import global_queue

logger = logging.getLogger("live_clipper.review")


def inspect_session_recording(session_dir: Path) -> Tuple[bool, float, Optional[Dict[str, Any]]]:
    """Inspect whether a recording is available on disk and calculate its duration.

    Returns:
        (has_recording, duration_sec, buffer_index)
    """
    # Check recording folder first (full mode), then buffer (rolling mode if kept)
    for folder_name in ("recording", "buffer"):
        index_path = session_dir / folder_name / "index.json"
        if index_path.exists():
            try:
                with open(index_path, "r", encoding="utf-8") as f:
                    b_index = json.load(f)
                segments = b_index.get("segments", [])
                if segments:
                    # Verify at least one segment file actually exists on disk
                    existing_segs = []
                    for seg in segments:
                        raw_p = seg.get("path")
                        if not raw_p and "file" in seg:
                            p = session_dir / folder_name / seg["file"]
                        else:
                            p = Path(raw_p) if raw_p else None
                        if p and p.exists():
                            existing_segs.append(seg)

                    if existing_segs:
                        oldest = min(float(s.get("start_sec", s.get("session_start", 0.0))) for s in existing_segs)
                        latest = max(
                            float(s.get("end_sec", float(s.get("start_sec", s.get("session_start", 0.0))) + float(s.get("duration", 0.0))))
                            for s in existing_segs
                        )
                        return True, max(0.0, latest - oldest), b_index
            except Exception as e:
                logger.warning(f"Error reading recording index {index_path}: {e}")

    # Also check for a single continuous recording file
    for candidate in ("continuous.mp4", "recording.mp4", "full.mp4"):
        cand_path = session_dir / candidate
        if cand_path.exists():
            dur = probe_duration(cand_path)
            if dur is not None and dur > 0:
                mock_index = {
                    "mode": "full",
                    "segments": [{
                        "file": candidate,
                        "path": str(cand_path.resolve()),
                        "start_sec": 0.0,
                        "duration": dur,
                        "end_sec": dur,
                    }]
                }
                return True, dur, mock_index

    return False, 0.0, None


def load_session_events(events_path: Path) -> List[ChatEvent]:
    """Load events from events.jsonl into ChatEvent objects."""
    events: List[ChatEvent] = []
    if not events_path.exists():
        return events

    try:
        with open(events_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    events.append(
                        ChatEvent(
                            t=float(obj.get("t", 0.0)),
                            user=str(obj.get("user", "")),
                            text=str(obj.get("text", "")),
                            emotes=int(obj.get("emotes", 0)),
                            is_bot=bool(obj.get("is_bot", False)),
                        )
                    )
                except Exception:
                    continue
    except Exception as e:
        logger.warning(f"Error loading events from {events_path}: {e}")

    return events


def review_session(
    session_dir: Path,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Execute after-stream review on a saved session.

    Runs spike_core's batch detector on events.jsonl with configurable parameters,
    computes time-series data for visualization, and reports recording availability.
    """
    params = params or {}
    s_json_path = session_dir / "session.json"
    session_data: Dict[str, Any] = {}
    if s_json_path.exists():
        try:
            with open(s_json_path, "r", encoding="utf-8") as f:
                session_data = json.load(f)
        except Exception:
            pass

    session_id = session_data.get("id", session_dir.name)
    has_rec, rec_dur, _ = inspect_session_recording(session_dir)

    # 1. Load chat events
    events = load_session_events(session_dir / "events.jsonl")
    events_total = len(events)

    # 2. Extract or override detector parameters
    bin_sec = float(params.get("bin_sec", 5.0))
    ratio_threshold = float(params.get("ratio_threshold", params.get("z_threshold", 3.0)))
    min_count = int(params.get("min_count", 5))
    min_spike_score = float(params.get("min_spike_score", 2.0))
    baseline_sec = float(params.get("baseline_sec", 300.0))
    before_sec = float(params.get("before_sec", 25.0))
    after_sec = float(params.get("after_sec", 10.0))
    min_len = float(params.get("min_len", 15.0))
    max_len = float(params.get("max_len", 60.0))

    cfg = DetectorConfig(
        bin_sec=bin_sec,
        ratio_threshold=ratio_threshold,
        min_count=min_count,
        baseline_sec=baseline_sec,
        before_sec=before_sec,
        after_sec=after_sec,
        min_len=min_len,
        max_len=max_len,
    )

    # 3. Run batch detector
    detected_spikes, raw_series = detect_spikes(events, config=cfg)

    # Filter by min_spike_score if provided
    filtered_spikes = [s for s in detected_spikes if s.score >= min_spike_score]

    # 4. Format graph series points with spike indicators
    spike_onsets = {s.onset for s in filtered_spikes}
    series_points = []
    for p in raw_series:
        t_bin = p["t"]
        has_spike = any(abs(t_bin - s_onset) <= bin_sec for s_onset in spike_onsets)
        series_points.append({
            "t": round(t_bin, 1),
            "count": p.get("count", 0),
            "baseline": round(p.get("baseline", 1.0), 2),
            "score": round(p.get("count", 0) / max(p.get("baseline", 1.0), 1.0), 2),
            "has_spike": has_spike,
        })

    message = None
    if not has_rec:
        rec_mode = session_data.get("config", {}).get("recording_mode", "rolling")
        if rec_mode == "rolling":
            message = "Full recording was not kept (session used rolling buffer mode without preservation)."
        else:
            message = "Recording video files not found on disk."

    return {
        "session_id": session_id,
        "has_recording": has_rec,
        "recording_duration_sec": round(rec_dur, 1),
        "events_total": events_total,
        "spikes": [asdict(s) for s in filtered_spikes],
        "series": series_points,
        "youtube_metadata": (
            json.loads((session_dir / "youtube_metadata.json").read_text(encoding="utf-8"))
            if (session_dir / "youtube_metadata.json").exists()
            else None
        ),
        "config_used": {
            "bin_sec": bin_sec,
            "ratio_threshold": ratio_threshold,
            "min_count": min_count,
            "min_spike_score": min_spike_score,
            "baseline_sec": baseline_sec,
        },
        "message": message,
    }


def cut_review_clip(
    session_dir: Path,
    session: LiveSession,
    start_sec: float,
    end_sec: float,
    title: Optional[str] = None,
    spike_dict: Optional[Dict[str, Any]] = None,
    ffmpeg_path: str = "ffmpeg",
    ffprobe_path: str = "ffprobe",
) -> Tuple[Optional[QueueItem], Optional[str]]:
    """Extract a clip of a specified range from the session recording into the queue."""
    if start_sec < 0 or end_sec <= start_sec:
        return None, f"Invalid time range: start_sec={start_sec}, end_sec={end_sec}"

    duration = end_sec - start_sec
    if duration > 180.0:
        return None, f"Requested duration ({duration:.1f}s) exceeds maximum allowed 180s."

    has_rec, rec_dur, b_index = inspect_session_recording(session_dir)
    if not has_rec or not b_index:
        return None, "Recording is not available for this session."

    buffer_dir = session_dir / ("buffer" if session.config.recording_mode == "rolling" else "recording")

    # Find covering segments
    covering = find_covering_segments(start_sec, end_sec, b_index, buffer_dir=buffer_dir)
    if not covering:
        return None, "No covering video segments found for requested range."

    clip_id = str(uuid.uuid4())
    clips_dir = session_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    out_clip_path = clips_dir / f"{clip_id}.mp4"

    ok = extract_clip(
        covering_segments=covering,
        start_rec=start_sec,
        end_rec=end_sec,
        out_path=out_clip_path,
        ffmpeg_path=ffmpeg_path,
        ffprobe_path=ffprobe_path,
    )
    if not ok:
        return None, "FFmpeg extraction or duration verification failed."

    # Generate thumbnail
    thumb_path = clips_dir / f"{clip_id}.jpg"
    try:
        subprocess.run(
            [ffmpeg_path, "-y", "-ss", "00:00:01", "-i", str(out_clip_path), "-frames:v", "1", "-q:v", "2", str(thumb_path)],
            capture_output=True,
            timeout=10.0,
        )
    except Exception:
        pass

    tags = ["after_stream_review"]
    score = 0.0
    spike_id = ""
    if spike_dict:
        spike_id = str(spike_dict.get("id", ""))
        score = float(spike_dict.get("score", 0.0))
        if "tags" in spike_dict and isinstance(spike_dict["tags"], list):
            tags.extend(spike_dict["tags"])

    if title:
        tags.append(f"title:{title[:30]}")

    item = QueueItem(
        id=clip_id,
        session_id=session.id,
        spike_id=spike_id,
        clip_path=str(out_clip_path.resolve()),
        status="pending_review",
        start_t=start_sec,
        end_t=end_sec,
        duration=round(duration, 3),
        score=score,
        tags=list(dict.fromkeys(tags)),
        hook_mode=session.config.hook_mode,
        keep_forever=True,  # Protect manually cut review clips
    )

    global_queue.add_item(item, session_dir)
    return item, None
