"""Channel live status probe using Streamlink (Phase 5, Task 2)."""
import json
import logging
import os
import subprocess
from typing import Optional

logger = logging.getLogger("live_clipper.stream_probe")


def check_channel_live(
    channel: str,
    platform: str = "kick",
    streamlink_path: str = "streamlink",
    timeout_sec: float = 12.0,
    strict: bool = False,
) -> bool:
    """Probe whether a channel is currently broadcasting live via Streamlink --json.

    Requires no user accounts or platform credentials.
    Returns True if playable streams are found, False if offline or error.
    """
    clean_channel = channel.strip().lstrip("#")
    if platform == "kick":
        url = f"https://kick.com/{clean_channel}"
    elif platform == "twitch":
        url = f"https://twitch.tv/{clean_channel}"
    elif platform == "youtube":
        if clean_channel.startswith("http"):
            url = clean_channel
        else:
            ch = clean_channel.lstrip("@")
            url = f"https://www.youtube.com/@{ch}/live"
    else:
        url = clean_channel if clean_channel.startswith("http") else f"https://{clean_channel}"

    cmd = [
        os.environ.get("STREAM_RECORDER_PATH") or streamlink_path,
        "--json",
        url,
    ]
    try:
        res = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
        )
        if res.returncode == 0 and res.stdout:
            try:
                data = json.loads(res.stdout)
                streams = data.get("streams", {})
                if "streams" in data and isinstance(streams, dict):
                    return bool(streams)
            except json.JSONDecodeError:
                pass
        if strict and not any(term in (res.stdout + res.stderr).lower() for term in
                              ("no playable streams", "offline", "is not live", "no streams found")):
            raise RuntimeError("Could not verify live status. Check Streamlink and the channel handle.")
        return False
    except subprocess.TimeoutExpired:
        if strict:
            raise RuntimeError("Live check timed out")
        logger.warning(f"Streamlink live probe timed out for {url}")
        return False
    except Exception as e:
        if strict:
            raise
        logger.warning(f"Streamlink live probe failed for {url}: {e}")
        return False
