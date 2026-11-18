"""Session manager and state machine (Section 7.4 of LIVE_CLIPPER_SPEC)."""
import asyncio
import collections
from dataclasses import asdict
from datetime import datetime, timezone
import json
import logging
import math
import os
from pathlib import Path
import re
import shutil
import time
from typing import Any, Dict, List, Optional, Tuple
import uuid

logger = logging.getLogger("live_clipper.session")

from jsonfile import write_json_atomic
from spike_core.detector import compute_clip_window
from spike_core.live import LiveSpikeDetector
from spike_core.models import ChatEvent, Spike

from .models import GapRecord, LiveConfig, LiveSession, SessionStats
from .chat_source import ChatSource, FakeChatSource
from .recorder import Recorder, FakeRecorder
from .streamlink_recorder import StreamlinkRecorder
from .stream_probe import check_channel_live
from .twitch_chat import TwitchChatSource
from .kick_chat import KickChatSource
from .youtube_chat import YouTubeChatSource
from .youtube_signals import async_fetch_youtube_signals
from .audio_energy import LiveAudioEnergyAnalyzer, AudioPeak
from .hardening import cleanup_old_sessions, startup_maintenance
from .tunnel import global_tunnel, global_kick_api
from .cutter import cut_spike, cut_manual_window, calculate_clip_window, map_to_recording_time
from .queue import global_queue

_CHANNEL_RE = re.compile(r"^[A-Za-z0-9_-]{3,30}$")
_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def clean_channel_slug(channel_input: str, platform: str = "kick") -> str:
    """Normalize pasted URL or login to a clean validated channel slug or YouTube URL."""
    if not channel_input:
        raise ValueError("Channel name or URL cannot be empty.")
    s = channel_input.strip()

    # YouTube support: allows video URLs, handles, channel links, and video IDs
    if platform == "youtube" or "youtube.com" in s.lower() or "youtu.be" in s.lower():
        if s.startswith("http://") or s.startswith("https://"):
            return s
        if "youtube.com" in s.lower() or "youtu.be" in s.lower():
            return f"https://{s.lstrip('/')}"
        # Video ID (11 chars e.g. dklfSqHUu4c)
        if re.match(r"^[a-zA-Z0-9_-]{11}$", s):
            return f"https://www.youtube.com/watch?v={s}"
        # Channel handle (@channel)
        if s.startswith("@"):
            return s
        # Channel username or handle
        if re.match(r"^[a-zA-Z0-9_.-]{2,60}$", s):
            return f"@{s.lstrip('@')}"
        return s

    slug = s
    # Strip URL prefixes like https://kick.com/ or kick.com/
    slug = re.sub(r"^https?://", "", slug, flags=re.I)
    slug = re.sub(r"^(www\.)?(kick\.com|twitch\.tv)/", "", slug, flags=re.I)
    slug = slug.strip("/").split("/")[0].split("?")[0].strip().lstrip("@")

    if not _CHANNEL_RE.match(slug):
        raise ValueError(
            f"Invalid channel '{channel_input}'. Channel slug must be 3-30 characters (letters, numbers, _, -)."
        )
    return slug


def is_valid_uuid(id_str: str) -> bool:
    """Check if string is a valid UUID."""
    return bool(_UUID_RE.match(id_str))


def resolve_session_path(base_dir: str, session_id: str) -> Path:
    """Safely resolve session directory and verify it is inside base_dir."""
    if not is_valid_uuid(session_id):
        raise ValueError(f"Invalid session ID format: '{session_id}' (must be a valid UUID).")
    base = Path(base_dir).resolve()
    target = (base / session_id).resolve()
    if not target.is_relative_to(base):
        raise ValueError(f"Path traversal detected: {target} is outside {base}")
    return target


