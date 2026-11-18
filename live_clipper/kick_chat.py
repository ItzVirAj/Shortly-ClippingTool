"""Official Kick ChatSource implementation via webhook receiver (Section 7.2 of LIVE_CLIPPER_SPEC)."""
import asyncio
from collections import OrderedDict
from uuid import uuid4
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
        self._seen_message_ids = OrderedDict()
        self._socket_task: Optional[asyncio.Task] = None
        self._subscribed = False
        self._chatroom_id: Optional[int] = None
        self._client_id = str(uuid4())
        self.transport = "connecting"
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
            self._socket_task = asyncio.create_task(self._socket_worker())
            self._poll_task = asyncio.create_task(self._poll_worker())

    async def close(self) -> None:
        """Gracefully disconnect and unblock event consumer."""
        self._state = "disconnected"
        self._stop_event.set()
        tasks = [t for t in (self._socket_task, self._poll_task) if t is not None]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        # Put sentinel to unblock any waiting consumer
        await self._queue.put(None)

    async def _resolve_channel_id(self) -> Optional[int]:
        if self._channel_id and self._chatroom_id:
            return self._channel_id
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(
                    f"https://kick.com/api/v2/channels/{self.channel}",
                    headers={"User-Agent": "Mozilla/5.0"},
                )
                if res.status_code == 200:
                    channel = res.json()
                    self._channel_id = channel.get("id")
                    self._chatroom_id = (channel.get("chatroom") or {}).get("id")
                    return self._channel_id
        except Exception as e:
            logger.debug(f"Kick channel resolve failed for {self.channel}: {e}")
        return None

    def _is_new(self, message_id) -> bool:
        if not message_id:
            return True
        key = str(message_id)
        if key in self._seen_message_ids:
            return False
        self._seen_message_ids[key] = None
        if len(self._seen_message_ids) > 10000:
            self._seen_message_ids.popitem(last=False)
        return True

    async def _socket_worker(self) -> None:
        """Negotiate the public chatroom feed; Kick assigns the Pusher cluster per channel."""
        import websockets

        delay = 1
        async with httpx.AsyncClient(timeout=8) as client:
            while not self._stop_event.is_set():
                try:
                    channel_id = await self._resolve_channel_id()
                    if not channel_id or not self._chatroom_id:
                        raise ValueError("Kick chatroom unavailable")
                    response = await client.post(
                        f"https://web.kick.com/api/v1/realtime/channels/{int(channel_id)}/chat/connection",
                        json={"client": {"id": self._client_id, "type": "web"},
                              "capabilities": {"accepted_providers": [{"provider": "pusher"}]}},
                    )
                    response.raise_for_status()
                    choices = response.json()["data"]["connections"]
                    credentials = next(c["credentials"] for c in choices if c.get("provider") == "pusher")
                    cluster, key = credentials["cluster"], credentials["app_key"]
                    if not re.fullmatch(r"[a-z0-9-]+", cluster) or not re.fullmatch(r"[A-Za-z0-9]+", key):
                        raise ValueError("Invalid Kick realtime connection")
                    room = f"chatrooms.{int(self._chatroom_id)}.v2"
                    url = f"wss://ws-{cluster}.pusher.com/app/{key}?protocol=7&client=js&version=8.4.0"
                    async with websockets.connect(url, open_timeout=10, close_timeout=2) as socket:
                        await socket.send(json.dumps({"event": "pusher:subscribe", "data": {"channel": room}}))
                        while not self._stop_event.is_set():
                            packet = json.loads(await asyncio.wait_for(socket.recv(), 150 if self._subscribed else 12))
                            event = packet.get("event")
                            if event == "pusher:error":
                                raise ValueError("Kick realtime subscription rejected")
                            if event == "pusher:ping":
                                await socket.send(json.dumps({"event": "pusher:pong", "data": {}}))
                            if packet.get("channel") != room:
                                continue
                            if event == "pusher_internal:subscription_succeeded":
                                self._subscribed = True
                                self.transport = "live socket"
                                delay = 1
                            elif event == r"App\Events\ChatMessageEvent":
                                message = packet["data"]
                                if isinstance(message, str):
                                    message = json.loads(message)
                                self._ingest_kick_dict(message)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    logger.warning("Kick realtime unavailable for %s (%s); retrying in %ss",
                                   self.channel, type(exc).__name__, delay)
                finally:
                    self._subscribed = False
                    self.transport = "reconnecting"
                await asyncio.sleep(delay)
                delay = min(delay * 2, 60)

    def _ingest_kick_dict(self, m: Dict[str, Any], custom_t: Optional[float] = None) -> None:
        """Normalize a Kick REST message dict and push to queue."""
        if not self._is_new(m.get("id")):
            return
        sender = m.get("sender") or {}
        user = sender.get("username") or sender.get("slug") or "viewer"
        text = m.get("content") or ""

        # Emotes count
        emotes_count = len(re.findall(r"\[emote:\d+:[^\]]*\]", text))
        is_bot = str(user).lower() in self.bot_users

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
        # The REST endpoint is a cached, limited snapshot. Use it only when
        # streaming is unavailable and never replay the initial history as a burst.
        first_poll = True
        async with httpx.AsyncClient(timeout=6.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
            while not self._stop_event.is_set():
                await asyncio.sleep(2)
                if self._subscribed:
                    first_poll = True
                    continue
                try:
                    cid = await self._resolve_channel_id()
                    if not cid:
                        continue
                    res = await client.get(f"https://kick.com/api/v2/channels/{cid}/messages")
                    res.raise_for_status()
                    if self._subscribed:
                        continue
                    self.transport = "recent history (sampled)"
                    messages = reversed(res.json()["data"]["messages"])
                    for message in messages:
                        mid = message.get("id")
                        if mid and first_poll:
                            self._is_new(mid)
                        elif mid:
                            try:
                                created = datetime.fromisoformat(message["created_at"].replace("Z", "+00:00"))
                                age = max(0.0, time.time() - created.timestamp())
                                timestamp = time.monotonic() - self.session_clock_zero - age
                            except (KeyError, ValueError, AttributeError, OSError):
                                timestamp = time.monotonic() - self.session_clock_zero
                            if timestamp >= 0:
                                self._ingest_kick_dict(message, custom_t=timestamp)
                    first_poll = False
                except (httpx.HTTPError, ValueError, KeyError) as exc:
                    logger.debug("Kick history unavailable for %s: %s", self.channel, type(exc).__name__)

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

        if not self._is_new(data.get("message_id") or data.get("id")):
            return False

        # Extract message fields
        sender = data.get("sender") or {}
        user = sender.get("username") or sender.get("slug") or sender.get("id") or "viewer"
        text = data.get("content") or data.get("message") or ""

        # Emotes count
        emotes_field = data.get("emotes") or []
        emotes_count = len(emotes_field) if isinstance(emotes_field, list) else int(emotes_field or 0)

        # Bot check
        is_bot = str(user).lower() in self.bot_users or bool(sender.get("is_bot", False))

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

                if not self._subscribed and time_since_last >= self.keepalive_timeout_sec:
                    if self._state != "reconnecting":
                        self._state = "reconnecting"
                        if self._active_gap_start is None:
                            self._active_gap_start = session_now
                continue

        self._state = "disconnected"
