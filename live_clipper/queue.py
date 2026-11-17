"""Review queue manager for Live Clipper (Section 7.6 and 7.7 of LIVE_CLIPPER_SPEC).

Tracks clip items across approval, rejection, rendering states, handles
persistence to queue.json, manages disk cleanup on reject, and maintains
the global processing pause flag.
"""
import json
import logging
import os
import threading
from pathlib import Path
from typing import Dict, List, Optional

from live_clipper.models import QueueItem

logger = logging.getLogger("live_clipper.queue")


class ReviewQueue:
    """In-memory and file-backed review queue for live clips."""

    def __init__(self, data_root: Optional[Path] = None) -> None:
        self.data_root = data_root or Path("output/liveclipper")
        self._items: Dict[str, QueueItem] = {}
        self._paused: bool = False
        self._lock = threading.Lock()

    @property
    def is_paused(self) -> bool:
        with self._lock:
            return self._paused

    def set_paused(self, paused: bool) -> bool:
        with self._lock:
            self._paused = bool(paused)
            logger.info(f"Processing pause state updated: paused={self._paused}")
            return self._paused

    def add_item(self, item: QueueItem, session_dir: Optional[Path] = None) -> None:
        """Add a newly cut clip item to the queue and persist."""
        with self._lock:
            self._items[item.id] = item
        if session_dir is not None:
            self.persist_session_queue(item.session_id, session_dir)

    def _recover_session(self, session_id: str) -> None:
        """Recover queue items from disk for a given session."""
        candidate_dirs = [
            Path("live_sessions") / session_id,
            self.data_root / session_id,
            Path("output/liveclipper") / session_id,
        ]
        for s_dir in candidate_dirs:
            if (s_dir / "queue.json").exists():
                self.load_session_queue(session_id, s_dir)

    def _recover_all(self) -> None:
        """Scan disk for all past sessions and load their queue.json."""
        for base in [Path("live_sessions"), self.data_root, Path("output/liveclipper")]:
            if not base.exists():
                continue
            try:
                for s_dir in base.iterdir():
                    if s_dir.is_dir() and (s_dir / "queue.json").exists():
                        self.load_session_queue(s_dir.name, s_dir)
            except Exception as e:
                logger.warning(f"Failed to scan directory {base} for sessions: {e}")

    def get_item(self, item_id: str) -> Optional[QueueItem]:
        """Fetch item by id."""
        with self._lock:
            item = self._items.get(item_id)
        if not item:
            self._recover_all()
            with self._lock:
                item = self._items.get(item_id)
        return item

    def list_items(self, session_id: Optional[str] = None) -> List[QueueItem]:
        """List queue items, optionally filtered by session_id, newest first."""
        if session_id:
            with self._lock:
                has_items = any(it.session_id == session_id for it in self._items.values())
            if not has_items:
                self._recover_session(session_id)
        else:
            with self._lock:
                is_empty = len(self._items) == 0
            if is_empty:
                self._recover_all()

        with self._lock:
            items = list(self._items.values())
        if session_id:
            items = [it for it in items if it.session_id == session_id]
        # Only return items whose clip file actually exists on disk
        items = [it for it in items if not it.clip_path or Path(it.clip_path).exists()]
        items.sort(key=lambda it: it.created_at, reverse=True)
        return items

    def approve(self, item_id: str, session_dir: Optional[Path] = None) -> QueueItem:
        """Approve a pending or failed clip item for rendering."""
        with self._lock:
            item = self._items.get(item_id)
            if not item:
                raise KeyError(f"Queue item {item_id} not found")
            item.transition_to("approved")
            item.error = None
        s_dir = session_dir or (self.data_root / item.session_id)
        self.persist_session_queue(item.session_id, s_dir)
        return item

    def reject(self, item_id: str, session_dir: Optional[Path] = None) -> QueueItem:
        """Reject a clip item, remove clip from disk, and record rejected status."""
        with self._lock:
            item = self._items.get(item_id)
            if not item:
                raise KeyError(f"Queue item {item_id} not found")
            item.transition_to("rejected")

        # Delete raw clip file from disk if present
        if item.clip_path:
            p = Path(item.clip_path)
            if p.exists():
                try:
                    p.unlink()
                    logger.info(f"Deleted rejected clip file: {p}")
                except OSError as e:
                    logger.warning(f"Failed to delete rejected clip file {p}: {e}")

        s_dir = session_dir or (self.data_root / item.session_id)
        self.persist_session_queue(item.session_id, s_dir)
        return item

    def get_next_approved(self) -> Optional[QueueItem]:
        """FIFO retrieval of the next approved item awaiting processing."""
        with self._lock:
            if self._paused:
                return None
            approved = [it for it in self._items.values() if it.status == "approved"]
            if not approved:
                return None
            # Oldest first for FIFO processing
            approved.sort(key=lambda it: it.updated_at)
            return approved[0]

    def persist_session_queue(self, session_id: str, session_dir: Path) -> None:
        """Persist session queue items to session queue.json atomically."""
        try:
            with self._lock:
                items = [it.to_dict() for it in self._items.values() if it.session_id == session_id]

            queue_path = session_dir / "queue.json"
            tmp_path = session_dir / "queue.json.tmp"
            session_dir.mkdir(parents=True, exist_ok=True)
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(items, f, indent=2)
            os.replace(tmp_path, queue_path)
        except Exception as e:
            logger.warning(f"Failed to persist queue for session {session_id}: {e}")

    def load_session_queue(self, session_id: str, session_dir: Path) -> None:
        """Load queue items from session_dir/queue.json, filtering out missing files."""
        queue_path = session_dir / "queue.json"
        if not queue_path.exists():
            return
        try:
            with open(queue_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, list):
                valid_data = []
                with self._lock:
                    for d in data:
                        item = QueueItem.from_dict(d)
                        # Only keep items whose clip_path exists on disk
                        if item.clip_path and not Path(item.clip_path).exists():
                            self._items.pop(item.id, None)
                            continue
                        self._items[item.id] = item
                        valid_data.append(d)

                # If missing clip files were pruned, update queue.json on disk
                if len(valid_data) != len(data):
                    try:
                        tmp_path = session_dir / "queue.json.tmp"
                        with open(tmp_path, "w", encoding="utf-8") as f:
                            json.dump(valid_data, f, indent=2)
                        os.replace(tmp_path, queue_path)
                    except Exception:
                        pass
        except Exception as e:
            logger.warning(f"Failed to load queue.json for session {session_id}: {e}")


# Global queue singleton
global_queue = ReviewQueue()
