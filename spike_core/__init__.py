"""spike_core - Pure, self-contained chat spike detection core for Shortly Live Clipper.

Zero I/O, zero external dependencies. Pure standard library algorithms for
batch and real-time streaming spike detection.
"""

from .models import ChatEvent, DetectorConfig, Spike
from .detector import detect_spikes
from .windows import compute_clip_window
from .live import LiveSpikeDetector

__all__ = [
    "ChatEvent",
    "DetectorConfig",
    "Spike",
    "detect_spikes",
    "compute_clip_window",
    "LiveSpikeDetector",
]
