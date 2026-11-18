"""Data models for Live Clipper (Section 5 of LIVE_CLIPPER_SPEC)."""
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from spike_core.models import DetectorConfig


@dataclass
class LiveConfig:
    """Session configuration parameters with user-adjustable settings."""
    channel: str
    permission_ack: bool
    platform: str = "kick"           # "kick" | "twitch" | "youtube"
    recording_mode: str = "rolling"  # "rolling" | "full"
    buffer_minutes: int = 8           # range 3 to 30
    confirm_delay_sec: float = 6.0    # range 2 to 30
    cooldown_sec: float = 60.0
    max_clips_per_hour: int = 12
    max_pending: int = 30
    sync_offset_sec: float = 0.0      # range -30 to 30
    max_session_hours: float = 12.0
    max_disk_gb: float = 20.0
    hook_mode: str = "auto"           # "auto" | "manual" | "none"
    auto_process: bool = False
    wait_for_live: bool = False
    detector: DetectorConfig = field(default_factory=DetectorConfig)
    credit_text: Optional[str] = None
    audio_peaks_enabled: bool = True
    audio_peak_db: float = 6.0
    heatmap_enabled: bool = True

    def validate(self) -> None:
        """Validate ranges and required acknowledgments."""
        if not self.permission_ack:
            raise ValueError("Permission acknowledgment (permission_ack) is required and must be True.")
        if self.platform not in ("kick", "twitch", "youtube"):
            raise ValueError(f"Unsupported platform: {self.platform}. Supported: kick, twitch, youtube.")
        if self.recording_mode not in ("rolling", "full"):
            raise ValueError(f"Unsupported recording_mode: {self.recording_mode}. Supported: rolling, full.")
        if not (3 <= self.buffer_minutes <= 30):
            raise ValueError("buffer_minutes must be between 3 and 30.")
        if not (2.0 <= self.confirm_delay_sec <= 30.0):
            raise ValueError("confirm_delay_sec must be between 2.0 and 30.0.")
        if not (-30.0 <= self.sync_offset_sec <= 30.0):
            raise ValueError("sync_offset_sec must be between -30.0 and 30.0.")
        if self.max_session_hours <= 0:
            raise ValueError("max_session_hours must be positive.")
        if self.max_disk_gb <= 0:
            raise ValueError("max_disk_gb must be positive.")
        if self.hook_mode not in ("auto", "manual", "none"):
            raise ValueError(f"Unsupported hook_mode: {self.hook_mode}. Supported: auto, manual, none.")

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LiveConfig":
        det_data = data.get("detector") or {}
        if isinstance(det_data, dict):
            # Map known DetectorConfig fields (10s buckets, 3-min median baseline, 2.5x ratio, adjustable)
            detector = DetectorConfig(
                bin_sec=float(det_data.get("bin_sec", 10.0)),
                smooth_bins=int(det_data.get("smooth_bins", 1)),
                baseline_sec=float(det_data.get("baseline_sec", 180.0)),
                baseline_stat=str(det_data.get("baseline_stat", "median")),
                min_baseline=float(det_data.get("min_baseline", 1.0)),
                ratio_threshold=float(det_data.get("ratio_threshold", 2.5)),
                min_count=int(det_data.get("min_count", 5)),
                end_ratio=float(det_data.get("end_ratio", 1.5)),
                onset_ratio=float(det_data.get("onset_ratio", 1.8)),
                before_sec=float(det_data.get("before_sec", 25.0)),
                after_sec=float(det_data.get("after_sec", 10.0)),
                min_len=float(det_data.get("min_len", 20.0)),
                max_len=float(det_data.get("max_len", 60.0)),
                min_gap_sec=float(det_data.get("min_gap_sec", 40.0)),
                max_spikes=int(det_data.get("max_spikes", 20)),
                bot_users=list(det_data.get("bot_users") or []),
                spam_text_share=float(det_data.get("spam_text_share", 0.6)),
            )
        elif isinstance(det_data, DetectorConfig):
            detector = det_data
        else:
            detector = DetectorConfig()

        cfg = cls(
            channel=str(data.get("channel", "")),
            permission_ack=bool(data.get("permission_ack", False)),
            platform=str(data.get("platform", "kick")),
            recording_mode=str(data.get("recording_mode", "rolling")),
            buffer_minutes=int(data.get("buffer_minutes", 8)),
            confirm_delay_sec=float(data.get("confirm_delay_sec", 8.0)),
            cooldown_sec=float(data.get("cooldown_sec", 90.0)),
            max_clips_per_hour=int(data.get("max_clips_per_hour", 12)),
            max_pending=int(data.get("max_pending", 30)),
            sync_offset_sec=float(data.get("sync_offset_sec", 0.0)),
            max_session_hours=float(data.get("max_session_hours", 12.0)),
            max_disk_gb=float(data.get("max_disk_gb", 20.0)),
            hook_mode=str(data.get("hook_mode", "auto")),
            auto_process=bool(data.get("auto_process", False)),
            wait_for_live=bool(data.get("wait_for_live", False)),
            detector=detector,
            credit_text=data.get("credit_text"),
            audio_peaks_enabled=bool(data.get("audio_peaks_enabled", True)),
            audio_peak_db=float(data.get("audio_peak_db", 6.0)),
            heatmap_enabled=bool(data.get("heatmap_enabled", True)),
        )
        cfg.validate()
        return cfg

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        return d


