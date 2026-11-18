"""Persistent local creator watches. Only playable channels occupy a recording slot."""
import asyncio
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import re
import uuid

from jsonfile import write_json_atomic
from .models import LiveConfig
from .session import session_manager
from .stream_probe import check_channel_live

logger = logging.getLogger(__name__)


class CreatorWatchlist:
    def __init__(self, manager):
        self.manager = manager
        self.path = Path(manager.data_dir) / "watchlist.json"
        self.wake = asyncio.Event()
        self.status = {}

    def entries(self):
        if not self.path.exists():
            return []
        return json.loads(self.path.read_text(encoding="utf-8"))

    def save(self, rows):
        write_json_atomic(str(self.path), rows)
        self.wake.set()

    def add(self, name, channels, permission_ack):
        if not permission_ack or not name.strip() or not channels:
            raise ValueError("Enter a creator, a channel and confirm clipping permission.")
        normalized = {}
        for platform, handle in channels.items():
            handle = handle.strip().lstrip("@")
            if platform not in ("youtube", "kick", "twitch") or not re.fullmatch(r"[\w.-]{2,60}", handle):
                raise ValueError("Enter a YouTube, Kick or Twitch channel handle.")
            normalized[platform] = ("@" if platform == "youtube" else "") + handle
        rows = self.entries()
        if any(row["channels"].get(p, "").casefold() == h.casefold()
               for row in rows for p, h in normalized.items()):
            raise ValueError("This channel is already on the watchlist.")
        rows.append(dict(id=str(uuid.uuid4()), name=name.strip(), channels=normalized, enabled=True))
        self.save(rows)

    async def check(self, row):
        key = row["id"]
        def current():
            return any(r["id"] == key and r["enabled"] for r in self.entries())

        def report(state, **extra):
            self.status[key] = dict(state=state, checked=datetime.now(timezone.utc).isoformat(), **extra)

        active = self.manager.get_active_session()
        if active and row["channels"].get(active.config.platform) == active.config.channel:
            report(active.session_data.state, session_id=active.id)
            return
        errors = []
        for platform, channel in row["channels"].items():
            try:
                live = await asyncio.to_thread(check_channel_live, channel, platform, strict=True)
            except (RuntimeError, OSError) as exc:
                errors.append(f"{platform}: {exc}")
                continue
            if not current():
                return
            if not live:
                continue
            if self.manager.get_active_session():
                report("Waiting for capacity")
                return
            config = LiveConfig.from_dict(dict(platform=platform, channel=channel, permission_ack=True))
            session = await self.manager.start_session(config, require_recorder=True)
            report(session.session_data.state, session_id=session.id)
            return
        report(" · ".join(errors) if errors else "Offline")

    async def run(self):
        while True:
            self.wake.clear()
            try:
                for row in self.entries():
                    if row["enabled"]:
                        try:
                            await self.check(row)
                        except Exception as exc:
                            self.status[row["id"]] = dict(state=str(exc), checked=datetime.now(timezone.utc).isoformat())
            except Exception:
                logger.exception("Could not read creator watchlist")
            try:
                await asyncio.wait_for(self.wake.wait(), 60)
            except asyncio.TimeoutError:
                pass


watchlist = CreatorWatchlist(session_manager)
