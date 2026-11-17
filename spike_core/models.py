"""Data contracts for spike detection (Appendix C of LIVE_CLIPPER_SPEC).

Pure standard-library dataclasses with no external dependencies and no I/O.
"""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ChatEvent:
    """Normalized chat message event (Appendix C.1).

    Attributes:
        t: Seconds from session start (monotonic session clock).
        user: User ID or login, used only for unique-chatter counts.
        text: Message text, used only for spam and emote heuristics.
        emotes: Number of emotes in message if known, else 0.
        is_bot: True if user is in bot list.
    """
    t: float
    user: Optional[str] = None
    text: Optional[str] = None
    emotes: int = 0
    is_bot: bool = False
    created_at: Optional[str] = None


@dataclass
class DetectorConfig:
    """Configuration options for spike detection.

    Count messages in 10 s buckets; a spike = 2.5x the median of the last 3 min
    and at least --min messages (with adjustable spike ratio and min count).
    """
    bin_sec: float = 10.0                # Counting bucket size in seconds (10s buckets)
    smooth_bins: int = 1                 # Moving average window width (1 bin = raw bucket count)
    baseline_sec: float = 180.0          # Trailing window for median: last 3 minutes (180s)
    baseline_stat: str = "median"        # Median of trailing 3-minute window
    min_baseline: float = 1.0            # Floor messages per bin to avoid division by zero
    ratio_threshold: float = 2.5         # Spike multiplier: 2.5x the median of the last 3 min (adjustable)
    min_count: int = 5                   # Minimum messages in peak window to qualify (--min, adjustable)
    end_ratio: float = 1.5               # Spike ends when ratio drops below this
    onset_ratio: float = 1.8             # Onset is earliest bin of rise above this
    before_sec: float = 25.0             # Clip starts this many seconds before onset
    after_sec: float = 10.0              # Clip ends this many seconds after spike end
    min_len: float = 20.0                # Minimum clip duration in seconds
    max_len: float = 60.0                # Maximum clip duration in seconds
    min_gap_sec: float = 40.0            # Peaks closer than this are merged into one spike
    max_spikes: int = 20                 # Maximum spikes to return
    bot_users: List[str] = field(default_factory=list)  # List of bot logins to ignore
    spam_text_share: float = 0.6         # Share of identical messages triggering spam_heavy tag


@dataclass
class Spike:
    """Detected chat spike representing an exciting or funny live moment (Appendix C.3)."""
    id: str
    onset: float
    peak: float
    end: float
    peak_count: int
    baseline: float
    ratio: float
    unique_users: int
    emote_share: float          # 0.0 .. 1.0
    spam_share: float           # 0.0 .. 1.0
    score: float                # 0.0 .. 100.0, higher is better
    suggested_start: float      # Start time of suggested clip
    suggested_end: float        # End time of suggested clip
    tags: List[str] = field(default_factory=list)  # e.g. ["spam_heavy", "possible_raid"]
