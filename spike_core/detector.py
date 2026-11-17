"""Batch spike detection algorithm (Appendix D of LIVE_CLIPPER_SPEC).

Implements small, reusable pure functions with zero I/O and zero external
dependencies, so LiveSpikeDetector can reuse them without re-implementation.
"""
import math
import re
from statistics import median, mean
from typing import Dict, List, Optional, Set, Tuple

from .models import ChatEvent, DetectorConfig, Spike
from .windows import compute_clip_window

_EMOTE_TOKEN_RE = re.compile(r"^[A-Z0-9_]{2,15}$")


def is_likely_emote(text: Optional[str]) -> bool:
    """Check if message text is likely a standalone emote token (e.g. LUL, KEKW, W, POG)."""
    if not text:
        return False
    clean = text.strip()
    return bool(_EMOTE_TOKEN_RE.match(clean))


def bin_events(
    events: List[ChatEvent],
    bin_sec: float,
    duration: float,
    bot_users: Optional[Set[str]] = None,
) -> Tuple[List[int], List[List[ChatEvent]]]:
    """Bucket events into fixed-width time bins.

    Args:
        events: List of chat events sorted by timestamp.
        bin_sec: Size of each bin in seconds.
        duration: Total duration to bin over in seconds.
        bot_users: Set of bot logins to ignore.

    Returns:
        Tuple of (counts_per_bin, events_per_bin).
    """
    bots = bot_users or set()
    num_bins = max(1, int(math.ceil(duration / bin_sec)))
    counts = [0] * num_bins
    bin_events_list: List[List[ChatEvent]] = [[] for _ in range(num_bins)]

    for ev in events:
        if ev.is_bot or (ev.user and ev.user in bots):
            continue
        idx = int(ev.t / bin_sec)
        if 0 <= idx < num_bins:
            counts[idx] += 1
            bin_events_list[idx].append(ev)

    return counts, bin_events_list


def smooth_counts(counts: List[int], smooth_bins: int) -> List[float]:
    """Causal trailing moving average of bin counts.

    Using a causal moving average preserves strict equivalence between
    batch replay and streaming live detection.
    """
    if not counts:
        return []
    window = max(1, smooth_bins)
    smoothed = [0.0] * len(counts)
    for i in range(len(counts)):
        start = max(0, i - window + 1)
        sub = counts[start : i + 1]
        smoothed[i] = sum(sub) / len(sub)
    return smoothed


def compute_baseline_for_bin(
    smoothed_history: List[float],
    baseline_stat: str = "median",
    min_baseline: float = 1.0,
    min_required_bins: int = 1,
) -> float:
    """Compute baseline rate from available history bins."""
    if len(smoothed_history) < min_required_bins:
        return float(min_baseline)
    if baseline_stat == "mean":
        val = mean(smoothed_history)
    else:
        val = median(smoothed_history)
    return max(float(min_baseline), float(val))


def compute_baselines(
    smoothed: List[float],
    bin_sec: float,
    baseline_sec: float,
    baseline_stat: str = "median",
    min_baseline: float = 1.0,
    gap_bins: Optional[Set[int]] = None,
) -> List[float]:
    """Compute rolling baseline for each bin from trailing history (Appendix D.1 step 3).

    Gaps are excluded from the baseline history.
    """
    gaps = gap_bins or set()
    num_bins = len(smoothed)
    baselines = [min_baseline] * num_bins
    history_window_bins = max(1, int(round(baseline_sec / bin_sec)))

    for i in range(num_bins):
        start = max(0, i - history_window_bins)
        history = [smoothed[j] for j in range(start, i) if j not in gaps]
        if not history:
            baselines[i] = max(min_baseline, smoothed[i])
        else:
            baselines[i] = compute_baseline_for_bin(history, baseline_stat, min_baseline)

    return baselines