@dataclass
class SessionStats:
    """Live runtime stats for session monitoring."""
    events_total: int = 0
    msgs_per_sec_now: float = 0.0
    msgs_per_min_now: int = 0
    spikes_total: int = 0
    clips_cut: int = 0
    clips_approved: int = 0
    clips_rejected: int = 0
    disk_used_mb: float = 0.0
    buffer_seconds: float = 0.0

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SessionStats":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class GapRecord:
    """Gap in chat or recording data."""
    kind: str  # "chat" | "video"
    start: float
    end: float

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GapRecord":
        return cls(kind=str(data["kind"]), start=float(data["start"]), end=float(data["end"]))


@dataclass
class LiveSession:
    """Persistent representation of a Live Clipper session (session.json)."""
    id: str
    created_at: str
    updated_at: str
    config: LiveConfig
    state: str = "idle"  # idle | waiting_for_live | connecting | recording | stopping | stopped | failed
    chat_state: str = "disconnected"  # disconnected | connecting | connected | reconnecting
    recorder_state: str = "stopped"    # stopped | starting | recording | reconnecting
    started_at: Optional[str] = None
    session_clock_zero: Optional[float] = None
    recording_offset_sec: Optional[float] = None
    gaps: List[GapRecord] = field(default_factory=list)
    stats: SessionStats = field(default_factory=SessionStats)
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "config": self.config.to_dict(),
            "state": self.state,
            "chat_state": self.chat_state,
            "recorder_state": self.recorder_state,
            "started_at": self.started_at,
            "session_clock_zero": self.session_clock_zero,
            "recording_offset_sec": self.recording_offset_sec,
            "gaps": [asdict(g) for g in self.gaps],
            "stats": asdict(self.stats),
            "error": self.error,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LiveSession":
        config = LiveConfig.from_dict(data["config"])
        gaps = [GapRecord.from_dict(g) for g in data.get("gaps", [])]
        stats = SessionStats.from_dict(data.get("stats", {}))
        return cls(
            id=data["id"],
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            config=config,
            state=data.get("state", "idle"),
            chat_state=data.get("chat_state", "disconnected"),
            recorder_state=data.get("recorder_state", "stopped"),
            started_at=data.get("started_at"),
            session_clock_zero=data.get("session_clock_zero"),
            recording_offset_sec=data.get("recording_offset_sec"),
            gaps=gaps,
            stats=stats,
            error=data.get("error"),
        )


QUEUE_STATUSES = {
    "skipper",
    "pending_review",
    "approved",
    "rejected",
    "processing",
    "completed",
    "failed",
}

VALID_QUEUE_TRANSITIONS = {
    "pending_review": {"approved", "rejected"},
    "approved": {"processing", "rejected"},
    "rejected": set(),
    "processing": {"completed", "failed"},
    "completed": set(),
    "failed": {"approved"},  # retry transitions back to approved
}


@dataclass
class QueueItem:
    """A clip in the review queue awaiting review or pipeline processing."""
    id: str
    session_id: str
    spike_id: str
    clip_path: str
    status: str = "pending_review"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    start_t: float = 0.0
    end_t: float = 0.0
    duration: float = 0.0
    score: float = 0.0
    tags: List[str] = field(default_factory=list)
    pipeline_job_id: Optional[str] = None
    error: Optional[str] = None
    hook_mode: Optional[str] = None
    keep_forever: bool = False

    def transition_to(self, new_status: str) -> None:
        """Validate and apply a state transition. Idempotent if already in target status."""
        if new_status not in QUEUE_STATUSES:
            raise ValueError(f"Invalid queue status: {new_status}")
        if self.status == new_status:
            return  # Idempotent no-op
        allowed = VALID_QUEUE_TRANSITIONS.get(self.status, set())
        if new_status not in allowed:
            raise ValueError(f"Illegal queue transition from {self.status} to {new_status}")
        self.status = new_status
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "QueueItem":
        return cls(
            id=data["id"],
            session_id=data["session_id"],
            spike_id=data.get("spike_id", ""),
            clip_path=data["clip_path"],
            status=data.get("status", "pending_review"),
            created_at=data.get("created_at", datetime.now(timezone.utc).isoformat()),
            updated_at=data.get("updated_at", datetime.now(timezone.utc).isoformat()),
            start_t=float(data.get("start_t", 0.0)),
            end_t=float(data.get("end_t", 0.0)),
            duration=float(data.get("duration", 0.0)),
            score=float(data.get("score", 0.0)),
            tags=list(data.get("tags") or []),
            pipeline_job_id=data.get("pipeline_job_id"),
            error=data.get("error"),
            hook_mode=data.get("hook_mode"),
            keep_forever=bool(data.get("keep_forever", False)),
        )

