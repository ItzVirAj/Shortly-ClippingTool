"""Cutter module for Live Clipper (Section 7.5 of LIVE_CLIPPER_SPEC).

Performs window calculation, buffer index time mapping, gap checking,
FFmpeg stream-copy extraction, ffprobe duration verification, and QueueItem generation.
"""
import json
import logging
import os
import subprocess
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from live_clipper.models import GapRecord, LiveConfig, LiveSession, QueueItem
from spike_core.models import Spike
from spike_core.windows import compute_clip_window

logger = logging.getLogger("live_clipper.cutter")


def calculate_clip_window(
    spike: Spike,
    config: LiveConfig,
    session_duration: float = 86400.0,
) -> Tuple[float, float, List[str]]:
    """Compute clip start and end in session-clock time factoring in sync_offset_sec."""
    cfg = config.detector
    # Use spike_core compute_clip_window
    start, end = compute_clip_window(
        onset=spike.onset,
        spike_end=spike.end,
        duration=session_duration,
        before_sec=cfg.before_sec,
        after_sec=cfg.after_sec,
        min_len=cfg.min_len,
        max_len=cfg.max_len,
        sync_offset_sec=config.sync_offset_sec,
    )
    tags = list(spike.tags)
    return start, end, tags



def map_to_recording_time(session_t: float, recording_offset_sec: Optional[float]) -> float:
    """Map session-clock time to recording video time."""
    offset = recording_offset_sec or 0.0
    return max(0.0, session_t - offset)


def _normalize_segment(s: Dict[str, Any], buffer_dir: Optional[Path] = None) -> Dict[str, Any]:
    """Normalize segment dictionary fields to ensure start_sec, end_sec, and path exist."""
    start_sec = float(s.get("start_sec", s.get("session_start", 0.0)))
    duration = float(s.get("duration", 0.0))
    end_sec = float(s.get("end_sec", start_sec + duration))
    raw_path = s.get("path")
    if not raw_path and "file" in s and buffer_dir:
        path = str((buffer_dir / s["file"]).resolve())
    else:
        path = str(raw_path or "")
    return {
        "path": path,
        "start_sec": start_sec,
        "duration": duration,
        "end_sec": end_sec,
    }


def check_buffer_and_gaps(
    start_rec: float,
    end_rec: float,
    buffer_index: Dict[str, Any],
    gaps: List[GapRecord],
    min_len: float,
    buffer_dir: Optional[Path] = None,
) -> Tuple[Optional[float], Optional[float], List[str], Optional[str]]:
    """Check buffer availability and gap overlaps.

    Returns:
        (clamped_start, clamped_end, tags, error_reason)
    """
    raw_segments = buffer_index.get("segments", [])
    if not raw_segments:
        return None, None, [], "No video segments available in buffer"

    segments = [_normalize_segment(s, buffer_dir) for s in raw_segments]
    oldest_t = min(float(s["start_sec"]) for s in segments)
    latest_t = max(float(s["end_sec"]) for s in segments)

    tags: List[str] = []
    adj_start = start_rec
    adj_end = end_rec

    if adj_start < oldest_t:
        adj_start = oldest_t
        if "clamped" not in tags:
            tags.append("clamped")

    if adj_end > latest_t:
        adj_end = latest_t
        if "clamped" not in tags:
            tags.append("clamped")

    if adj_end - adj_start < min_len:
        return None, None, tags, f"Remaining duration ({adj_end - adj_start:.1f}s) < min_len ({min_len:.1f}s)"

    # Check video gaps
    for g in gaps:
        if g.kind == "video":
            overlap_s = max(adj_start, g.start)
            overlap_e = min(adj_end, g.end)
            if overlap_e > overlap_s:
                overlap_dur = overlap_e - overlap_s
                if "near_gap" not in tags:
                    tags.append("near_gap")
                if overlap_dur > 3.0:
                    return None, None, tags, f"Video gap overlap ({overlap_dur:.1f}s) exceeds 3.0s threshold"

    return adj_start, adj_end, tags, None


