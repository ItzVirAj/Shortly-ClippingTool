"""Shortly Live Clipper module (Phase 2 & Phase 3)."""
from .models import LiveConfig, LiveSession, SessionStats, GapRecord, QueueItem
from .chat_source import ChatSource, FakeChatSource
from .kick_chat import KickChatSource
from .recorder import Recorder, FakeRecorder
from .streamlink_recorder import StreamlinkRecorder
from .session import SessionManager, LiveClipperSession, clean_channel_slug, is_valid_uuid
from .cutter import cut_spike, calculate_clip_window, check_buffer_and_gaps
from .queue import ReviewQueue, global_queue
from .handoff import HandoffWorker, global_handoff, submit_to_shortly_pipeline

__all__ = [
    "LiveConfig",
    "LiveSession",
    "SessionStats",
    "GapRecord",
    "QueueItem",
    "ChatSource",
    "FakeChatSource",
    "KickChatSource",
    "Recorder",
    "FakeRecorder",
    "StreamlinkRecorder",
    "SessionManager",
    "LiveClipperSession",
    "clean_channel_slug",
    "is_valid_uuid",
    "cut_spike",
    "calculate_clip_window",
    "check_buffer_and_gaps",
    "ReviewQueue",
    "global_queue",
    "HandoffWorker",
    "global_handoff",
    "submit_to_shortly_pipeline",
]