class LiveClipperSession:
    """Supervised execution of an active Live Clipper session."""

    def __init__(
        self,
        session_id: str,
        config: LiveConfig,
        session_dir: Path,
        chat_source: Optional[ChatSource] = None,
        recorder: Optional[Recorder] = None,
    ) -> None:
        self.session_id = session_id
        self.config = config
        self.session_dir = session_dir
        self.chat_source = chat_source or FakeChatSource()
        self.recorder = recorder or FakeRecorder()

        now_iso = datetime.now(timezone.utc).isoformat()
        self.session_data = LiveSession(
            id=session_id,
            created_at=now_iso,
            updated_at=now_iso,
            config=config,
            state="idle",
            chat_state=self.chat_source.state,
            recorder_state=self.recorder.state,
        )

        self.detector = LiveSpikeDetector(
            config=config.detector,
            confirm_delay_sec=config.confirm_delay_sec,
            cooldown_sec=config.cooldown_sec,
            max_per_hour=config.max_clips_per_hour,
        )

        self._session_clock_zero: float = 0.0
        self._events_file = None
        self._events_file_path = self.session_dir / "events.jsonl"
        self._session_json_path = self.session_dir / "session.json"
        self._spikes_json_path = self.session_dir / "spikes.json"
        self._spikes: List[Spike] = []
        self._candidate_times = {}

        # Audio energy analysis & YouTube signals
        self.audio_analyzer: Optional[LiveAudioEnergyAnalyzer] = None
        if self.config.audio_peaks_enabled:
            buf_dir = self.session_dir / ("buffer" if self.config.recording_mode == "rolling" else "recording")
            self.audio_analyzer = LiveAudioEnergyAnalyzer(
                buffer_dir=buf_dir,
                threshold_db=self.config.audio_peak_db,
            )
        self.audio_peaks: List[AudioPeak] = []
        self.youtube_metadata: Optional[Dict[str, Any]] = None

        self._stop_event = asyncio.Event()
        self._tasks: List[asyncio.Task] = []
        self._active_chat_gap_start: Optional[float] = None
        self._active_video_gap_start: Optional[float] = None
        self._kick_subscription_id: Optional[str] = None
        self._recent_messages: collections.deque = collections.deque(maxlen=400)
        self._msg_timestamps: collections.deque = collections.deque()
        self._manual_cuts: Dict[str, Dict[str, Any]] = {}

    @property
    def id(self) -> str:
        return self.session_id

    def get_chat_velocity_stats(self) -> Tuple[float, int]:
        """Calculate current msgs/sec and msgs/min over a trailing 60s window."""
        now_m = time.monotonic()
        while self._msg_timestamps and now_m - self._msg_timestamps[0] > 60.0:
            self._msg_timestamps.popleft()
        count = len(self._msg_timestamps)
        elapsed = min(60.0, max(1.0, now_m - self._session_clock_zero)) if self._session_clock_zero else 60.0
        rate_sec = round(count / elapsed, 1)
        rate_min = round(count * (60.0 / elapsed))
        return rate_sec, rate_min

    def get_recent_messages(self, since_t: Optional[float] = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Return recent chat messages held in ring buffer."""
        msgs = list(self._recent_messages)
        if since_t is not None and since_t > 0:
            msgs = [m for m in msgs if m["t"] > since_t]
        return msgs[-limit:]


    @property
    def session_clock(self) -> float:
        """Current session time in monotonic float seconds."""
        if self._session_clock_zero == 0.0:
            return 0.0
        return max(0.0, time.monotonic() - self._session_clock_zero)

    def persist_session_json(self) -> None:
        """Atomically persist session.json."""
        self.session_data.updated_at = datetime.now(timezone.utc).isoformat()
        write_json_atomic(str(self._session_json_path), self.session_data.to_dict())

    def persist_spikes_json(self) -> None:
        """Atomically persist spikes.json."""
        data = [asdict(s) for s in self._spikes]
        write_json_atomic(str(self._spikes_json_path), data)

    def update_detector_config(
        self,
        ratio_threshold: Optional[float] = None,
        min_count: Optional[int] = None,
        cooldown_sec: Optional[float] = None,
        confirm_delay_sec: Optional[float] = None,
        mirror_video: Optional[bool] = None,
        webcam_mode: Optional[str] = None,
        webcam_box: Optional[Dict[str, float]] = None,
        audio_peak_db: Optional[float] = None,
        audio_peaks_enabled: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Dynamically update detector sensitivity and capture parameters on the fly."""
        if ratio_threshold is not None:
            val = round(max(1.2, min(10.0, float(ratio_threshold))), 2)
            self.detector.config.ratio_threshold = val
            scaled_ratio = max(1.05, round(val * 0.75, 2))
            self.detector.config.onset_ratio = scaled_ratio
            self.detector.config.end_ratio = scaled_ratio
            self.config.detector.ratio_threshold = val
            self.config.detector.onset_ratio = scaled_ratio
            self.config.detector.end_ratio = scaled_ratio
            self.session_data.config.detector.ratio_threshold = val
            self.session_data.config.detector.onset_ratio = scaled_ratio
            self.session_data.config.detector.end_ratio = scaled_ratio
        if min_count is not None:
            val = max(1, min(200, int(min_count)))
            self.detector.config.min_count = val
            self.config.detector.min_count = val
            self.session_data.config.detector.min_count = val
        if cooldown_sec is not None:
            val = round(max(5.0, min(600.0, float(cooldown_sec))), 1)
            self.detector.cooldown_sec = val
            self.config.cooldown_sec = val
            self.session_data.config.cooldown_sec = val
        if confirm_delay_sec is not None:
            val = round(max(1.0, min(60.0, float(confirm_delay_sec))), 1)
            self.detector.confirm_delay_sec = val
            self.config.confirm_delay_sec = val
            self.session_data.config.confirm_delay_sec = val
        if mirror_video is not None:
            val = bool(mirror_video)
            self.config.mirror_video = val
            self.session_data.config.mirror_video = val
        if webcam_mode is not None:
            import camera_inset as _ci
            norm_mode = _ci.normalize_webcam_mode(webcam_mode)
            self.config.webcam_mode = norm_mode
            self.session_data.config.webcam_mode = norm_mode
        if webcam_box is not None:
            import camera_inset as _ci
            parsed_box = _ci.parse_webcam_box(webcam_box)
            self.config.webcam_box = parsed_box
            self.session_data.config.webcam_box = parsed_box
        if audio_peak_db is not None:
            val = round(max(6.0, min(30.0, float(audio_peak_db))), 1)
            self.config.audio_peak_db = val
            self.session_data.config.audio_peak_db = val
            if self.audio_analyzer is not None:
                self.audio_analyzer.threshold_db = val
        if audio_peaks_enabled is not None:
            val = bool(audio_peaks_enabled)
            self.config.audio_peaks_enabled = val
            self.session_data.config.audio_peaks_enabled = val

        self.persist_session_json()
        return {
            "ratio_threshold": self.detector.config.ratio_threshold,
            "min_count": self.detector.config.min_count,
            "cooldown_sec": self.detector.cooldown_sec,
            "confirm_delay_sec": self.detector.confirm_delay_sec,
            "mirror_video": bool(self.config.mirror_video),
            "webcam_mode": str(self.config.webcam_mode or "auto"),
            "webcam_box": self.config.webcam_box,
            "audio_peak_db": float(self.config.audio_peak_db),
            "audio_peaks_enabled": bool(self.config.audio_peaks_enabled),
        }

    def latest_media_path(self) -> Optional[Path]:
        """Return the newest completed buffer/recording segment file for snapshot previews."""
        buffer_dir = self.session_dir / ("buffer" if self.config.recording_mode == "rolling" else "recording")
        if not buffer_dir.is_dir():
            return None
        segs = sorted(
            (p for p in buffer_dir.iterdir() if p.is_file() and p.suffix.lower() in (".ts", ".mp4", ".mkv") and p.stat().st_size > 16384),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        return segs[0] if segs else None

    async def start(self) -> None:
        """Transition session to recording or waiting_for_live."""
        self.session_dir.mkdir(parents=True, exist_ok=True)
        (self.session_dir / "clips").mkdir(exist_ok=True)

        global_queue.load_session_queue(self.id, self.session_dir)

        now_iso = datetime.now(timezone.utc).isoformat()
        self.session_data.started_at = now_iso

        # If wait_for_live is requested, check stream status
        if self.config.wait_for_live:
            is_live = await asyncio.to_thread(check_channel_live, self.config.channel, self.config.platform)
            if not is_live:
                self.session_data.state = "waiting_for_live"
                self.session_data.chat_state = "idle"
                self.session_data.recorder_state = "stopped"
                self.persist_session_json()
                self._tasks.append(asyncio.create_task(self._wait_for_live_worker()))
                return

        await self._activate_session_recording()

    async def _wait_for_live_worker(self) -> None:
        """Poll channel status every 30 seconds until the broadcast begins."""
        try:
            while not self._stop_event.is_set():
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=30.0)
                    break
                except asyncio.TimeoutError:
                    pass

                if self._stop_event.is_set():
                    break

                is_live = await asyncio.to_thread(check_channel_live, self.config.channel, self.config.platform)
                if is_live:
                    await self._activate_session_recording()
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.session_data.error = f"Wait for live error: {e}"

    async def _activate_session_recording(self) -> None:
        """Connect sources, start stream capture, and launch supervised workers."""
        self._session_clock_zero = time.monotonic()
        now_iso = datetime.now(timezone.utc).isoformat()
        self.session_data.started_at = now_iso
        self.session_data.session_clock_zero = self._session_clock_zero
        self.session_data.state = "connecting"
        self.persist_session_json()

        # Connect sources
        if isinstance(self.chat_source, KickChatSource):
            self.chat_source.set_session_clock_zero(self._session_clock_zero)
        await self.chat_source.connect()
        self.session_data.chat_state = self.chat_source.state

        # Automated Cloudflare Quick Tunnel and Kick webhook registration
        if self.config.platform == "kick" and not isinstance(self.recorder, FakeRecorder):
            if global_kick_api.is_configured:
                try:
                    t_url = await asyncio.to_thread(global_tunnel.start_tunnel)
                    self._kick_subscription_id = await global_kick_api.subscribe_webhook(
                        t_url, self.config.channel
                    )
                except Exception as e:
                    logger.warning(f"Automated Kick webhook setup error: {e}")

        await self.recorder.start(
            channel=self.config.channel,
            mode=self.config.recording_mode,
            out_dir=str(self.session_dir),
            session_clock_zero=self._session_clock_zero,
            platform=self.config.platform,
        )
        self.session_data.recorder_state = self.recorder.state
        self.session_data.recording_offset_sec = 0.0

        self.session_data.state = "recording"
        self.persist_session_json()

        # Open append-only events.jsonl
        self._events_file = open(self._events_file_path, "a", encoding="utf-8")

        # Launch supervised worker tasks
        self._tasks.append(asyncio.create_task(self._chat_worker()))
        self._tasks.append(asyncio.create_task(self._clock_advance_worker()))
        self._tasks.append(asyncio.create_task(self._spike_worker()))
        self._tasks.append(asyncio.create_task(self._supervisor_worker()))

        # Audio energy & YouTube signals background tasks
        if self.config.audio_peaks_enabled and self.audio_analyzer:
            self._tasks.append(asyncio.create_task(self._audio_worker()))
        if self.config.platform == "youtube" and self.config.heatmap_enabled:
            self._tasks.append(asyncio.create_task(self._fetch_youtube_signals_worker()))

    async def _chat_worker(self) -> None:
        """Ingest chat events from source, write to events.jsonl, and pass to detector."""
        last_flush = time.monotonic()
        try:
            async for ev in self.chat_source.events():
                if self._stop_event.is_set():
                    break

                # Handle chat state and gap transitions
                c_state = self.chat_source.state
                self.session_data.chat_state = c_state
                now_t = ev.t

                # Ingest any gaps recorded by chat source
                if hasattr(self.chat_source, "get_and_clear_gaps"):
                    for ds, de in self.chat_source.get_and_clear_gaps():
                        gap = GapRecord(kind="chat", start=ds, end=de)
                        self.session_data.gaps.append(gap)
                        self.detector.mark_gap(ds, de)

                if c_state == "reconnecting":
                    if self._active_chat_gap_start is None:
                        self._active_chat_gap_start = now_t
                elif c_state == "connected" and self._active_chat_gap_start is not None:
                    gap = GapRecord(kind="chat", start=self._active_chat_gap_start, end=now_t)
                    self.session_data.gaps.append(gap)
                    self.detector.mark_gap(gap.start, gap.end)
                    self._active_chat_gap_start = None

                # Ingest event
                self.detector.push(ev)
                self.session_data.stats.events_total += 1
                self._msg_timestamps.append(time.monotonic())
                r_sec, r_min = self.get_chat_velocity_stats()
                self.session_data.stats.msgs_per_sec_now = r_sec
                self.session_data.stats.msgs_per_min_now = r_min
                msg_created_at = getattr(ev, "created_at", None) or datetime.now(timezone.utc).isoformat()
                self._recent_messages.append({
                    "t": round(ev.t, 2),
                    "user": ev.user,
                    "text": ev.text,
                    "emotes": ev.emotes,
                    "is_bot": ev.is_bot,
                    "created_at": msg_created_at,
                })

                # Write to events.jsonl
                line = json.dumps({
                    "t": ev.t,
                    "user": ev.user,
                    "text": ev.text,
                    "emotes": ev.emotes,
                    "is_bot": ev.is_bot,
                    "created_at": msg_created_at,
                })
                self._events_file.write(line + "\n")

                if time.monotonic() - last_flush >= 5.0:
                    self._events_file.flush()
                    last_flush = time.monotonic()

        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.session_data.error = f"Chat source error: {e}"

    async def _clock_advance_worker(self) -> None:
        """Periodically advance the detector clock during chat silence."""
        try:
            while not self._stop_event.is_set():
                now_s = self.session_clock
                self.detector.advance(now_s)
                r_sec, r_min = self.get_chat_velocity_stats()
                self.session_data.stats.msgs_per_sec_now = r_sec
                self.session_data.stats.msgs_per_min_now = r_min
                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            pass

    async def _spike_worker(self) -> None:
        """Poll detector for newly confirmed spikes, persist them, and trigger cutting."""
        try:
            while not self._stop_event.is_set():
                new_spikes = self.detector.poll()
                if new_spikes:
                    self._spikes.extend(new_spikes)
                    self.session_data.stats.spikes_total = len(self._spikes)
                    self.persist_spikes_json()

                    for spk in new_spikes:
                        try:
                            await self._process_spike_to_queue(spk)
                        except Exception as e:
                            logger.warning(f"Error cutting spike {spk.id} to queue: {e}")

                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=1.0)
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            pass

    async def _fetch_youtube_signals_worker(self) -> None:
        """Fetch YouTube metadata and 'Most Replayed' heatmap in background."""
        try:
            meta = await async_fetch_youtube_signals(self.config.channel)
            self.youtube_metadata = meta
            meta_path = self.session_dir / "youtube_metadata.json"
            write_json_atomic(str(meta_path), meta)
            logger.info(
                f"YouTube signals fetched: {len(meta.get('heatmap', []))} heatmap points, "
                f"{len(meta.get('heatmap_peaks', []))} peaks."
            )
        except Exception as e:
            logger.warning(f"Error fetching YouTube signals: {e}")

    async def _audio_worker(self) -> None:
        """Scan newly written buffer segments for scream, laugh, and hype volume spikes."""
        if not self.audio_analyzer:
            return
        buffer_dir = self.session_dir / ("buffer" if self.config.recording_mode == "rolling" else "recording")
        index_path = buffer_dir / "index.json"

        try:
            while not self._stop_event.is_set():
                if index_path.exists():
                    try:
                        with open(index_path, "r", encoding="utf-8") as f:
                            idx_data = json.load(f)
                        segs = idx_data.get("segments", [])
                        new_peaks = await asyncio.to_thread(self.audio_analyzer.process_new_segments, segs)
                        for pk in new_peaks:
                            if not self.config.audio_peaks_enabled:
                                continue
                            self.audio_peaks.append(pk)
                            logger.info(f"Audio Loudness Peak detected at {pk.t}s (+{pk.db_above_floor} dB, {pk.db_level} dBFS) [{pk.label}]")

                            # Only trigger an audio spike when it genuinely exceeds the configured dB surge threshold
                            if pk.db_above_floor >= self.config.audio_peak_db:
                                audio_spike = Spike(
                                    id=f"sp_audio_{int(pk.t)}_{len(self._spikes) + 1}",
                                    onset=max(0.0, pk.t - 15.0),
                                    peak=pk.t,
                                    end=pk.t + 15.0,
                                    peak_count=max(5, int(pk.db_above_floor * 2)),
                                    baseline=round(pk.floor_db, 1),
                                    ratio=round(max(1.5, pk.db_above_floor / 3.0), 2),
                                    unique_users=1,
                                    emote_share=0.5,
                                    spam_share=0.0,
                                    score=round(min(98.0, 50.0 + pk.db_above_floor * 4.0), 1),
                                    suggested_start=max(0.0, pk.t - 15.0),
                                    suggested_end=pk.t + 15.0,
                                    tags=["audio_peak", "scream_hype"],
                                )
                                self._spikes.append(audio_spike)
                                self.session_data.stats.spikes_total = len(self._spikes)
                                self.persist_spikes_json()
                                try:
                                    await self._process_spike_to_queue(audio_spike)
                                except Exception as e:
                                    logger.warning(f"Error queueing audio spike: {e}")
                    except Exception as e:
                        logger.debug(f"Audio worker iteration error: {e}")

                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=3.0)
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            pass

    async def _process_spike_to_queue(self, spike: Spike) -> None:
        """Cut raw clip for a confirmed spike and enqueue it, waiting if needed for video buffer chunks."""
        signal = "Audio peak" if "audio_peak" in spike.tags else "Chat spike"
        stats = self.session_data.stats
        self._candidate_times = {k: t for k, t in self._candidate_times.items() if t > self.session_clock - 3600}
        if any(abs(spike.peak - t) < self.config.cooldown_sec for t in self._candidate_times.values()):
            stats.last_decision = f"{signal} skipped · overlaps a recent highlight"
            return
        if len(self._candidate_times) >= self.config.max_clips_per_hour:
            stats.last_decision = f"{signal} skipped · hourly limit reached"
            return
        # 1. Check max_pending
        pending_items = [
            it for it in global_queue.list_items(session_id=self.id)
            if it.status == "pending_review"
        ]
        if len(pending_items) >= self.config.max_pending:
            stats.last_decision = f"{signal} skipped · review queue full"
            logger.info(f"Skipping spike {spike.id}: queue has {len(pending_items)} pending items (max {self.config.max_pending})")
            return

        self._candidate_times[spike.id] = spike.peak
        stats.last_decision = f"{signal} at {spike.peak:.0f}s · preparing clip"
        buffer_dir = self.session_dir / ("buffer" if self.config.recording_mode == "rolling" else "recording")
        index_path = buffer_dir / "index.json"

        # Calculate clip recording end time so we know if video buffer has recorded up to this point
        start_session, end_session, _ = calculate_clip_window(spike, self.config)
        end_rec = map_to_recording_time(end_session, self.session_data.recording_offset_sec)

        item = None
        last_err = None
        max_retries = 12  # Retry every 2.5s for up to 30s to allow newest video segment to finish and index

        for attempt in range(max_retries):
            if self._stop_event.is_set():
                break

            if not index_path.exists():
                await asyncio.sleep(2.0)
                continue

            try:
                with open(index_path, "r", encoding="utf-8") as f:
                    buffer_index = json.load(f)
            except Exception:
                await asyncio.sleep(1.0)
                continue

            raw_segments = buffer_index.get("segments", [])
            latest_t = 0.0
            if raw_segments:
                latest_t = max(float(s.get("end_sec", float(s.get("start_sec", s.get("session_start", 0.0))) + float(s.get("duration", 0.0)))) for s in raw_segments)

            # If recording buffer hasn't reached end_rec yet, wait for video writer to flush the chunk
            if latest_t < end_rec and attempt < max_retries - 1:
                logger.debug(f"Spike {spike.id} waiting for buffer chunk: latest_t={latest_t:.1f}s < end_rec={end_rec:.1f}s (retry {attempt+1}/{max_retries})")
                await asyncio.sleep(2.5)
                continue

            item, last_err = await asyncio.to_thread(
                cut_spike,
                spike=spike,
                session=self.session_data,
                session_dir=self.session_dir,
                buffer_index=buffer_index,
            )

            if item is not None:
                break

            if last_err and "min_len" in last_err and attempt < max_retries - 1:
                logger.debug(f"Spike {spike.id} duration waiting for buffer chunk ({last_err}), retrying in 2.5s...")
                await asyncio.sleep(2.5)
                continue
            else:
                break

        if item is None:
            self._candidate_times.pop(spike.id, None)
            stats.last_decision = f"{signal} skipped · {last_err or 'recording buffer unavailable'}"
            logger.warning(f"Could not cut clip for spike {spike.id}: {last_err}")
            return

        # 4. Handle auto_process
        from .skipper import capture
        automated = await asyncio.to_thread(capture, item, self.config.channel, self.config.platform)
        if automated:
            item.status = 'skipper'  # capture handed off to persistent Skipper queue
        elif self.config.auto_process:
            item.status = "approved"
            self.session_data.stats.clips_approved += 1

        framing = "speech-trimmed" if "speech_trimmed" in item.tags else "signal window"
        stats.last_decision = f"{signal} captured · {item.duration:.0f}s · {framing}"
        self.session_data.stats.clips_cut += 1
        global_queue.add_item(item, self.session_dir)
        self.persist_session_json()
        logger.info(f"Successfully cut clip {item.id} for spike {spike.id} ({item.duration:.1f}s, score {item.score})")

    def get_manual_cuts(self) -> List[Dict[str, Any]]:
        """Return recent manual cut jobs (newest first) with live remaining wait seconds."""
        now_s = self.session_clock
        items = list(self._manual_cuts.values())
        items.sort(key=lambda c: c.get("requested_at", 0.0), reverse=True)
        out = []
        for c in items[:20]:
            rec = dict(c)
            if rec["status"] == "waiting":
                rec["remaining_sec"] = round(max(0.0, rec["end_t"] - now_s), 1)
            else:
                rec["remaining_sec"] = 0.0
            out.append(rec)
        return out

    def prune_buffer_before(self, cutoff_session_t: float) -> Dict[str, Any]:
        """Delete completed buffer/recording segments ending at or before cutoff_session_t."""
        buffer_dir = self.session_dir / ("buffer" if self.config.recording_mode == "rolling" else "recording")
        index_path = buffer_dir / "index.json"
        if not index_path.exists():
            return {"deleted_segments": 0, "freed_mb": 0.0, "remaining_segments": 0, "cutoff_sec": round(cutoff_session_t, 2)}

        try:
            with open(index_path, "r", encoding="utf-8") as f:
                idx_data = json.load(f)
        except Exception as exc:
            logger.warning(f"Could not read buffer index for pruning: {exc}")
            return {"deleted_segments": 0, "freed_mb": 0.0, "remaining_segments": 0, "cutoff_sec": round(cutoff_session_t, 2)}

        segments = idx_data.get("segments", [])
        if not segments:
            return {"deleted_segments": 0, "freed_mb": 0.0, "remaining_segments": 0, "cutoff_sec": round(cutoff_session_t, 2)}

        cutoff_rec = map_to_recording_time(max(0.0, float(cutoff_session_t)), self.session_data.recording_offset_sec)
        surviving = []
        deleted = 0
        freed_bytes = 0

        for idx, seg in enumerate(segments):
            seg_start = float(seg.get("start_sec", seg.get("session_start", 0.0)))
            seg_dur = float(seg.get("duration", 0.0))
            seg_end = float(seg.get("end_sec", seg_start + seg_dur))
            is_newest = idx == len(segments) - 1

            # Never delete the newest segment if still actively recording and cutoff hits its tail
            if seg_end <= cutoff_rec and not (is_newest and self.session_data.state == "recording" and seg_end >= cutoff_rec - 1.0):
                raw_path = seg.get("path")
                seg_path = Path(raw_path) if raw_path else (buffer_dir / seg.get("file", ""))
                if seg_path.is_file():
                    try:
                        freed_bytes += seg_path.stat().st_size
                        seg_path.unlink()
                    except OSError as exc:
                        logger.warning(f"Failed to delete buffer segment {seg_path}: {exc}")
                        surviving.append(seg)
                        continue
                deleted += 1
            else:
                surviving.append(seg)

        if deleted > 0:
            idx_data["segments"] = surviving
            write_json_atomic(str(index_path), idx_data)
            self.session_data.stats.disk_used_mb = round(self._compute_folder_size_mb(self.session_dir), 1)
            self.persist_session_json()
            logger.info(
                f"Pruned {deleted} old buffer segments before t={cutoff_session_t:.1f}s "
                f"(freed {freed_bytes / (1024 * 1024):.2f} MB, {len(surviving)} remaining)"
            )

        return {
            "deleted_segments": deleted,
            "freed_mb": round(freed_bytes / (1024 * 1024), 2),
            "remaining_segments": len(surviving),
            "cutoff_sec": round(cutoff_session_t, 2),
        }

    def schedule_manual_cut(
        self,
        before_sec: float,
        after_sec: float,
        send_to_skipper: bool = True,
        prune_buffer_before: bool = False,
    ) -> Dict[str, Any]:
        """Schedule a manual clip cut anchored at the current live moment."""
        anchor_t = self.session_clock
        start_t = max(0.0, anchor_t - max(0.0, float(before_sec)))
        end_t = anchor_t + max(0.0, float(after_sec))
        cut_id = str(uuid.uuid4())
        record: Dict[str, Any] = {
            "id": cut_id,
            "anchor_t": round(anchor_t, 2),
            "start_t": round(start_t, 2),
            "end_t": round(end_t, 2),
            "before_sec": round(float(before_sec), 2),
            "after_sec": round(float(after_sec), 2),
            "duration": round(end_t - start_t, 2),
            "remaining_sec": round(max(0.0, float(after_sec)), 1),
            "status": "waiting" if after_sec > 0 else "cutting",
            "error": None,
            "clip_id": None,
            "skipper": False,
            "prune_buffer_before": bool(prune_buffer_before),
            "pruned_segments": 0,
            "freed_mb": 0.0,
            "requested_at": time.time(),
        }
        self._manual_cuts[cut_id] = record
        # Keep memory bounded
        if len(self._manual_cuts) > 40:
            oldest = sorted(self._manual_cuts.values(), key=lambda c: c.get("requested_at", 0.0))[:10]
            for old in oldest:
                if old["status"] in ("done", "failed"):
                    self._manual_cuts.pop(old["id"], None)

        task = asyncio.create_task(
            self._run_manual_cut(cut_id, start_t, end_t, send_to_skipper, prune_buffer_before)
        )
        self._tasks.append(task)
        task.add_done_callback(lambda t: self._tasks.remove(t) if t in self._tasks else None)
        return dict(record)

    async def _run_manual_cut(
        self,
        cut_id: str,
        start_session: float,
        end_session: float,
        send_to_skipper: bool = True,
        prune_buffer_before: bool = False,
    ) -> None:
        """Wait for post-anchor footage (if after_sec > 0), then extract and enqueue the manual clip."""
        rec = self._manual_cuts.get(cut_id)
        try:
            # 1. Wait until the session clock passes end_session (or stop is triggered)
            while not self._stop_event.is_set() and self.session_clock < end_session:
                wait = min(0.5, max(0.05, end_session - self.session_clock))
                await asyncio.sleep(wait)

            if rec is not None:
                rec["status"] = "cutting"

            buffer_dir = self.session_dir / ("buffer" if self.config.recording_mode == "rolling" else "recording")
            index_path = buffer_dir / "index.json"
            end_rec = map_to_recording_time(end_session, self.session_data.recording_offset_sec)

            item = None
            last_err = None
            max_retries = 14  # Wait up to ~35s for newest segment flush

            for attempt in range(max_retries):
                if not index_path.exists():
                    if self._stop_event.is_set():
                        last_err = "Recording buffer index not available"
                        break
                    await asyncio.sleep(2.0)
                    continue

                try:
                    with open(index_path, "r", encoding="utf-8") as f:
                        buffer_index = json.load(f)
                except Exception:
                    await asyncio.sleep(1.0)
                    continue

                raw_segments = buffer_index.get("segments", [])
                latest_t = 0.0
                if raw_segments:
                    latest_t = max(
                        float(
                            s.get(
                                "end_sec",
                                float(s.get("start_sec", s.get("session_start", 0.0)))
                                + float(s.get("duration", 0.0)),
                            )
                        )
                        for s in raw_segments
                    )

                if latest_t < end_rec and not self._stop_event.is_set() and attempt < max_retries - 1:
                    await asyncio.sleep(2.5)
                    continue

                item, last_err = await asyncio.to_thread(
                    cut_manual_window,
                    session=self.session_data,
                    session_dir=self.session_dir,
                    buffer_index=buffer_index,
                    start_session=start_session,
                    end_session=end_session,
                    clip_id=cut_id,
                )
                if item is not None:
                    break
                if last_err and "min_len" in last_err and not self._stop_event.is_set() and attempt < max_retries - 1:
                    await asyncio.sleep(2.5)
                    continue
                break

            if item is None:
                if rec is not None:
                    rec["status"] = "failed"
                    rec["error"] = last_err or "Could not extract manual clip from buffer"
                logger.warning(f"Manual cut {cut_id} failed: {last_err}")
                return

            automated = False
            if send_to_skipper:
                from .skipper import capture
                automated = await asyncio.to_thread(capture, item, self.config.channel, self.config.platform)
                if automated:
                    item.status = "skipper"
                elif self.config.auto_process:
                    item.status = "approved"
                    self.session_data.stats.clips_approved += 1

            self.session_data.stats.clips_cut += 1
            global_queue.add_item(item, self.session_dir)
            self.persist_session_json()
            pruned = None
            if prune_buffer_before:
                pruned = await asyncio.to_thread(self.prune_buffer_before, start_session)
            if rec is not None:
                rec["status"] = "done"
                rec["clip_id"] = item.id
                rec["duration"] = round(item.duration, 2)
                rec["skipper"] = bool(automated)
                if pruned:
                    rec["pruned_segments"] = pruned["deleted_segments"]
                    rec["freed_mb"] = pruned["freed_mb"]
            logger.info(f"Manual cut {item.id} completed ({item.duration:.1f}s, skipper={automated})")
        except asyncio.CancelledError:
            if rec is not None and rec["status"] not in ("done", "failed"):
                rec["status"] = "failed"
                rec["error"] = "Cancelled"
        except Exception as exc:
            if rec is not None:
                rec["status"] = "failed"
                rec["error"] = str(exc)
            logger.exception(f"Manual cut {cut_id} crashed: {exc}")


    async def _supervisor_worker(self) -> None:
        """Supervise health, caps, disk usage, and persistence."""
        try:
            while not self._stop_event.is_set():
                now_s = self.session_clock

                # 1. Max session duration check
                if now_s >= (self.config.max_session_hours * 3600.0):
                    self.session_data.error = "Max session duration reached."
                    asyncio.create_task(self.stop())
                    break

                # 2. Disk guard check
                total_size_mb = self._compute_folder_size_mb(self.session_dir)
                self.session_data.stats.disk_used_mb = round(total_size_mb, 1)

                max_mb = self.config.max_disk_gb * 1024.0
                if total_size_mb >= max_mb * 0.95:
                    self.session_data.error = f"Disk limit reached ({total_size_mb:.1f} MB used)."
                    asyncio.create_task(self.stop())
                    break

                # 3. Video gap check from recorder state
                r_state = self.recorder.state
                self.session_data.recorder_state = r_state
                if r_state == "ended":
                    asyncio.create_task(self.stop())
                    break
                if r_state == "reconnecting":
                    if self._active_video_gap_start is None:
                        self._active_video_gap_start = now_s
                elif r_state == "recording" and self._active_video_gap_start is not None:
                    gap = GapRecord(kind="video", start=self._active_video_gap_start, end=now_s)
                    self.session_data.gaps.append(gap)
                    self._active_video_gap_start = None

                self.persist_session_json()

                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=5.0)
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            pass

    def _compute_folder_size_mb(self, path: Path) -> float:
        """Compute total size of files inside directory in MB."""
        total = 0
        try:
            for entry in os.scandir(str(path)):
                if entry.is_file(follow_symlinks=False):
                    total += entry.stat().st_size
                elif entry.is_dir(follow_symlinks=False):
                    total += sum(f.stat().st_size for f in Path(entry.path).rglob('*') if f.is_file())
        except OSError:
            pass
        return total / (1024.0 * 1024.0)

    async def stop(self, keep_buffer: bool = False) -> None:
        """Idempotent graceful shutdown of session and all child processes."""
        if self.session_data.state in ("stopped", "failed") and self._stop_event.is_set():
            return

        self.session_data.state = "stopping"
        self._stop_event.set()

        # Cancel worker tasks
        for t in self._tasks:
            try:
                if not t.done():
                    t.cancel()
            except Exception:
                pass
        if self._tasks:
            try:
                await asyncio.gather(*self._tasks, return_exceptions=True)
            except Exception:
                pass
        self._tasks.clear()

        # Stop chat and recorder
        try:
            await self.chat_source.close()
        except Exception:
            pass
        try:
            await self.recorder.stop()
        except Exception:
            pass

        self.session_data.chat_state = "disconnected"
        self.session_data.recorder_state = "stopped"

        # Automated Kick webhook unsubscribe and tunnel shutdown
        if self._kick_subscription_id:
            try:
                await global_kick_api.unsubscribe_webhook(self._kick_subscription_id)
            except Exception:
                pass
            self._kick_subscription_id = None

        try:
            await asyncio.to_thread(global_tunnel.stop_tunnel)
        except Exception:
            pass

        # Finalize files
        if self._events_file and not self._events_file.closed:
            self._events_file.flush()
            self._events_file.close()

        # Rolling mode buffer cleanup
        if self.config.recording_mode == "rolling" and not keep_buffer:
            buffer_dir = self.session_dir / "buffer"
            if buffer_dir.exists():
                shutil.rmtree(str(buffer_dir), ignore_errors=True)

        if self.session_data.state != "failed":
            self.session_data.state = "stopped"
        self.persist_session_json()
        self.persist_spikes_json()