def find_covering_segments(
    start_rec: float,
    end_rec: float,
    buffer_index: Dict[str, Any],
    buffer_dir: Optional[Path] = None,
) -> List[Dict[str, Any]]:
    """Return all segments overlapping the requested [start_rec, end_rec] window."""
    raw_segments = buffer_index.get("segments", [])
    covering = []
    for s in raw_segments:
        norm = _normalize_segment(s, buffer_dir)
        if norm["end_sec"] > start_rec and norm["start_sec"] < end_rec:
            covering.append(norm)
    covering.sort(key=lambda s: float(s["start_sec"]))
    return covering



def probe_duration(media_path: Path, ffprobe_path: str = "ffprobe") -> Optional[float]:
    """Inspect media file duration via ffprobe."""
    if not media_path.exists():
        return None
    try:
        cmd = [
            ffprobe_path,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(media_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=10.0)
        out = res.stdout.strip()
        return float(out) if out else None
    except Exception as e:
        logger.warning(f"ffprobe duration check failed for {media_path}: {e}")
        return None


def extract_clip(
    covering_segments: List[Dict[str, Any]],
    start_rec: float,
    end_rec: float,
    out_path: Path,
    ffmpeg_path: str = "ffmpeg",
    ffprobe_path: str = "ffprobe",
    timeout_sec: float = 60.0,
) -> bool:
    """Extract raw clip from covering segments using FFmpeg stream copy.

    Verifies duration with ffprobe within 2s of target; otherwise retries
    once with a fast re-encode.
    """
    if not covering_segments:
        return False

    out_path.parent.mkdir(parents=True, exist_ok=True)
    target_duration = end_rec - start_rec
    concat_txt: Optional[Path] = None

    try:
        if len(covering_segments) == 1:
            seg = covering_segments[0]
            offset_in_seg = max(0.0, start_rec - float(seg["start_sec"]))
            input_args = ["-ss", f"{offset_in_seg:.3f}", "-i", str(seg["path"])]
        else:
            # Build concat list file
            concat_txt = out_path.with_suffix(".concat.txt")
            with open(concat_txt, "w", encoding="utf-8") as f:
                for s in covering_segments:
                    p = Path(s["path"]).resolve().as_posix()
                    f.write(f"file '{p}'\n")

            offset_in_concat = max(0.0, start_rec - float(covering_segments[0]["start_sec"]))
            input_args = [
                "-f", "concat",
                "-safe", "0",
                "-i", str(concat_txt),
                "-ss", f"{offset_in_concat:.3f}",
            ]

        # Pass 1: Stream copy
        cmd = [
            ffmpeg_path,
            "-y",
            *input_args,
            "-t", f"{target_duration:.3f}",
            "-c", "copy",
            "-avoid_negative_ts", "make_zero",
            str(out_path),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_sec)
        if res.returncode != 0:
            logger.warning(f"FFmpeg stream copy exited with code {res.returncode}: {res.stderr[-200:]}")

        # Check duration
        dur = probe_duration(out_path, ffprobe_path=ffprobe_path)
        if dur is not None and abs(dur - target_duration) <= 2.0:
            return True

        logger.info(f"Stream copy duration mismatch ({dur} vs target {target_duration:.2f}s). Retrying with fast re-encode.")

        # Pass 2: Fast re-encode retry
        cmd_reencode = [
            ffmpeg_path,
            "-y",
            *input_args,
            "-t", f"{target_duration:.3f}",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-c:a", "aac",
            str(out_path),
        ]
        res_reencode = subprocess.run(cmd_reencode, capture_output=True, text=True, timeout=timeout_sec)
        if res_reencode.returncode != 0:
            logger.error(f"FFmpeg re-encode failed: {res_reencode.stderr[-200:]}")
            return False

        dur_reencode = probe_duration(out_path, ffprobe_path=ffprobe_path)
        if dur_reencode is not None and abs(dur_reencode - target_duration) <= 2.0:
            return True

        logger.error(f"Duration verification failed after re-encode: measured {dur_reencode}s, expected {target_duration:.2f}s")
        return False

    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        return False
    finally:
        if concat_txt and concat_txt.exists():
            try:
                concat_txt.unlink()
            except OSError:
                pass


def speech_bounds(transcript, duration, peak, minimum):
    """Trim quiet edges while retaining the reaction, lead-in and minimum clip length."""
    words = [word for segment in transcript.get("segments", []) for word in segment.get("words", [])
             if word.get("word", "").strip() and 0 <= word["start"] < word["end"] <= duration + 0.5]
    if len(words) < 3:
        return 0.0, duration
    start = max(0.0, min(words[0]["start"] - 0.5, peak - 4))
    end = min(duration, max(words[-1]["end"] + 0.75, peak + 3))
    start = max(0.0, min(start, end - minimum))
    return start, min(duration, max(end, start + minimum))


def cut_spike(
    spike: Spike,
    session: LiveSession,
    session_dir: Path,
    buffer_index: Dict[str, Any],
    ffmpeg_path: str = "ffmpeg",
    ffprobe_path: str = "ffprobe",
) -> Tuple[Optional[QueueItem], Optional[str]]:
    """Process a confirmed spike into an extracted raw clip and pending QueueItem.

    Returns:
        (queue_item, skip_or_error_reason)
    """
    # 1. Window math
    start_session, end_session, tags = calculate_clip_window(
        spike=spike,
        config=session.config,
    )

    # 2. Map to recording time
    start_rec = map_to_recording_time(start_session, session.recording_offset_sec)
    end_rec = map_to_recording_time(end_session, session.recording_offset_sec)

    buffer_dir = session_dir / ("buffer" if session.config.recording_mode == "rolling" else "recording")

    # 3. Buffer & gap rules
    clamped_start, clamped_end, adj_tags, err = check_buffer_and_gaps(
        start_rec=start_rec,
        end_rec=end_rec,
        buffer_index=buffer_index,
        gaps=session.gaps,
        min_len=session.config.detector.min_len,
        buffer_dir=buffer_dir,
    )
    if err is not None or clamped_start is None or clamped_end is None:
        return None, err

    all_tags = list(dict.fromkeys(tags + adj_tags))

    # 4. Covering segments
    covering = find_covering_segments(clamped_start, clamped_end, buffer_index, buffer_dir=buffer_dir)
    if not covering:
        return None, "No covering buffer segments found for clip range"

    # 5. Extract clip
    clip_id = str(uuid.uuid4())
    clips_dir = session_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    out_clip_path = clips_dir / f"{clip_id}.mp4"

    ok = extract_clip(
        covering_segments=covering,
        start_rec=clamped_start,
        end_rec=clamped_end,
        out_path=out_clip_path,
        ffmpeg_path=ffmpeg_path,
        ffprobe_path=ffprobe_path,
    )
    if not ok:
        return None, "FFmpeg extraction or duration verification failed"

    # Run ASR only on a buffered candidate. Preserve the first cut for sparse
    # speech, missing models, or an unsuccessful second extraction.
    trimmed = out_clip_path.with_suffix(".trim.mp4")
    try:
        from transcribe_backends import transcribe_media
        transcript = transcribe_media(str(out_clip_path))
        duration = clamped_end - clamped_start
        relative_peak = map_to_recording_time(spike.peak, session.recording_offset_sec) - clamped_start
        left, right = speech_bounds(transcript, duration, relative_peak, session.config.detector.min_len)
        if (left >= 1 or duration - right >= 1) and extract_clip(
            [{"start_sec": 0, "path": out_clip_path}], left, right, trimmed, ffmpeg_path, ffprobe_path
        ):
            trimmed.replace(out_clip_path)
            clamped_end = clamped_start + right
            clamped_start += left
            all_tags.append("speech_trimmed")
    except Exception as exc:
        logger.info("Keeping signal-based window for %s: %s", clip_id, exc)
    finally:
        trimmed.unlink(missing_ok=True)

    # 6. Create QueueItem
    duration = clamped_end - clamped_start
    item = QueueItem(
        id=clip_id,
        session_id=session.id,
        spike_id=spike.id,
        clip_path=str(out_clip_path.resolve()),
        status="pending_review",
        start_t=clamped_start + (session.recording_offset_sec or 0.0),
        end_t=clamped_end + (session.recording_offset_sec or 0.0),
        duration=round(duration, 3),
        score=spike.score,
        tags=all_tags,
        hook_mode=session.config.hook_mode,
        mirror_video=bool(session.config.mirror_video),
        webcam_mode=str(session.config.webcam_mode or "auto"),
        webcam_box=dict(session.config.webcam_box) if isinstance(session.config.webcam_box, dict) else None,
        channel=session.config.channel,
    )
    return item, None


def cut_manual_window(
    session: LiveSession,
    session_dir: Path,
    buffer_index: Dict[str, Any],
    start_session: float,
    end_session: float,
    clip_id: Optional[str] = None,
    ffmpeg_path: str = "ffmpeg",
    ffprobe_path: str = "ffprobe",
) -> Tuple[Optional[QueueItem], Optional[str]]:
    """Extract an exact user-requested [start_session, end_session] manual clip from the live buffer."""
    start_rec = map_to_recording_time(start_session, session.recording_offset_sec)
    end_rec = map_to_recording_time(end_session, session.recording_offset_sec)
    if end_rec <= start_rec:
        return None, "Manual cut window has non-positive duration"

    buffer_dir = session_dir / ("buffer" if session.config.recording_mode == "rolling" else "recording")
    requested_dur = end_rec - start_rec
    min_len = min(2.0, max(1.0, requested_dur * 0.5))

    clamped_start, clamped_end, adj_tags, err = check_buffer_and_gaps(
        start_rec=start_rec,
        end_rec=end_rec,
        buffer_index=buffer_index,
        gaps=session.gaps,
        min_len=min_len,
        buffer_dir=buffer_dir,
    )
    if err is not None or clamped_start is None or clamped_end is None:
        return None, err

    covering = find_covering_segments(clamped_start, clamped_end, buffer_index, buffer_dir=buffer_dir)
    if not covering:
        return None, "No covering buffer segments found for manual clip range"

    cid = clip_id or str(uuid.uuid4())
    clips_dir = session_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    out_clip_path = clips_dir / f"{cid}.mp4"

    ok = extract_clip(
        covering_segments=covering,
        start_rec=clamped_start,
        end_rec=clamped_end,
        out_path=out_clip_path,
        ffmpeg_path=ffmpeg_path,
        ffprobe_path=ffprobe_path,
    )
    if not ok:
        return None, "FFmpeg extraction or duration verification failed"

    duration = clamped_end - clamped_start
    all_tags = list(dict.fromkeys(["manual"] + adj_tags))
    item = QueueItem(
        id=cid,
        session_id=session.id,
        spike_id=f"manual:{cid[:8]}",
        clip_path=str(out_clip_path.resolve()),
        status="pending_review",
        start_t=clamped_start + (session.recording_offset_sec or 0.0),
        end_t=clamped_end + (session.recording_offset_sec or 0.0),
        duration=round(duration, 3),
        score=100.0,
        tags=all_tags,
        hook_mode=session.config.hook_mode,
        mirror_video=bool(session.config.mirror_video),
        webcam_mode=str(session.config.webcam_mode or "auto"),
        webcam_box=dict(session.config.webcam_box) if isinstance(session.config.webcam_box, dict) else None,
        channel=session.config.channel,
    )
    return item, None