def find_candidate_bins(
    smoothed: List[float],
    baselines: List[float],
    ratio_threshold: float,
    gap_bins: Optional[Set[int]] = None,
) -> List[int]:
    """Find bins where smoothed / baseline >= ratio_threshold, excluding gaps."""
    gaps = gap_bins or set()
    candidates = []
    for i in range(len(smoothed)):
        if i in gaps:
            continue
        base = baselines[i]
        if base > 0 and (smoothed[i] / base) >= ratio_threshold:
            candidates.append(i)
    return candidates


def group_candidate_spikes(
    candidate_bins: List[int],
    counts: List[int],
    smoothed: List[float],
    baselines: List[float],
    min_count: int,
) -> List[Dict]:
    """Group contiguous candidate bins into candidate spikes (Appendix D.1 step 5)."""
    if not candidate_bins:
        return []

    groups: List[List[int]] = []
    current_group: List[int] = [candidate_bins[0]]

    for b in candidate_bins[1:]:
        if b == current_group[-1] + 1:
            current_group.append(b)
        else:
            groups.append(current_group)
            current_group = [b]
    if current_group:
        groups.append(current_group)

    spikes_raw = []
    for grp in groups:
        # Peak is bin with highest raw count (break tie with smoothed count)
        peak_bin = max(grp, key=lambda b: (counts[b], smoothed[b]))
        group_total = sum(counts[b] for b in grp)
        if group_total < min_count:
            continue
        spikes_raw.append({
            "candidate_bins": grp,
            "peak_bin": peak_bin,
            "peak_count": group_total,
            "peak_ratio": smoothed[peak_bin] / max(0.001, baselines[peak_bin]),
            "peak_baseline": baselines[peak_bin],
        })

    return spikes_raw


def expand_onset_and_end(
    peak_bin: int,
    smoothed: List[float],
    baselines: List[float],
    onset_ratio: float,
    end_ratio: float,
    bin_sec: float,
    total_bins: int,
    gap_bins: Optional[Set[int]] = None,
) -> Tuple[float, float, float]:
    """Walk backward for onset and forward for end (Appendix D.1 step 6).

    Returns:
        Tuple of (onset_sec, peak_sec, end_sec).
    """
    gaps = gap_bins or set()
    # 1. Onset: walk backward while ratio >= onset_ratio
    onset_bin = peak_bin
    curr = peak_bin - 1
    while curr >= 0 and curr not in gaps:
        ratio = smoothed[curr] / max(0.001, baselines[curr])
        if ratio >= onset_ratio:
            onset_bin = curr
            curr -= 1
        else:
            break

    # 2. End: walk forward until ratio is below end_ratio for 2 consecutive bins
    end_bin = peak_bin
    curr = peak_bin + 1
    below_count = 0
    while curr < total_bins and curr not in gaps:
        ratio = smoothed[curr] / max(0.001, baselines[curr])
        if ratio < end_ratio:
            below_count += 1
            if below_count >= 2:
                # Spike ended before the 2 consecutive bins below ratio
                end_bin = max(peak_bin, curr - 2 + 1)
                break
        else:
            below_count = 0
            end_bin = curr
        curr += 1
    else:
        end_bin = min(total_bins - 1, curr - 1)

    onset_sec = round(onset_bin * bin_sec, 3)
    peak_sec = round((peak_bin + 0.5) * bin_sec, 3)
    end_sec = round((end_bin + 1) * bin_sec, 3)
    return onset_sec, peak_sec, max(peak_sec, end_sec)


def compute_quality_signals(
    events_in_window: List[ChatEvent],
    spam_text_share: float = 0.6,
) -> Tuple[int, float, float, List[str]]:
    """Calculate quality metrics and tags inside [onset, end] (Appendix D.1 step 8)."""
    if not events_in_window:
        return 0, 0.0, 0.0, []

    total = len(events_in_window)
    users = {e.user for e in events_in_window if e.user}
    unique_users = len(users)

    # Emote share: messages with emote count > 0 or all-caps emote tokens
    emote_msgs = sum(1 for e in events_in_window if e.emotes > 0 or is_likely_emote(e.text))
    emote_share = round(emote_msgs / total, 3)

    # Spam share: share of most common normalized text
    text_counts: Dict[str, int] = {}
    for e in events_in_window:
        t = (e.text or "").strip().lower()
        if t:
            text_counts[t] = text_counts.get(t, 0) + 1

    max_text_count = max(text_counts.values()) if text_counts else 0
    spam_share = round(max_text_count / total, 3) if total > 0 else 0.0

    tags: List[str] = []
    if spam_share >= spam_text_share:
        tags.append("spam_heavy")

    return unique_users, emote_share, spam_share, tags


