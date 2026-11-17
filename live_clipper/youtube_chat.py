"""YouTube live stream and VOD replay chat source using direct YouTubei API and yt-dlp.

Pulls live chat directly via YouTube's YouTubei internal HTTP API in real-time
with zero subprocess overhead, with automatic fallback to yt-dlp for VOD replay.
Yields ChatEvent instances stamped with session clock time.
"""
import asyncio
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
from typing import AsyncIterator, Dict, List, Optional, Tuple

import httpx

from spike_core.models import ChatEvent
from .chat_source import ChatSource

logger = logging.getLogger("live_clipper.youtube_chat")

_BOT_NAMES = {"nightbot", "streamelements", "moobot", "streamlabs", "fossabot", "restreambot"}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def normalize_youtube_url(channel_or_url: str) -> str:
    """Normalize a YouTube handle, video ID, or URL into a playable URL."""
    s = channel_or_url.strip()
    if s.startswith("http://") or s.startswith("https://"):
        return s
    if "youtube.com" in s.lower() or "youtu.be" in s.lower():
        return f"https://{s.lstrip('/')}"
    # Video ID (11 chars, alphanumeric + _ -)
    if re.match(r"^[a-zA-Z0-9_-]{11}$", s):
        return f"https://www.youtube.com/watch?v={s}"
    # Channel handle (@channel)
    if s.startswith("@"):
        return f"https://www.youtube.com/{s}/live"
    # Channel ID (UC...)
    if s.startswith("UC") and len(s) >= 20:
        return f"https://www.youtube.com/channel/{s}/live"
    # Fallback to handle format
    return f"https://www.youtube.com/@{s}/live"


def extract_video_id(url_or_id: str) -> Optional[str]:
    """Extract the 11-character YouTube video ID from a URL or bare string."""
    s = url_or_id.strip()
    # Check if raw 11-char ID
    if re.match(r"^[a-zA-Z0-9_-]{11}$", s):
        return s
    # Patterns for v=..., youtu.be/..., live/...
    m = re.search(r"(?:v=|youtu\.be\/|live\/|embed\/)([a-zA-Z0-9_-]{11})", s)
    if m:
        return m.group(1)
    return None


def extract_chat_text(item: dict) -> str:
    """Extract plain text from YouTube message runs, converting emojis to shortcuts."""
    runs = item.get("message", {}).get("runs", [])
    out = []
    for r in runs:
        if "text" in r:
            out.append(r["text"])
        elif "emoji" in r:
            sc = r["emoji"].get("shortcuts") or [r["emoji"].get("emojiId", "")]
            out.append(sc[0] if sc else "")
    return "".join(out)


def parse_chat_action(action: dict, now_offset: float = 0.0, rec_start: Optional[float] = None) -> List[ChatEvent]:
    """Parse a single liveChat action dict into ChatEvent instances."""
    events: List[ChatEvent] = []
    item = action.get("addChatItemAction", {}).get("item", {})
    if not item and "item" in action:
        item = action["item"]

    for kind in ("liveChatTextMessageRenderer", "liveChatPaidMessageRenderer", "liveChatMembershipItemRenderer"):
        m = item.get(kind)
        if not m:
            continue

        author = (
            m.get("authorName", {}).get("simpleText")
            or m.get("authorName", {}).get("runs", [{}])[0].get("text", "")
            or "viewer"
        )
        msg_text = extract_chat_text(m)
        if not msg_text:
            continue

        # Compute stream timestamp
        t = now_offset
        if m.get("timestampUsec") and rec_start:
            calc_t = (int(m["timestampUsec"]) / 1e6) - rec_start
            if calc_t >= 0:
                t = calc_t

        is_bot = author.lower() in _BOT_NAMES or author.lower().endswith("bot")
        words = msg_text.split()
        emotes = sum(1 for w in words if w.isupper() and len(w) > 2)

        events.append(
            ChatEvent(
                t=round(float(t), 3),
                user=author,
                text=msg_text,
                emotes=emotes,
                is_bot=is_bot,
            )
        )
    return events