def _default_live_sessions_dir() -> str:
    explicit = os.environ.get("LIVE_SESSIONS_DIR")
    if explicit:
        return explicit
    out = os.environ.get("OUTPUT_DIR")
    if out:
        return os.path.join(out, "live_sessions")
    return "live_sessions"


class SessionManager:
    """Manages session creation, listing, recovery, and lifetime."""

    def __init__(self, data_dir: Optional[str] = None) -> None:
        self._start_lock = asyncio.Lock()
        self.data_dir = data_dir or _default_live_sessions_dir()
        self._active_session: Optional[LiveClipperSession] = None
        Path(self.data_dir).mkdir(parents=True, exist_ok=True)

    def get_active_session(self) -> Optional[LiveClipperSession]:
        """Return currently running active session if any."""
        if self._active_session and self._active_session.session_data.state in (
            "idle", "waiting_for_live", "connecting", "recording", "stopping"
        ):
            return self._active_session
        return None

    async def start_session(
        self,
        config: LiveConfig,
        chat_source: Optional[ChatSource] = None,
        recorder: Optional[Recorder] = None,
        require_recorder: bool = False,
    ) -> LiveClipperSession:
        async with self._start_lock:
            return await self._start_session(config, chat_source, recorder, require_recorder)

    async def _start_session(
        self,
        config: LiveConfig,
        chat_source: Optional[ChatSource],
        recorder: Optional[Recorder],
        require_recorder: bool,
    ) -> LiveClipperSession:
        """Create and start a new live clipper session (enforces single active session)."""
        active = self.get_active_session()
        if active is not None:
            raise RuntimeError(f"A session ({active.session_id}) is already active. Only one active session allowed.")

        session_id = str(uuid.uuid4())
        session_dir = resolve_session_path(self.data_dir, session_id)

        if chat_source is None:
            if config.platform == "twitch":
                chat_source = TwitchChatSource(channel=config.channel)
            elif config.platform == "youtube":
                chat_source = YouTubeChatSource(
                    channel_or_url=config.channel,
                    work_dir=session_dir,
                )
            else:
                chat_source = KickChatSource(channel=config.channel)

        if recorder is None:
            sl_rec = StreamlinkRecorder(buffer_minutes=config.buffer_minutes)
            avail = await sl_rec.check_available()
            if avail.get("available"):
                recorder = sl_rec
            else:
                if require_recorder:
                    raise RuntimeError("Streamlink and FFmpeg are required for recording.")
                recorder = FakeRecorder()

        session = LiveClipperSession(
            session_id=session_id,
            config=config,
            session_dir=session_dir,
            chat_source=chat_source,
            recorder=recorder,
        )
        self._active_session = session
        try:
            await session.start()
        except BaseException:
            await session.stop()
            raise
        return session

    def run_maintenance(self, retention_days: int = 7) -> Dict[str, Any]:
        """Run startup self-check, prune expired sessions, and clean orphan temp files."""
        return startup_maintenance(self.data_dir, retention_days=retention_days)

    async def stop_session(self, session_id: str, keep_buffer: bool = False) -> None:
        """Stop an active session."""
        active = self.get_active_session()
        if active and active.session_id == session_id:
            await active.stop(keep_buffer=keep_buffer)
            self._active_session = None
            return

        # If not in-memory active session, check on-disk
        s_dir = resolve_session_path(self.data_dir, session_id)
        s_json = s_dir / "session.json"
        if s_json.exists():
            with open(s_json, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["state"] = "stopped"
            data["chat_state"] = "disconnected"
            data["recorder_state"] = "stopped"
            data["updated_at"] = datetime.now(timezone.utc).isoformat()
            write_json_atomic(str(s_json), data)

    def list_sessions(self) -> List[Dict[str, Any]]:
        """List session summaries sorted by creation time newest first."""
        sessions = []
        base = Path(self.data_dir)
        if not base.exists():
            return []

        for item in base.iterdir():
            if item.is_dir() and is_valid_uuid(item.name):
                s_json = item / "session.json"
                if s_json.exists():
                    try:
                        with open(s_json, "r", encoding="utf-8") as f:
                            data = json.load(f)

                        # Validate and synchronize actual clip count from clips directory
                        clips_dir = item / "clips"
                        real_clip_count = 0
                        if clips_dir.exists():
                            real_clip_count = len([f for f in clips_dir.iterdir() if f.is_file() and f.suffix == ".mp4"])
                        if "stats" in data:
                            data["stats"]["clips_cut"] = real_clip_count

                        sessions.append(data)
                    except Exception:
                        pass

        # Sort newest first
        sessions.sort(key=lambda s: s.get("created_at", ""), reverse=True)
        return sessions

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Fetch session data by ID."""
        active = self.get_active_session()
        if active and active.session_id == session_id:
            return active.session_data.to_dict()

        s_dir = resolve_session_path(self.data_dir, session_id)
        s_json = s_dir / "session.json"
        if not s_json.exists():
            return None

        with open(s_json, "r", encoding="utf-8") as f:
            return json.load(f)

    def delete_session(self, session_id: str) -> None:
        """Delete session folder from disk (refused if active)."""
        active = self.get_active_session()
        if active and active.session_id == session_id:
            raise RuntimeError(f"Cannot delete active session {session_id}. Stop it first.")

        s_dir = resolve_session_path(self.data_dir, session_id)
        if s_dir.exists():
            shutil.rmtree(str(s_dir), ignore_errors=True)

    def recover_interrupted_sessions(self) -> int:
        """On app boot, mark any sessions left active as failed with 'interrupted by restart'."""
        recovered = 0
        base = Path(self.data_dir)
        if not base.exists():
            return 0

        for item in base.iterdir():
            if item.is_dir() and is_valid_uuid(item.name):
                s_json = item / "session.json"
                if s_json.exists():
                    try:
                        with open(s_json, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        state = data.get("state")
                        if state in ("connecting", "recording", "stopping", "waiting_for_live"):
                            data["state"] = "failed"
                            data["chat_state"] = "disconnected"
                            data["recorder_state"] = "stopped"
                            data["error"] = "interrupted by restart"
                            data["updated_at"] = datetime.now(timezone.utc).isoformat()
                            write_json_atomic(str(s_json), data)
                            recovered += 1
                    except Exception:
                        pass
        return recovered


# Global default manager instance
session_manager = SessionManager()
