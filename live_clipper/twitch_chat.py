"""Twitch read-only anonymous IRC chat source (Section 7.2 of LIVE_CLIPPER_SPEC).

Connects to irc.chat.twitch.tv:6667 anonymously as justinfan<rand> to ingest
public chat events without requiring user credentials or write permissions.
"""
import asyncio
from datetime import datetime, timezone
import logging
import random
import re
import time
from typing import AsyncIterator, List, Optional, Tuple

from spike_core.models import ChatEvent
from .chat_source import ChatSource

logger = logging.getLogger("live_clipper.twitch_chat")

TWITCH_IRC_HOST = "irc.chat.twitch.tv"
TWITCH_IRC_PORT = 6667
_PRIVMSG_RE = re.compile(r"^:([a-zA-Z0-9_]+)![^ ]* PRIVMSG #[a-zA-Z0-9_]+ :(.*)$")
_BOT_NAMES = {"nightbot", "streamelements", "moobot", "streamlabs", "fossabot"}


def parse_irc_privmsg(line: str, now_t: float) -> Optional[ChatEvent]:
    """Parse a single IRC line into a ChatEvent if it is a PRIVMSG."""
    match = _PRIVMSG_RE.match(line.strip())
    if not match:
        return None
    user = match.group(1).lower()
    text = match.group(2)
    is_bot = user in _BOT_NAMES or user.endswith("bot")
    # Quick emote count heuristic (words repeated or caps)
    words = text.split()
    emotes = sum(1 for w in words if w.isupper() and len(w) > 2)
    return ChatEvent(
        t=now_t,
        user=user,
        text=text,
        emotes=emotes,
        is_bot=is_bot,
    )


class TwitchChatSource(ChatSource):
    """Anonymous read-only Twitch IRC chat client."""

    def __init__(
        self,
        channel: str,
        host: str = TWITCH_IRC_HOST,
        port: int = TWITCH_IRC_PORT,
    ) -> None:
        self.channel = channel.lower().lstrip("#")
        self.host = host
        self.port = port
        self._state = "idle"
        self._queue: asyncio.Queue[ChatEvent] = asyncio.Queue()
        self._gaps: List[Tuple[float, float]] = []
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._listen_task: Optional[asyncio.Task] = None
        self._closed = False
        self._clock_zero: float = time.monotonic()
        self._disconnect_time: Optional[float] = None

    @property
    def state(self) -> str:
        return self._state

    def get_and_clear_gaps(self) -> List[Tuple[float, float]]:
        """Return and clear any reconnect gaps recorded since last check."""
        gaps = list(self._gaps)
        self._gaps.clear()
        return gaps

    def _now(self) -> float:
        return max(0.0, time.monotonic() - self._clock_zero)

    async def connect(self) -> None:
        """Establish anonymous IRC connection to Twitch."""
        if self._closed:
            return
        self._state = "connecting"
        self._clock_zero = time.monotonic()
        await self._establish_connection()
        self._listen_task = asyncio.create_task(self._listen_loop())

    async def _establish_connection(self) -> None:
        """Open TCP socket and send anonymous credentials."""
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.host, self.port),
                timeout=10.0,
            )
            # Anonymous nick with random 5-digit number
            nick = f"justinfan{random.randint(10000, 99999)}"
            self._writer.write(b"PASS SCHMOOPIIE\r\n")
            self._writer.write(f"NICK {nick}\r\n".encode("utf-8"))
            self._writer.write(f"JOIN #{self.channel}\r\n".encode("utf-8"))
            await self._writer.drain()

            if self._disconnect_time is not None:
                # Recorded reconnect gap
                gap_start = self._disconnect_time
                gap_end = self._now()
                self._gaps.append((gap_start, gap_end))
                self._disconnect_time = None

            self._state = "connected"
        except Exception as e:
            logger.warning(f"Twitch IRC connection failed: {e}")
            self._state = "reconnecting"
            if self._disconnect_time is None:
                self._disconnect_time = self._now()
            raise

    async def _listen_loop(self) -> None:
        """Supervised socket read loop with PING/PONG and reconnect backoff."""
        backoff = 1.0
        while not self._closed:
            try:
                if self._state == "reconnecting" or not self._reader:
                    await asyncio.sleep(backoff)
                    backoff = min(backoff * 2.0, 30.0)
                    await self._establish_connection()
                    backoff = 1.0

                line_bytes = await asyncio.wait_for(self._reader.readline(), timeout=120.0)
                if not line_bytes:
                    raise ConnectionResetError("Twitch IRC socket EOF")

                line = line_bytes.decode("utf-8", errors="replace").rstrip("\r\n")

                if line.startswith("PING"):
                    pong_resp = line.replace("PING", "PONG", 1) + "\r\n"
                    if self._writer and not self._writer.is_closing():
                        self._writer.write(pong_resp.encode("utf-8"))
                        await self._writer.drain()
                    continue

                ev = parse_irc_privmsg(line, self._now())
                if ev is not None:
                    await self._queue.put(ev)

            except (asyncio.TimeoutError, ConnectionError, OSError) as exc:
                if self._closed:
                    break
                logger.warning(f"Twitch chat disconnected ({exc}). Reconnecting...")
                self._state = "reconnecting"
                if self._disconnect_time is None:
                    self._disconnect_time = self._now()
                if self._writer:
                    try:
                        self._writer.close()
                    except Exception:
                        pass
                self._reader = None
                self._writer = None
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Unexpected Twitch chat error: {e}")
                if self._closed:
                    break
                await asyncio.sleep(2.0)

    async def events(self) -> AsyncIterator[ChatEvent]:
        """Yield parsed ChatEvents as they arrive."""
        while not self._closed:
            try:
                ev = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                yield ev
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def close(self) -> None:
        """Clean shutdown of IRC connection."""
        self._closed = True
        self._state = "disconnected"
        if self._listen_task and not self._listen_task.done():
            self._listen_task.cancel()
            try:
                await self._listen_task
            except (asyncio.CancelledError, Exception):
                pass
        if self._writer:
            try:
                self._writer.close()
                await self._writer.wait_closed()
            except Exception:
                pass
        self._reader = None
        self._writer = None
