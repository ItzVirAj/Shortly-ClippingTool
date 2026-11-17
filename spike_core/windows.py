"""Clip window calculation and boundary enforcement (Appendix D.1 step 10).

Pure standard-library module with no I/O or dependencies.
"""
from typing import Tuple


def compute_clip_window(
    onset: float,
    spike_end: float,
    duration: float = 0.0,
    before_sec: float = 25.0,
    after_sec: float = 10.0,
    min_len: float = 20.0,
    max_len: float = 60.0,
    sync_offset_sec: float = 0.0,
) -> Tuple[float, float]:
    """Compute and clamp the suggested clip window around a detected spike.

    Args:
        onset: Spike onset timestamp in seconds.
        spike_end: Spike end timestamp in seconds.
        duration: Total stream/session duration in seconds (0.0 if unbounded).
        before_sec: Seconds to lead before onset.
        after_sec: Seconds to lag after spike end.
        min_len: Minimum clip duration in seconds.
        max_len: Maximum clip duration in seconds.
        sync_offset_sec: Offset in seconds to shift window (to compensate for lag).

    Returns:
        Tuple of (start, end) in seconds, guaranteed within bounds:
        start >= 0.0, and if duration > 0.0, end <= duration.
    """
    # 1. Base window
    start = max(0.0, float(onset) - float(before_sec))
    end = float(spike_end) + float(after_sec)

    if duration > 0.0:
        end = min(float(duration), end)

    # 2. Apply sync offset
    if sync_offset_sec != 0.0:
        start += float(sync_offset_sec)
        end += float(sync_offset_sec)
        start = max(0.0, start)
        if duration > 0.0:
            end = min(float(duration), end)

    # 3. Enforce min_len
    if (end - start) < min_len:
        needed = min_len - (end - start)
        if duration > 0.0:
            avail_end = duration - end
            extend_end = min(avail_end, needed)
            end += extend_end
            needed -= extend_end
            if needed > 0:
                start = max(0.0, start - needed)
        else:
            end = start + min_len

    # 4. Enforce max_len
    if (end - start) > max_len:
        end = start + max_len
        if duration > 0.0 and end > duration:
            end = duration
            start = max(0.0, end - max_len)

    # 5. Final safety clamps
    start = max(0.0, start)
    if duration > 0.0:
        end = min(float(duration), max(start, end))
    else:
        end = max(start, end)

    return round(start, 3), round(end, 3)
