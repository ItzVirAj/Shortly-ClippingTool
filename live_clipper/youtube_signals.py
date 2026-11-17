"""YouTube retention heatmap and metadata extractor using yt-dlp.

Pulls YouTube's viewer retention graph ("Most replayed" curve) to pinpoint
the most watched moments for highlights and automated clipping, and extracts
stream / VOD metadata.
"""
import asyncio
import json
import logging
import re
import shutil
import subprocess
import sys
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("live_clipper.youtube_signals")


def normalize_youtube_url(url_or_channel: str) -> str:
    """Normalize input into a full YouTube URL."""
    s = url_or_channel.strip()
    if s.startswith("http://") or s.startswith("https://"):
        return s
    if "youtube.com" in s.lower() or "youtu.be" in s.lower():
        return f"https://{s.lstrip('/')}"
    if re.match(r"^[a-zA-Z0-9_-]{11}$", s):
        return f"https://www.youtube.com/watch?v={s}"
    if s.startswith("@"):
        return f"https://www.youtube.com/{s}/live"
    if s.startswith("UC") and len(s) >= 20:
        return f"https://www.youtube.com/channel/{s}/live"
    return f"https://www.youtube.com/@{s}/live"


def _find_ytdlp_cmd() -> List[str]:
    yt_bin = shutil.which("yt-dlp")
    if yt_bin:
        return [yt_bin]
    return [sys.executable, "-m", "yt_dlp"]


def fetch_youtube_metadata(url_or_channel: str, timeout_sec: float = 30.0) -> Dict[str, Any]:
    """Fetch YouTube metadata including the 'Most replayed' heatmap using yt-dlp -J."""
    url = normalize_youtube_url(url_or_channel)
    cmd = [
        *_find_ytdlp_cmd(),
        "--dump-single-json",
        "--skip-download",
        "--no-playlist",
        url,
    ]

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            encoding="utf-8",
            errors="replace",
        )
        if proc.returncode != 0:
            logger.warning(f"yt-dlp failed for {url}: {proc.stderr[:200]}")
            return {"url": url, "error": proc.stderr[:300]}

        data = json.loads(proc.stdout)
        heatmap = data.get("heatmap") or []

        return {
            "id": data.get("id", ""),
            "title": data.get("title", ""),
            "channel": data.get("uploader") or data.get("channel", ""),
            "channel_id": data.get("channel_id", ""),
            "duration": float(data.get("duration") or 0.0),
            "live_status": data.get("live_status", "not_live"),
            "thumbnail": data.get("thumbnail", ""),
            "url": data.get("webpage_url", url),
            "heatmap": heatmap,
        }
    except subprocess.TimeoutExpired:
        logger.warning(f"yt-dlp metadata timed out for {url}")
        return {"url": url, "error": "timeout"}
    except Exception as e:
        logger.error(f"Failed to fetch YouTube metadata: {e}")
        return {"url": url, "error": str(e)}


def extract_heatmap_peaks(
    heatmap: List[Dict[str, Any]],
    duration: float = 0.0,
    min_value: float = 0.4,
    gap_sec: float = 45.0,
    clip_len: float = 45.0,
    top_n: int = 15,
) -> List[Dict[str, Any]]:
    """Pinpoint peak re-watched moments from YouTube's retention graph.

    Args:
        heatmap: List of heatmap points [{'start_time': 0, 'end_time': 10, 'value': 0.8}, ...]
        duration: Total video duration in seconds.
        min_value: Minimum retention curve value (0.0 - 1.0) to qualify as a peak.
        gap_sec: Minimum spacing between chosen peak highlights.
        clip_len: Target duration for the resulting highlight window.
        top_n: Maximum peaks to return.

    Returns:
        List of candidate peak moments sorted by score descending.
    """
    pts = [h for h in heatmap if h.get("value") is not None]
    if not pts:
        return []

    peaks = []
    for i, h in enumerate(pts):
        v = float(h.get("value", 0.0))
        left = float(pts[i - 1]["value"]) if i > 0 else -1.0
        right = float(pts[i + 1]["value"]) if i + 1 < len(pts) else -1.0
        start_t = float(h.get("start_time", 0.0))

        # Local maximum condition and skip intro credits (start > 5s)
        if v >= min_value and v >= left and v >= right and start_t > 5.0:
            peaks.append(h)

    # Sort candidates by intensity descending
    peaks.sort(key=lambda h: -float(h.get("value", 0.0)))

    chosen: List[Dict[str, Any]] = []
    for h in peaks:
        v = float(h.get("value", 0.0))
        mid = (float(h.get("start_time", 0.0)) + float(h.get("end_time", 0.0))) / 2.0
        start = max(0.0, mid - (clip_len * 0.55))
        end = (start + clip_len) if duration <= 0 else min(duration, start + clip_len)

        # Enforce minimum gap from previously chosen moments
        if all(end <= c["start"] or start >= c["end"] for c in chosen):
            if all(abs(mid - c["peak"]) > gap_sec for c in chosen):
                chosen.append({
                    "start": round(start, 2),
                    "end": round(end, 2),
                    "peak": round(mid, 2),
                    "score": round(v * 100.0, 1),
                    "value": round(v, 3),
                    "source": "most_replayed",
                })
        if len(chosen) >= top_n:
            break

    # Return ordered chronologically for UI display
    return sorted(chosen, key=lambda m: m["start"])


async def async_fetch_youtube_signals(url_or_channel: str) -> Dict[str, Any]:
    """Async wrapper to fetch metadata and calculate heatmap peaks without blocking."""
    meta = await asyncio.to_thread(fetch_youtube_metadata, url_or_channel)
    heatmap = meta.get("heatmap") or []
    duration = meta.get("duration", 0.0)
    peaks = extract_heatmap_peaks(heatmap, duration=duration)
    meta["heatmap_peaks"] = peaks
    return meta
