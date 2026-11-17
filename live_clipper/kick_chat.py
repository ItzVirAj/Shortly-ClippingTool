"""Official Kick ChatSource implementation via webhook receiver (Section 7.2 of LIVE_CLIPPER_SPEC)."""
import asyncio
from datetime import datetime, timezone
import json
import logging
import re
import time
from typing import Any, AsyncIterator, Dict, List, Optional, Tuple
import httpx

logger = logging.getLogger("live_clipper.kick_chat")

from spike_core.models import ChatEvent
from .chat_source import ChatSource


class KickChatSource(ChatSource):
    """Real Kick chat source receiving events from Kick developer webhooks with REST stream tail fallback."""

    def __init__(
        self,
        channel: str,
        session_clock_zero: float = 0.0,
        keepalive_timeout_sec: float = 120.0,
        bot_users: Optional[List[str]] = None,
    ) -> None:
        self.channel = channel.lower()
        self.session_clock_zero = session_clock_zero or time.monotonic()
        self.keepalive_timeout_sec = float(keepalive_timeout_sec)
        self.bot_users = set(u.lower() for u in (bot_users or []))

        self._state: str = "disconnected"
        self._queue: asyncio.Queue = asyncio.Queue()
        self._stop_event = asyncio.Event()
        self._last_event_monotonic: float = time.monotonic()
        self._active_gap_start: Optional[float] = None
        self._gaps: List[Tuple[float, float]] = []
        self._seen_message_ids: set = set()
        self._poll_task: Optional[asyncio.Task] = None
        self._channel_id: Optional[int] = None

    @property
    def state(self) -> str:
        return self._state

    def set_session_clock_zero(self, clock_zero: float) -> None:
        """Update session clock origin."""
        self.session_clock_zero = clock_zero

    def get_and_clear_gaps(self) -> List[Tuple[float, float]]:
        """Return and clear any detected connection gaps."""
        res = list(self._gaps)
        self._gaps.clear()
        return res

    async def connect(self) -> None:
        """Initialize chat connection state."""
        self._state = "connecting"
        self._stop_event.clear()
        self._last_event_monotonic = time.monotonic()
        self._state = "connected"
        # Start direct REST chat tail worker in real sessions
        if self.keepalive_timeout_sec >= 1.0:
            self._poll_task = asyncio.create_task(self._poll_worker())

    async def close(self) -> None:
        """Gracefully disconnect and unblock event consumer."""
        self._state = "disconnected"
        self._stop_event.set()
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
        # Put sentinel to unblock any waiting consumer
        await self._queue.put(None)

    async def _resolve_channel_id(self) -> Optional[int]:
        if self._channel_id:
            return self._channel_id
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(
                    f"https://kick.com/api/v2/channels/{self.channel}",
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                if res.status_code == 200:
                    self._channel_id = res.json().get("id")
                    return self._channel_id
        except Exception as e:
            logger.debug(f"Kick channel resolve failed for {self.channel}: {e}")
        return None

    def _ingest_kick_dict(self, m: Dict[str, Any], custom_t: Optional[float] = None) -> None:
        """Normalize a Kick REST message dict and push to queue."""
        sender = m.get("sender") or {}
        user = sender.get("username") or sender.get("slug") or "viewer"
        text = m.get("content") or ""

        # Emotes count
        emotes_count = len(re.findall(r"\[emote:\d+:[^\]]*\]", text))
        is_bot = user.lower() in self.bot_users

        if custom_t is not None:
            session_t = custom_t
        else:
            session_t = round(max(0.0, time.monotonic() - self.session_clock_zero), 3)

        created_at = m.get("created_at") or datetime.now(timezone.utc).isoformat()
        chat_event = ChatEvent(
            t=session_t,
            user=user,
            text=text,
            emotes=emotes_count,
            is_bot=is_bot,
            created_at=created_at,
        )
        self._last_event_monotonic = time.monotonic()

        # Handle gap recovery if in reconnecting state
        if self._state == "reconnecting" and self._active_gap_start is not None:
            self._gaps.append((self._active_gap_start, session_t))
            self._active_gap_start = None
            self._state = "connected"

        try:
            self._queue.put_nowait(chat_event)
        except asyncio.QueueFull:
            pass

    async def _poll_worker(self) -> None:
        """Background worker tailing Kick live chat over REST."""
        cid = await self._resolve_channel_id()
        if not cid:
            await asyncio.sleep(2.0)
            cid = await self._resolve_channel_id()
        if not cid:
            logger.warning(f"Could not resolve channel ID for {self.channel}; relying purely on webhooks.")
            return

        first_poll = True
        async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
            while not self._stop_event.is_set():
                try:
                    res = await client.get(f"https://kick.com/api/v2/channels/{cid}/messages")
                    if res.status_code == 200:
                        data = res.json().get("data", {}).get("messages", [])
                        # Messages arrive newest-first from Kick REST; reverse to chronological
                        messages_in_order = list(reversed(data))

                        if first_poll:
                            # Ingest the last 5 messages so chat appears immediately on start
                            recent = messages_in_order[-5:] if len(messages_in_order) > 5 else messages_in_order
                            for m in messages_in_order:
                                mid = m.get("id")
                                if mid:
                                    self._seen_message_ids.add(mid)
                            for m in recent:
                                self._ingest_kick_dict(m)
                            first_poll = False
                        else:
                            now_mono = time.monotonic()
                            prev_mono = getattr(self, "_last_poll_mono", now_mono - 0.75)
                            self._last_poll_mono = now_mono

                            new_msgs = [m for m in messages_in_order if m.get("id") and m.get("id") not in self._seen_message_ids]
                            n_total = len(new_msgs)

                            for idx, m in enumerate(new_msgs):
                                mid = m.get("id")
                                self._seen_message_ids.add(mid)
                                # Distribute messages evenly across poll interval to avoid clumping
                                msg_mono = prev_mono + ((idx + 1) / (n_total + 1)) * (now_mono - prev_mono)
                                msg_t = round(max(0.0, msg_mono - self.session_clock_zero), 3)
                                self._ingest_kick_dict(m, custom_t=msg_t)

                            # Keep seen set bounded
                            if len(self._seen_message_ids) > 2000:
                                self._seen_message_ids = set(list(self._seen_message_ids)[-1000:])
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.debug(f"Kick chat poll error: {e}")

                try:
                    await asyncio.sleep(0.75)
                except asyncio.CancelledError:
                    break

    def dispatch_raw_webhook(self, payload: Dict[str, Any]) -> bool:
        """Ingest and normalize a verified Kick webhook payload into the event queue.

        Returns True if accepted, False if ignored (e.g. mismatched channel or non-chat event).
        """
        if self._stop_event.is_set():
            return False

        # Support payload wrappers: { "event": "chat.message.sent", "data": { ... } } or raw
        event_type = payload.get("event") or payload.get("type") or "chat.message.sent"
        if event_type not in ("chat.message.sent", "ChatMessageSent"):
            return False

        data = payload.get("data") or payload

        # Check broadcaster / channel match if provided
        broadcaster = data.get("broadcaster") or {}
        b_slug = (broadcaster.get("username") or broadcaster.get("slug") or "").lower()
        if b_slug and b_slug != self.channel:
            return False

        # Extract message fields
        sender = data.get("sender") or {}
        user = sender.get("username") or sender.get("slug") or sender.get("id") or "viewer"
        text = data.get("content") or data.get("message") or ""

        # Emotes count
        emotes_field = data.get("emotes") or []
        emotes_count = len(emotes_field) if isinstance(emotes_field, list) else int(emotes_field or 0)

        # Bot check
        is_bot = user.lower() in self.bot_users or bool(sender.get("is_bot", False))

        # Monotonic session-clock timestamp
        session_t = round(max(0.0, time.monotonic() - self.session_clock_zero), 3)

        chat_event = ChatEvent(
            t=session_t,
            user=user,
            text=text,
            emotes=emotes_count,
            is_bot=is_bot,
        )

        self._last_event_monotonic = time.monotonic()

        # Handle gap recovery if we were in reconnecting/timeout state
        if self._state == "reconnecting" and self._active_gap_start is not None:
            self._gaps.append((self._active_gap_start, session_t))
            self._active_gap_start = None
            self._state = "connected"

        try:
            self._queue.put_nowait(chat_event)
            return True
        except asyncio.QueueFull:
            return False

    async def events(self) -> AsyncIterator[ChatEvent]:
        """Yield normalized ChatEvents, tracking keepalives and silent disconnect gaps."""
        poll_timeout = min(1.0, max(0.05, self.keepalive_timeout_sec / 2.0))
        while not self._stop_event.is_set():
            try:
                ev = await asyncio.wait_for(self._queue.get(), timeout=poll_timeout)
                if ev is None:  # Shutdown sentinel
                    break

                yield ev

            except asyncio.TimeoutError:
                # Check for silent disconnect (section 7.2 keepalive rule)
                now_mono = time.monotonic()
                time_since_last = now_mono - self._last_event_monotonic
                session_now = round(max(0.0, now_mono - self.session_clock_zero), 3)

                if time_since_last >= self.keepalive_timeout_sec:
                    if self._state != "reconnecting":
                        self._state = "reconnecting"
                        if self._active_gap_start is None:
                            self._active_gap_start = session_now
                continue

        self._state = "disconnected"