def calculate_score(
    ratio: float,
    peak_count: int,
    unique_users: int,
    emote_share: float,
    tags: List[str],
) -> float:
    """Calculate 0..100 excitement score (Appendix D.1 step 9)."""
    # 1. Ratio contribution (up to 40 pts)
    ratio_score = min(40.0, max(0.0, (ratio - 1.0) * 8.0))

    # 2. Volume contribution (up to 25 pts)
    volume_score = min(25.0, math.log10(max(1, peak_count) + 1) * 12.0)

    # 3. Chatter diversity contribution (up to 20 pts)
    diversity_score = min(20.0, math.log10(max(1, unique_users) + 1) * 10.0)

    # 4. Emote bonus (up to 15 pts)
    emote_score = emote_share * 15.0

    total = ratio_score + volume_score + diversity_score + emote_score

    # Penalties
    if "spam_heavy" in tags:
        total -= 25.0
    if "possible_raid" in tags:
        total -= 20.0

    return round(max(0.0, min(100.0, total)), 1)


def merge_close_spikes(spikes: List[Dict], min_gap_sec: float) -> List[Dict]:
    """Merge spikes whose peaks are closer than min_gap_sec (Appendix D.1 step 7)."""
    if len(spikes) <= 1:
        return list(spikes)

    # Sort chronologically by peak
    sorted_spikes = sorted(spikes, key=lambda s: s["peak"])
    merged: List[Dict] = [sorted_spikes[0]]

    for nxt in sorted_spikes[1:]:
        prev = merged[-1]
        if nxt["peak"] - prev["peak"] < min_gap_sec:
            # Merge: keep the one with higher score
            better = prev if prev["score"] >= nxt["score"] else nxt
            weaker = nxt if prev["score"] >= nxt["score"] else prev

            all_tags = sorted(list(set(prev.get("tags", []) + nxt.get("tags", []))))
            combined = {
                "onset": min(prev["onset"], nxt["onset"]),
                "peak": better["peak"],
                "end": max(prev["end"], nxt["end"]),
                "peak_count": max(prev["peak_count"], nxt["peak_count"]),
                "baseline": better["baseline"],
                "ratio": max(prev["ratio"], nxt["ratio"]),
                "unique_users": max(prev["unique_users"], nxt["unique_users"]),
                "emote_share": better["emote_share"],
                "spam_share": max(prev.get("spam_share", 0.0), nxt.get("spam_share", 0.0)),
                "score": better["score"],
                "tags": all_tags,
                "events": prev.get("events", []) + nxt.get("events", []),
            }
            merged[-1] = combined
        else:
            merged.append(nxt)

    return merged


