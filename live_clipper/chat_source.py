"""Chat source abstraction and fake implementation (Section 7.2 of LIVE_CLIPPER_SPEC)."""
import asyncio
import time
from abc import ABC, abstractmethod
from typing import AsyncIterator, List, Optional, Tuple

from spike_core.models import ChatEvent


class ChatSource(ABC):
    """Abstract base class for streaming chat sources."""

    @property
    @abstractmethod
    def state(self) -> str:
        """Current state: disconnected | connecting | connected | reconnecting."""
        pass

    @abstractmethod
    async def connect(self) -> None:
        """Establish connection to the chat provider."""
        pass

    @abstractmethod
    def events(self) -> AsyncIterator[ChatEvent]:
        """Yield parsed ChatEvents stamped with session clock time."""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Gracefully disconnect and clean up resources."""
        pass


class FakeChatSource(ChatSource):
    """Simulated chat source for unit testing and offline development.

    Replays a list of ChatEvents at accelerated or real-time speed, with
    optional simulated drops to verify reconnect states and gap marking.
    """

    def __init__(
        self,
        events: Optional[List[ChatEvent]] = None,
        speed: float = 1.0,
        drop_intervals: Optional[List[Tuple[float, float]]] = None,
        clock_callback: Optional[callable] = None,
    ) -> None:
        """
        Args:
            events: List of ChatEvents ordered by t.
            speed: Playback speed multiplier (e.g. 100.0 for accelerated test runs).
            drop_intervals: List of (start_t, end_t) session seconds where connection drops.
            clock_callback: Optional callable returning current session clock float seconds.
        """
        self._raw_events = list(events or [])
        self._raw_events.sort(key=lambda e: e.t)
        self._speed = max(0.001, float(speed))
        self._drop_intervals = list(drop_intervals or [])
        self._clock_callback = clock_callback

        self._state: str = "disconnected"
        self._stop_event = asyncio.Event()
        self._gaps: List[Tuple[float, float]] = []
        self._processed_drops = set()

    @property
    def state(self) -> str:
        return self._state

    def get_and_clear_gaps(self) -> List[Tuple[float, float]]:
        """Return and clear any chat gaps registered during drops."""
        res = list(self._gaps)
        self._gaps.clear()
        return res

    async def connect(self) -> None:
        self._state = "connecting"
        await asyncio.sleep(0.01)  # brief async yield
        self._state = "connected"
        self._stop_event.clear()

    async def close(self) -> None:
        self._state = "disconnected"
        self._stop_event.set()

    def _in_drop(self, session_t: float) -> Optional[Tuple[float, float]]:
        for ds, de in self._drop_intervals:
            if ds <= session_t < de:
                return (ds, de)
        return None

    async def events(self) -> AsyncIterator[ChatEvent]:
        """Yield events while tracking drop intervals and pacing with session clock."""
        if not self._raw_events:
            return

        last_event_t = 0.0

        for ev in self._raw_events:
            if self._stop_event.is_set():
                break

            # Handle drops
            drop = self._in_drop(ev.t)
            if drop is not None:
                ds, de = drop
                if drop not in self._processed_drops:
                    self._processed_drops.add(drop)
                    self._gaps.append((ds, de))
                self._state = "reconnecting"
                delay_sec = (de - ev.t) / self._speed
                if delay_sec > 0:
                    try:
                        await asyncio.wait_for(self._stop_event.wait(), timeout=min(delay_sec, 0.5))
                    except asyncio.TimeoutError:
                        pass
                continue
            elif self._state == "reconnecting":
                self._state = "connected"

            # Pace events if running with non-infinite speed
            if self._speed < 1000.0 and ev.t > last_event_t:
                dt = (ev.t - last_event_t) / self._speed
                # Limit max single sleep to keep stops responsive
                if dt > 0:
                    try:
                        await asyncio.wait_for(self._stop_event.wait(), timeout=min(dt, 0.5))
                    except asyncio.TimeoutError:
                        pass
                last_event_t = ev.t

            if self._stop_event.is_set():
                break

            yield ev

        self._state = "disconnected"
