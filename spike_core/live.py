"""Streaming live spike detector (Section 6 of LIVE_CLIPPER_SPEC).

Wraps the pure detector functions for real-time streaming consumption with
out-of-order tolerance, gap handling, confirmation delay, cooldown, and caps.
"""
import math
from typing import Dict, List, Optional, Set, Tuple

from .models import ChatEvent, DetectorConfig, Spike
from .detector import (
    compute_baseline_for_bin,
    compute_quality_signals,
    calculate_score,
    smooth_counts,
    is_likely_emote,
)
from .windows import compute_clip_window


class LiveSpikeDetector:
    """Real-time streaming chat spike detector.

    Consumes ChatEvents as they arrive, maintains rolling baseline, confirms
    spikes after end_ratio is reached and confirm_delay_sec passes, and enforces
    cooldown and per-hour limits.
    """

    def __init__(
        self,
        config: Optional[DetectorConfig] = None,
        confirm_delay_sec: float = 8.0,
        cooldown_sec: float = 90.0,
        max_per_hour: int = 12,
    ) -> None:
        self.config = config or DetectorConfig()
        self.confirm_delay_sec = float(confirm_delay_sec)
        self.cooldown_sec = float(cooldown_sec)
        self.max_per_hour = int(max_per_hour)

        self.now: float = 0.0
        self.gap_spans: List[Tuple[float, float]] = []
        self.gap_bins: Set[int] = set()

        # Binned state: bin_idx -> {"count": int, "events": list}
        self.bins: Dict[int, Dict] = {}
        self.min_bin_idx: int = 0

        # Spike detection state
        self._active_candidate: Optional[Dict] = None
        self._pending_confirmation: List[Dict] = []
        self._unpolled_spikes: List[Spike] = []

        # Cooldown & cap state
        self._last_confirmed_spike: Optional[Spike] = None
        self._confirmed_timestamps: List[float] = []
        self.cap_hit: bool = False
        self._spike_counter: int = 0

    def mark_gap(self, start: float, end: float) -> None:
        """Mark a period where chat was disconnected or unavailable."""
        s = float(start)
        e = float(end)
        if e <= s:
            return
        self.gap_spans.append((s, e))
        b_start = int(s / self.config.bin_sec)
        b_end = int(math.ceil(e / self.config.bin_sec))
        for b in range(b_start, b_end + 1):
            self.gap_bins.add(b)

    def _is_gap(self, bin_idx: int) -> bool:
        return bin_idx in self.gap_bins

    def push(self, event: ChatEvent) -> None:
        """Ingest a chat event from the session clock."""
        if event.is_bot or (event.user and event.user in self.config.bot_users):
            return

        ev_t = float(event.t)
        if ev_t > self.now:
            self.now = ev_t

        bin_idx = int(ev_t / self.config.bin_sec)

        # Ignore events older than our finalized retention window
        if bin_idx < self.min_bin_idx:
            return

        if bin_idx not in self.bins:
            self.bins[bin_idx] = {"count": 0, "events": []}

        self.bins[bin_idx]["count"] += 1
        self.bins[bin_idx]["events"].append(event)

        self._process_bins()

    def advance(self, now: float) -> None:
        """Move the session clock forward, even during chat silence."""
        target_now = float(now)
        if target_now > self.now:
            self.now = target_now
        self._process_bins()

    def _get_smoothed_and_baseline(self, target_bin: int) -> Tuple[float, float]:
        """Compute smoothed count and rolling baseline for target_bin."""
        bin_sec = self.config.bin_sec
        smooth_bins = self.config.smooth_bins

        # 1. Smoothed count (causal window)
        window_counts = []
        for b in range(max(self.min_bin_idx, target_bin - smooth_bins + 1), target_bin + 1):
            window_counts.append(self.bins[b]["count"] if b in self.bins else 0)
        smoothed = sum(window_counts) / len(window_counts) if window_counts else 0.0

        # 2. Baseline from trailing baseline_sec window (excluding gap bins)
        history_window_bins = max(1, int(round(self.config.baseline_sec / bin_sec)))
        start_hist = max(self.min_bin_idx, target_bin - history_window_bins)
        smoothed_hist: List[float] = []

        for b in range(start_hist, target_bin):
            if self._is_gap(b):
                continue
            # smoothed for b
            b_counts = []
            for sb in range(max(self.min_bin_idx, b - smooth_bins + 1), b + 1):
                b_counts.append(self.bins[sb]["count"] if sb in self.bins else 0)
            if b_counts:
                smoothed_hist.append(sum(b_counts) / len(b_counts))

        if not smoothed_hist:
            base = max(float(self.config.min_baseline), smoothed)
        else:
            base = compute_baseline_for_bin(
                smoothed_hist,
                self.config.baseline_stat,
                self.config.min_baseline,
            )
        return smoothed, base

    def _process_bins(self) -> None:
        """Update candidate states and check for confirmations."""
        bin_sec = self.config.bin_sec
        # Only evaluate bins that have completed: (b + 1) * bin_sec <= self.now
        max_eval_bin = int(self.now / bin_sec) - 1

        last_eval_bin = getattr(self, "_last_eval_bin", self.min_bin_idx - 1)

        for b in range(last_eval_bin + 1, max_eval_bin + 1):
            if self._is_gap(b):
                # Gaps reset active candidate
                self._active_candidate = None
                self._last_eval_bin = b
                continue

            count = self.bins[b]["count"] if b in self.bins else 0
            smoothed, baseline = self._get_smoothed_and_baseline(b)
            ratio = smoothed / max(0.001, baseline)

            # Check candidate threshold
            if ratio >= self.config.ratio_threshold:
                if self._active_candidate is None:
                    # New spike onset: walk backward to find earliest onset
                    onset_bin = b
                    walk_b = b - 1
                    while walk_b >= self.min_bin_idx and not self._is_gap(walk_b):
                        w_sm, w_base = self._get_smoothed_and_baseline(walk_b)
                        if (w_sm / max(0.001, w_base)) >= self.config.onset_ratio:
                            onset_bin = walk_b
                            walk_b -= 1
                        else:
                            break

                    self._active_candidate = {
                        "onset_bin": onset_bin,
                        "candidate_bins": [b],
                        "peak_bin": b,
                        "peak_count": count,
                        "peak_smoothed": smoothed,
                        "peak_baseline": baseline,
                        "peak_ratio": ratio,
                        "below_end_count": 0,
                    }
                else:
                    # Update active candidate peak
                    cand = self._active_candidate
                    cand["candidate_bins"].append(b)
                    if count > self.bins.get(cand["peak_bin"], {}).get("count", 0):
                        cand["peak_bin"] = b
                        cand["peak_smoothed"] = smoothed
                        cand["peak_baseline"] = baseline
                        cand["peak_ratio"] = ratio
                    cand["peak_count"] = max(cand["peak_count"], sum(self.bins[cb]["count"] for cb in cand["candidate_bins"] if cb in self.bins))
                    cand["below_end_count"] = 0
            elif self._active_candidate is not None:
                # Active candidate is cooling down
                cand = self._active_candidate
                if ratio < self.config.end_ratio:
                    cand["below_end_count"] += 1
                    if cand["below_end_count"] >= 2:
                        # Candidate spike ended!
                        end_bin = max(cand["peak_bin"], b - 2 + 1)
                        cand["end_bin"] = end_bin
                        cand["end_sec"] = (end_bin + 1) * bin_sec
                        cand["confirm_at"] = cand["end_sec"] + self.confirm_delay_sec
                        self._pending_confirmation.append(cand)
                        self._active_candidate = None
                else:
                    cand["below_end_count"] = 0
                    cand["candidate_bins"].append(b)
                    if count > self.bins.get(cand["peak_bin"], {}).get("count", 0):
                        cand["peak_bin"] = b
                        cand["peak_smoothed"] = smoothed
                        cand["peak_baseline"] = baseline
                        cand["peak_ratio"] = ratio
                    cand["peak_count"] = max(cand["peak_count"], sum(self.bins[cb]["count"] for cb in cand["candidate_bins"] if cb in self.bins))

            # Safety timeout: if candidate has exceeded max_len, finalize candidate so it never hangs
            if self._active_candidate is not None:
                cand = self._active_candidate
                candidate_duration = (b - cand["onset_bin"] + 1) * bin_sec
                if candidate_duration >= self.config.max_len:
                    end_bin = max(cand["peak_bin"], b)
                    cand["end_bin"] = end_bin
                    cand["end_sec"] = (end_bin + 1) * bin_sec
                    cand["confirm_at"] = cand["end_sec"] + self.confirm_delay_sec
                    self._pending_confirmation.append(cand)
                    self._active_candidate = None

            self._last_eval_bin = b

        # Check pending confirmations
        still_pending = []
        for cand in self._pending_confirmation:
            if self.now >= cand["confirm_at"]:
                self._confirm_candidate(cand)
            else:
                still_pending.append(cand)
        self._pending_confirmation = still_pending

        # Prune old bins to guarantee bounded memory
        self._prune_history()

    def _confirm_candidate(self, cand: Dict) -> None:
        """Evaluate signals, cooldown, and hourly cap for a confirmed spike."""
        bin_sec = self.config.bin_sec
        peak_count = cand["peak_count"]

        # 1. min_count check
        if peak_count < self.config.min_count:
            return

        onset_sec = round(cand["onset_bin"] * bin_sec, 3)
        peak_sec = round((cand["peak_bin"] + 0.5) * bin_sec, 3)
        end_sec = round(cand.get("end_sec", (cand["peak_bin"] + 1) * bin_sec), 3)

        # Collect events in window
        window_events: List[ChatEvent] = []
        for b in range(cand["onset_bin"], cand.get("end_bin", cand["peak_bin"]) + 1):
            if b in self.bins:
                window_events.extend(self.bins[b]["events"])

        unique_users, emote_share, spam_share, tags = compute_quality_signals(
            window_events, self.config.spam_text_share
        )
        score = calculate_score(cand["peak_ratio"], peak_count, unique_users, emote_share, tags)

        s_start, s_end = compute_clip_window(
            onset_sec,
            end_sec,
            duration=self.now,
            before_sec=self.config.before_sec,
            after_sec=self.config.after_sec,
            min_len=self.config.min_len,
            max_len=self.config.max_len,
        )

        self._spike_counter += 1
        spike_id = f"sp_live_{int(peak_sec)}_{self._spike_counter}"
        spike = Spike(
            id=spike_id,
            onset=onset_sec,
            peak=peak_sec,
            end=end_sec,
            peak_count=peak_count,
            baseline=round(cand["peak_baseline"], 2),
            ratio=round(cand["peak_ratio"], 2),
            unique_users=unique_users,
            emote_share=emote_share,
            spam_share=spam_share,
            score=score,
            suggested_start=s_start,
            suggested_end=s_end,
            tags=tags,
        )

        # 2. Cooldown check
        if self._last_confirmed_spike is not None:
            time_since_last_peak = peak_sec - self._last_confirmed_spike.peak
            if time_since_last_peak < self.cooldown_sec:
                if spike.score > self._last_confirmed_spike.score:
                    # Replace with higher scoring spike in unpolled queue
                    if self._unpolled_spikes and self._unpolled_spikes[-1].id == self._last_confirmed_spike.id:
                        self._unpolled_spikes.pop()
                    self._unpolled_spikes.append(spike)
                    self._last_confirmed_spike = spike
                return

        # 3. Per-hour cap check
        cutoff = self.now - 3600.0
        self._confirmed_timestamps = [t for t in self._confirmed_timestamps if t >= cutoff]
        if len(self._confirmed_timestamps) >= self.max_per_hour:
            self.cap_hit = True
            return

        self._confirmed_timestamps.append(self.now)
        self._last_confirmed_spike = spike
        self._unpolled_spikes.append(spike)

    def _prune_history(self) -> None:
        """Purge bins older than the required baseline and active spike window."""
        bin_sec = self.config.bin_sec
        # Keep baseline_sec + extra margin (total ~400 seconds of history)
        keep_sec = max(self.config.baseline_sec, 300.0) + 120.0
        keep_bins = int(keep_sec / bin_sec)
        current_bin = int(self.now / bin_sec)
        retention_floor = max(0, current_bin - keep_bins)

        # Do not prune below active candidate onset
        if self._active_candidate is not None:
            retention_floor = min(retention_floor, self._active_candidate["onset_bin"])

        for cand in self._pending_confirmation:
            retention_floor = min(retention_floor, cand["onset_bin"])

        if retention_floor > self.min_bin_idx:
            for b in list(self.bins.keys()):
                if b < retention_floor:
                    del self.bins[b]
            self.min_bin_idx = retention_floor

    def poll(self) -> List[Spike]:
        """Return newly confirmed spikes since last call and clear the queue."""
        res = list(self._unpolled_spikes)
        self._unpolled_spikes.clear()
        return res

    def series(self, since: Optional[float] = None) -> List[Dict]:
        """Return binned graph points for the UI."""
        bin_sec = self.config.bin_sec
        current_bin = int(self.now / bin_sec)

        if since is not None:
            start_bin = max(self.min_bin_idx, int(float(since) / bin_sec))
        else:
            # Default to last 10 minutes (600s)
            start_bin = max(self.min_bin_idx, current_bin - int(600.0 / bin_sec))

        points = []
        for b in range(start_bin, current_bin + 1):
            t = round(b * bin_sec, 2)
            cnt = self.bins[b]["count"] if b in self.bins else 0
            sm, base = self._get_smoothed_and_baseline(b)
            points.append({
                "t": t,
                "count": cnt,
                "smoothed": round(sm, 2),
                "baseline": round(base, 2),
                "gap": self._is_gap(b),
            })
        return points