def detect_spikes(
    events: List[ChatEvent],
    config: Optional[DetectorConfig] = None,
    duration: Optional[float] = None,
    gap_spans: Optional[List[Tuple[float, float]]] = None,
) -> Tuple[List[Spike], List[Dict]]:
    """Run the batch spike detection algorithm on a list of chat events.

    Args:
        events: List of ChatEvent objects.
        config: DetectorConfig (defaults used if None).
        duration: Total session duration (computed from events if None).
        gap_spans: Optional list of (start_sec, end_sec) periods to mark as gaps.

    Returns:
        Tuple of (spikes, series_points) where series_points is [{t, count, smoothed, baseline, gap}].
    """
    cfg = config or DetectorConfig()
    total_duration = duration if duration is not None else (max((e.t for e in events), default=0.0))

    if total_duration <= 0.0 or not events:
        return [], []

    # 1. Identify gap bins
    gaps: Set[int] = set()
    for gs, ge in gap_spans or []:
        start_bin = int(gs / cfg.bin_sec)
        end_bin = int(math.ceil(ge / cfg.bin_sec))
        for b in range(start_bin, end_bin + 1):
            gaps.add(b)

    # 2. Bin events
    bots = set(cfg.bot_users)
    counts, bin_events_list = bin_events(events, cfg.bin_sec, total_duration, bots)
    num_bins = len(counts)

    # 3. Smooth
    smoothed = smooth_counts(counts, cfg.smooth_bins)

    # 4. Rolling baseline
    baselines = compute_baselines(smoothed, cfg.bin_sec, cfg.baseline_sec, cfg.baseline_stat, cfg.min_baseline, gaps)

    # 5. Candidate bins & grouping
    candidate_bins = find_candidate_bins(smoothed, baselines, cfg.ratio_threshold, gaps)
    raw_spikes = group_candidate_spikes(candidate_bins, counts, smoothed, baselines, cfg.min_count)

    # 6. Expand onset/end and evaluate signals for each spike
    candidate_records: List[Dict] = []
    for sp in raw_spikes:
        onset_sec, peak_sec, end_sec = expand_onset_and_end(
            sp["peak_bin"], smoothed, baselines, cfg.onset_ratio, cfg.end_ratio, cfg.bin_sec, num_bins, gaps
        )
        # Collect all events in [onset_sec, end_sec]
        window_events = [e for e in events if onset_sec <= e.t <= end_sec and not e.is_bot and (not e.user or e.user not in bots)]
        unique_users, emote_share, spam_share, tags = compute_quality_signals(window_events, cfg.spam_text_share)
        score = calculate_score(sp["peak_ratio"], sp["peak_count"], unique_users, emote_share, tags)

        candidate_records.append({
            "onset": onset_sec,
            "peak": peak_sec,
            "end": end_sec,
            "peak_count": sp["peak_count"],
            "baseline": round(sp["peak_baseline"], 2),
            "ratio": round(sp["peak_ratio"], 2),
            "unique_users": unique_users,
            "emote_share": emote_share,
            "spam_share": spam_share,
            "score": score,
            "tags": tags,
            "events": window_events,
        })

    # 7. Merge close spikes
    merged_records = merge_close_spikes(candidate_records, cfg.min_gap_sec)

    # 8. Compute clip windows and produce final Spike dataclasses
    spikes: List[Spike] = []
    for idx, rec in enumerate(merged_records):
        s_start, s_end = compute_clip_window(
            rec["onset"],
            rec["end"],
            duration=total_duration,
            before_sec=cfg.before_sec,
            after_sec=cfg.after_sec,
            min_len=cfg.min_len,
            max_len=cfg.max_len,
        )
        spike_id = f"sp_{int(rec['peak'])}_{idx + 1}"
        spikes.append(Spike(
            id=spike_id,
            onset=rec["onset"],
            peak=rec["peak"],
            end=rec["end"],
            peak_count=rec["peak_count"],
            baseline=rec["baseline"],
            ratio=rec["ratio"],
            unique_users=rec["unique_users"],
            emote_share=rec["emote_share"],
            spam_share=rec["spam_share"],
            score=rec["score"],
            suggested_start=s_start,
            suggested_end=s_end,
            tags=rec["tags"],
        ))

    # Sort by score descending, limit to max_spikes
    spikes.sort(key=lambda s: s.score, reverse=True)
    spikes = spikes[:cfg.max_spikes]

    # Prepare series points for graph
    series = [
        {
            "t": round(i * cfg.bin_sec, 2),
            "count": counts[i],
            "smoothed": round(smoothed[i], 2),
            "baseline": round(baselines[i], 2),
            "gap": i in gaps,
        }
        for i in range(num_bins)
    ]

    return spikes, series