def parse_chat_line(line: str, rec_start: Optional[float] = None, now_offset: float = 0.0) -> List[ChatEvent]:
    """Parse a single JSON line from yt-dlp or saved replay file."""
    line = line.strip()
    if not line:
        return []
    try:
        d = json.loads(line)
    except Exception:
        return []

    r = d.get("replayChatItemAction", {})
    off = r.get("videoOffsetTimeMsec") or d.get("videoOffsetTimeMsec")
    offset_val = (int(off) / 1000.0) if (off is not None and not d.get("isLive", False)) else now_offset

    actions = []
    if "actions" in r:
        actions.extend(r["actions"])
    elif "actions" in d:
        actions.extend(d["actions"])
    else:
        actions.append(d)

    events = []
    for a in actions:
        events.extend(parse_chat_action(a, now_offset=offset_val, rec_start=rec_start))
    return events


class YouTubeChatSource(ChatSource):
    """Real-time YouTube chat consumer using direct YouTubei API with yt-dlp fallback."""

    def __init__(
        self,
        channel_or_url: str,
        work_dir: Optional[Path] = None,
        clock_callback: Optional[callable] = None,
    ) -> None:
        self.raw_input = channel_or_url
        self.url = normalize_youtube_url(channel_or_url)
        self.work_dir = Path(work_dir) if work_dir else Path.cwd()
        self.clock_callback = clock_callback

        self._state = "idle"
        self._queue: asyncio.Queue[ChatEvent] = asyncio.Queue()
        self._gaps: List[Tuple[float, float]] = []
        self._stream_task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

        self._rec_start_wall: Optional[float] = None
        self._ytdlp_proc: Optional[subprocess.Popen] = None

    @property
    def state(self) -> str:
        return self._state

    def get_and_clear_gaps(self) -> List[Tuple[float, float]]:
        res = list(self._gaps)
        self._gaps.clear()
        return res

    def _get_current_stream_time(self) -> float:
        if self.clock_callback:
            try:
                return float(self.clock_callback())
            except Exception:
                pass
        if self._rec_start_wall:
            return max(0.0, time.time() - self._rec_start_wall)
        return 0.0

    async def connect(self) -> None:
        """Connect to YouTube live chat and launch streaming worker."""
        self._state = "connecting"
        self._stop_event.clear()
        self._rec_start_wall = time.time()
        self.work_dir.mkdir(parents=True, exist_ok=True)

        self._stream_task = asyncio.create_task(self._chat_stream_worker())

    async def _resolve_video_id(self, client: httpx.AsyncClient) -> Optional[str]:
        """Resolve YouTube video ID from URL or channel link."""
        vid = extract_video_id(self.url)
        if vid:
            return vid

        # If it's a channel URL like @channel/live, fetch page to find canonical video ID
        try:
            logger.info(f"Resolving video ID from YouTube channel URL: {self.url}")
            res = await client.get(self.url, headers=_HEADERS, timeout=12.0, follow_redirects=True)
            text = res.text
            # Look for "videoId":"..."
            m = re.search(r'"videoId":"([a-zA-Z0-9_-]{11})"', text)
            if m:
                found_id = m.group(1)
                logger.info(f"Resolved YouTube live stream video ID: {found_id}")
                return found_id
            # Also check canonical link
            m2 = re.search(r'<link rel="canonical" href="https://www.youtube.com/watch\?v=([a-zA-Z0-9_-]{11})">', text)
            if m2:
                return m2.group(1)
        except Exception as e:
            logger.warning(f"Failed to resolve video ID from {self.url}: {e}")

        return None

    async def _chat_stream_worker(self) -> None:
        """Main worker: streams chat directly via YouTubei API; falls back to yt-dlp if needed."""
        async with httpx.AsyncClient(headers=_HEADERS) as client:
            video_id = await self._resolve_video_id(client)

            if video_id:
                success = await self._stream_via_youtubei_api(client, video_id)
                if success:
                    return

            # Fallback to yt-dlp live chat tailing
            logger.info(f"Streaming chat via yt-dlp fallback for {self.url}")
            await self._stream_via_ytdlp()

    async def _stream_via_youtubei_api(self, client: httpx.AsyncClient, video_id: str) -> bool:
        """Stream real-time live chat directly from YouTube's get_live_chat API."""
        chat_page_url = f"https://www.youtube.com/live_chat?v={video_id}"
        logger.info(f"Connecting to YouTube Live Chat API for video {video_id}")

        try:
            r = await client.get(chat_page_url, timeout=12.0)
            if r.status_code != 200:
                logger.warning(f"YouTube live_chat page returned HTTP {r.status_code}")
                return False

            api_key_m = re.search(r'"INNERTUBE_API_KEY":"([^"]+)"', r.text)
            if not api_key_m:
                logger.warning("Could not extract INNERTUBE_API_KEY from live_chat page.")
                return False
            api_key = api_key_m.group(1)

            # Extract continuation token - explicitly prefer unfiltered "Live chat" over filtered "Top chat"
            continuation = None
            init_data_m = re.search(r'window\["ytInitialData"\]\s*=\s*(\{.+?\});</script>', r.text)
            if init_data_m:
                try:
                    data = json.loads(init_data_m.group(1))
                    header = data.get("contents", {}).get("liveChatRenderer", {}).get("header", {}).get("liveChatHeaderRenderer", {})
                    sub_menu = header.get("viewSelector", {}).get("sortFilterSubMenuRenderer", {}).get("subMenuItems", [])
                    for item in sub_menu:
                        title = (item.get("title") or "").lower()
                        # "Live chat" shows all messages; "Top chat" filters out spam/short messages
                        if "live" in title:
                            continuation = item.get("continuation", {}).get("reloadContinuationData", {}).get("continuation")
                            logger.info("Selected unfiltered 'Live chat' stream (all comments firehose)!")
                            break
                except Exception as e:
                    logger.debug(f"Failed to parse ytInitialData subMenuItems: {e}")

            if not continuation:
                cont_m = re.search(r'"continuation":"([^"]+)"', r.text)
                if cont_m:
                    continuation = cont_m.group(1)

            if not continuation:
                logger.warning("Could not find any live chat continuation token.")
                return False

            post_url = f"https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key={api_key}"

            self._state = "connected"
            logger.info("Successfully connected to YouTube Live Chat HTTP API (Unfiltered Firehose)!")

            failure_count = 0
            while not self._stop_event.is_set():
                if not continuation:
                    logger.info("YouTube chat continuation exhausted (stream may have ended).")
                    break

                now_t = self._get_current_stream_time()
                payload = {
                    "context": {
                        "client": {
                            "clientName": "WEB",
                            "clientVersion": "2.20240101.00.00"
                        }
                    },
                    "continuation": continuation
                }

                try:
                    res = await client.post(post_url, json=payload, timeout=10.0)
                    if res.status_code != 200:
                        failure_count += 1
                        if failure_count >= 5:
                            logger.warning(f"YouTube chat API persistent error: HTTP {res.status_code}")
                            break
                        await asyncio.sleep(2.0)
                        continue

                    failure_count = 0
                    data = res.json()
                    chat_cont = data.get("continuationContents", {}).get("liveChatContinuation", {})
                    actions = chat_cont.get("actions", [])

                    for a in actions:
                        events = parse_chat_action(a, now_offset=now_t, rec_start=self._rec_start_wall)
                        for ev in events:
                            await self._queue.put(ev)

                    # Extract next continuation and recommended poll interval
                    conts = chat_cont.get("continuations", [])
                    continuation = None
                    timeout_ms = 1500
                    for c in conts:
                        for ck in ("invalidationContinuationData", "timedContinuationData", "liveChatReplayContinuationData"):
                            if ck in c:
                                continuation = c[ck].get("continuation")
                                timeout_ms = c[ck].get("timeoutMs", 1500)
                                break

                    # Dynamic low-latency polling: prevents drops on high-speed chat
                    sleep_sec = max(0.2, min(1.0, (timeout_ms / 1000.0) if timeout_ms else 0.5))
                    await asyncio.sleep(sleep_sec)

                except asyncio.CancelledError:
                    break
                except Exception as e:
                    failure_count += 1
                    logger.debug(f"Transient error fetching YouTube live chat: {e}")
                    await asyncio.sleep(2.0)

            return True
        except asyncio.CancelledError:
            return True
        except Exception as e:
            logger.warning(f"Error in YouTubei API streaming loop: {e}")
            return False

    async def _stream_via_ytdlp(self) -> None:
        """Fallback: uses yt-dlp with --no-part and tails the generated file."""
        chat_dir = self.work_dir / "youtube_chat"
        chat_dir.mkdir(parents=True, exist_ok=True)
        chat_file = chat_dir / "chat.live_chat.json"

        # Locate yt-dlp
        yt_bin = shutil.which("yt-dlp")
        cmd_base = [yt_bin] if yt_bin else [sys.executable, "-m", "yt_dlp"]

        cmd = [
            *cmd_base,
            "--no-part",
            "--wait-for-video", "30",
            "--skip-download",
            "--write-subs",
            "--sub-langs", "live_chat",
            "-o", "chat",
            self.url,
        ]

        flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        try:
            self._ytdlp_proc = subprocess.Popen(
                cmd,
                cwd=str(chat_dir),
                stdout=subprocess.DEVNULL,
                stderr=open(chat_dir / "chat_stderr.log", "w", encoding="utf-8", errors="replace"),
                creationflags=flags,
            )
            self._state = "connected"

            # Wait for file to appear
            for _ in range(40):
                if self._stop_event.is_set():
                    return
                # Check if chat.live_chat.json or fragments exist
                if chat_file.exists():
                    break
                # Also check part/Frag files
                hits = list(chat_dir.glob("chat.live_chat.json*"))
                if hits and hits[0].stat().st_size > 0:
                    chat_file = hits[0]
                    break
                await asyncio.sleep(0.5)

            if not chat_file.exists():
                logger.warning("yt-dlp did not produce chat file.")
                self._state = "disconnected"
                return

            with open(chat_file, "r", encoding="utf-8", errors="replace") as f:
                while not self._stop_event.is_set():
                    line = f.readline()
                    if line:
                        now_t = self._get_current_stream_time()
                        evs = parse_chat_line(line, rec_start=self._rec_start_wall, now_offset=now_t)
                        for ev in evs:
                            await self._queue.put(ev)
                    else:
                        if self._ytdlp_proc and self._ytdlp_proc.poll() is not None:
                            break
                        await asyncio.sleep(0.3)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"yt-dlp fallback error: {e}")
            self._state = "disconnected"

    async def events(self) -> AsyncIterator[ChatEvent]:
        """Yield chat events as they arrive from YouTube."""
        while not self._stop_event.is_set() or not self._queue.empty():
            try:
                ev = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                yield ev
            except asyncio.TimeoutError:
                continue

    async def close(self) -> None:
        """Terminate chat tasks and any subprocesses."""
        self._state = "disconnected"
        self._stop_event.set()

        if self._stream_task and not self._stream_task.done():
            self._stream_task.cancel()
            try:
                await self._stream_task
            except asyncio.CancelledError:
                pass

        if self._ytdlp_proc:
            try:
                self._ytdlp_proc.terminate()
                await asyncio.to_thread(self._ytdlp_proc.wait, timeout=3.0)
            except Exception:
                try:
                    self._ytdlp_proc.kill()
                except Exception:
                    pass
            self._ytdlp_proc = None
