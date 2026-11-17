"""Channel live status probe using Streamlink (Phase 5, Task 2)."""
import json
import logging
import subprocess
from typing import Optional

logger = logging.getLogger("live_clipper.stream_probe")


def check_channel_live(
    channel: str,
    platform: str = "kick",
    streamlink_path: str = "streamlink",
    timeout_sec: float = 12.0,
) -> bool:
    """Probe whether a channel is currently broadcasting live via Streamlink --json.

    Requires no user accounts or platform credentials.
    Returns True if playable streams are found, False if offline or error.
    """
    clean_channel = channel.strip().lower().lstrip("#")
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
        streamlink_path,
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
                if streams and isinstance(streams, dict):
                    return True
            except json.JSONDecodeError:
                pass
        return False
    except subprocess.TimeoutExpired:
        logger.warning(f"Streamlink live probe timed out for {url}")
        return False
    except Exception as e:
        logger.warning(f"Streamlink live probe failed for {url}: {e}")
        return False
