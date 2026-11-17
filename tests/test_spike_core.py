"""Unit tests for spike_core (Section 9 Task 4 of LIVE_CLIPPER_SPEC)."""
import pytest
import random
from typing import List

from spike_core.models import ChatEvent, DetectorConfig, Spike
from spike_core.detector import detect_spikes
from spike_core.windows import compute_clip_window
from spike_core.live import LiveSpikeDetector


def _generate_events(start_t: float, count: int, duration_sec: float, text: str = "msg", user_prefix: str = "user") -> List[ChatEvent]:
    events = []
    step = duration_sec / max(1, count)
    for i in range(count):
        t = start_t + i * step
        events.append(ChatEvent(
            t=round(t, 3),
            user=f"{user_prefix}_{i}",
            text=text,
            emotes=1 if i % 2 == 0 else 0,
        ))
    return events


# ---------------------------------------------------------------------------
# Batch Detector Tests
# ---------------------------------------------------------------------------

def test_flat_steady_chat_no_spikes():
    """Flat steady chat gives no spikes. Empty input and single message do not crash and give no spikes."""
    config = DetectorConfig(ratio_threshold=3.0, min_count=15)

    # 1. Empty input
    spikes_empty, series_empty = detect_spikes([], config=config, duration=100.0)
    assert spikes_empty == []

    # 2. Single message
    spikes_single, _ = detect_spikes([ChatEvent(t=10.0, user="u1", text="hi")], config=config, duration=100.0)
    assert spikes_single == []

    # 3. Flat steady chat: 2 messages every 5 seconds for 600s
    events = []
    for t in range(0, 600, 5):
        events.append(ChatEvent(t=float(t) + 1.0, user="u1", text="msg1"))
        events.append(ChatEvent(t=float(t) + 3.0, user="u2", text="msg2"))

    spikes_flat, _ = detect_spikes(events, config=config, duration=600.0)
    assert spikes_flat == []


def test_one_clear_burst_detected():
    """One clear burst gives exactly one spike with onset < peak <= end; suggested start is >= before_sec before onset."""
    config = DetectorConfig(ratio_threshold=3.0, min_count=15, before_sec=25.0, after_sec=10.0)

    # 300s baseline at 1 msg/sec (5 msgs/bin)
    events = []
    for t in range(300):
        events.append(ChatEvent(t=float(t), user=f"u_{t % 10}", text="chat"))

    # Burst at t=350 to t=360: 60 messages in 10s (30 msgs/bin -> 6x ratio)
    events.extend(_generate_events(start_t=350.0, count=60, duration_sec=10.0, text="LUL"))

    # Follow-up steady chat to 500s
    for t in range(370, 500):
        events.append(ChatEvent(t=float(t), user=f"u_{t % 10}", text="chat"))

    spikes, _ = detect_spikes(events, config=config, duration=500.0)
    assert len(spikes) == 1
    sp = spikes[0]

    assert sp.onset < sp.peak <= sp.end
    assert 340.0 <= sp.onset <= 360.0
    assert 350.0 <= sp.peak <= 365.0
    assert sp.end >= sp.peak
    # Suggested start should lead onset by at least before_sec (clamped at 0)
    assert sp.suggested_start <= sp.onset - config.before_sec + 0.1
    assert sp.suggested_start >= 0.0


def test_two_bursts_close_merge_two_bursts_far_separate():
    """Two bursts 30s apart merge into one; two bursts 120s apart give two."""
    config = DetectorConfig(ratio_threshold=3.0, min_count=15, min_gap_sec=60.0)

    # Baseline 300s
    events = [ChatEvent(t=float(t), user=f"u_{t % 5}") for t in range(300)]

    # 1. Two bursts 30 seconds apart (peak at ~330 and ~360) -> 30s difference < 60s min_gap_sec -> merged
    events_close = list(events)
    events_close.extend(_generate_events(start_t=330.0, count=40, duration_sec=8.0, text="Pog"))
    events_close.extend(_generate_events(start_t=360.0, count=40, duration_sec=8.0, text="Pog"))
    spikes_merged, _ = detect_spikes(events_close, config=config, duration=500.0)
    assert len(spikes_merged) == 1

    # 2. Two bursts 120 seconds apart (peak at ~330 and ~450) -> 120s difference > 60s min_gap_sec -> 2 distinct spikes
    events_far = list(events)
    events_far.extend(_generate_events(start_t=330.0, count=40, duration_sec=8.0, text="Pog"))
    events_far.extend(_generate_events(start_t=450.0, count=40, duration_sec=8.0, text="Pog"))
    spikes_separate, _ = detect_spikes(events_far, config=config, duration=600.0)
    assert len(spikes_separate) == 2
    assert abs(spikes_separate[0].peak - spikes_separate[1].peak) > 60.0


def test_quiet_channel_random_messages_no_spike():
    """A quiet channel with 3 random messages in one bin gives no spike (min_count floor)."""
    config = DetectorConfig(ratio_threshold=3.0, min_count=15, min_baseline=1.0)
    # Channel with total 3 messages in bin at t=50
    events = [
        ChatEvent(t=50.1, user="u1", text="hi"),
        ChatEvent(t=50.5, user="u2", text="hello"),
        ChatEvent(t=51.0, user="u3", text="anyone here"),
    ]
    spikes, _ = detect_spikes(events, config=config, duration=100.0)
    assert spikes == []


def test_burst_in_quiet_part_after_busy_part():
    """A modest burst in a quiet part of a stream that was busy earlier is still detected (rolling baseline)."""
    config = DetectorConfig(baseline_sec=120.0, ratio_threshold=3.0, min_count=15)

    # 1. Busy period: t=0..200 at 5 msgs/sec (25 msgs/bin)
    events = []
    for t in range(0, 200):
        for _ in range(5):
            events.append(ChatEvent(t=float(t) + 0.1, user="u"))

    # 2. Quiet period: t=200..450 at 0.2 msgs/sec (1 msg/bin) -> baseline decays toward min_baseline over baseline_sec (120s)
    for t in range(200, 450, 5):
        events.append(ChatEvent(t=float(t), user="u"))

    # 3. Modest burst at t=460: 25 messages in 10s (would be normal at t=100, but a spike during quiet period)
    events.extend(_generate_events(start_t=460.0, count=25, duration_sec=10.0, text="WOW"))

    spikes, _ = detect_spikes(events, config=config, duration=500.0)
    assert len(spikes) >= 1
    assert any(455.0 <= s.peak <= 475.0 for s in spikes)


def test_spam_heavy_burst_and_bot_ignored():
    """A burst of 80% identical messages gets spam_heavy tag and lower score; bot users are ignored."""
    config = DetectorConfig(
        ratio_threshold=3.0,
        min_count=15,
        spam_text_share=0.6,
        bot_users=["Nightbot", "StreamElements"],
    )

    events = [ChatEvent(t=float(t), user=f"u_{t % 5}") for t in range(300)]

    # 1. Injected bot messages at t=250 (should be completely ignored and not trigger a spike)
    for i in range(50):
        events.append(ChatEvent(t=250.0 + i * 0.1, user="Nightbot", text="Song playing now", is_bot=True))

    # 2. Human burst at t=350 with 85% copy-paste text
    spam_events = []
    for i in range(40):
        txt = "!giveaway" if i < 34 else "hello"
        spam_events.append(ChatEvent(t=350.0 + i * 0.2, user=f"chatter_{i}", text=txt))
    events.extend(spam_events)

    spikes, _ = detect_spikes(events, config=config, duration=450.0)
    # The bot burst at 250 must not create a spike
    assert not any(245.0 <= s.peak <= 260.0 for s in spikes)

    # The spam burst at 350 must be detected and tagged spam_heavy
    spike_350 = next(s for s in spikes if 345.0 <= s.peak <= 365.0)
    assert "spam_heavy" in spike_350.tags
    assert spike_350.spam_share >= 0.8
    # Score has spam penalty
    assert spike_350.score < 80.0


def test_clip_window_clamping():
    """Clip windows clamp correctly: start never below 0, end never above duration, length within [min_len, max_len]."""
    # Spike at t=5s with stream duration 40s (before_sec=25) -> start would be -20 without clamping
    s_start, s_end = compute_clip_window(
        onset=5.0,
        spike_end=15.0,
        duration=40.0,
        before_sec=25.0,
        after_sec=10.0,
        min_len=20.0,
        max_len=60.0,
    )
    assert s_start == 0.0
    assert s_end <= 40.0
    assert (s_end - s_start) >= 20.0

    # Long burst: onset 10, end 90 -> raw span 80s -> exceeds max_len 60s
    s_start_l, s_end_l = compute_clip_window(
        onset=30.0,
        spike_end=120.0,
        duration=200.0,
        before_sec=25.0,
        after_sec=10.0,
        min_len=20.0,
        max_len=60.0,
    )
    assert s_start_l == 5.0
    assert s_end_l == 65.0
    assert round(s_end_l - s_start_l, 2) == 60.0


def test_batch_determinism():
    """Determinism: the same input twice gives identical output."""
    config = DetectorConfig()
    events = [ChatEvent(t=float(t), user="u", text="hi") for t in range(200)]
    events.extend(_generate_events(250.0, 50, 8.0, text="LUL"))

    spikes1, series1 = detect_spikes(events, config=config, duration=350.0)
    spikes2, series2 = detect_spikes(events, config=config, duration=350.0)

    assert len(spikes1) == len(spikes2)
    for s1, s2 in zip(spikes1, spikes2):
        assert s1.peak == s2.peak
        assert s1.score == s2.score
        assert s1.suggested_start == s2.suggested_start
        assert s1.suggested_end == s2.suggested_end


# ---------------------------------------------------------------------------
# Live Detector Tests
# ---------------------------------------------------------------------------

def test_live_confirmed_only_after_delay():
    """A burst is returned by poll() only after its end plus confirm_delay_sec, never before."""
    detector = LiveSpikeDetector(
        config=DetectorConfig(ratio_threshold=3.0, min_count=15),
        confirm_delay_sec=8.0,
    )

    # 1. Warm up baseline 0..100s
    for t in range(100):
        detector.push(ChatEvent(t=float(t), user="u", text="hi"))

    assert detector.poll() == []

    # 2. Burst at t=120..130s
    for i in range(50):
        detector.push(ChatEvent(t=120.0 + i * 0.2, user=f"u_{i}", text="LUL"))

    # Advancing through 132s, 140s, 146s: candidate is active/cooling down and confirmation delay has not elapsed
    detector.advance(132.0)
    assert detector.poll() == []

    detector.advance(140.0)
    assert detector.poll() == []

    detector.advance(146.0)
    assert detector.poll() == []

    # At t=150s, confirm_delay_sec (8s) has passed since spike end (ended at 140s after 2 below-threshold bins)
    detector.advance(150.0)
    confirmed = detector.poll()
    assert len(confirmed) == 1
    assert 120.0 <= confirmed[0].peak <= 135.0

    # Poll clears the queue
    assert detector.poll() == []


def test_live_advance_confirms_spike_in_silence():
    """advance(now) alone confirms a spike when no more events arrive."""
    detector = LiveSpikeDetector(confirm_delay_sec=5.0)

    for t in range(60):
        detector.push(ChatEvent(t=float(t), user="u"))
    for i in range(40):
        detector.push(ChatEvent(t=65.0 + i * 0.1, user=f"u_{i}", text="W"))

    # Chat goes completely quiet. advance moves the clock
    detector.advance(75.0)
    assert detector.poll() == []

    # Advance past confirmation threshold
    detector.advance(90.0)
    confirmed = detector.poll()
    assert len(confirmed) == 1
    assert confirmed[0].peak_count >= 15


def test_live_cooldown():
    """Cooldown: two bursts 40s apart with a 90s cooldown produce one clip, the better one."""
    detector = LiveSpikeDetector(cooldown_sec=90.0, confirm_delay_sec=5.0)

    for t in range(100):
        detector.push(ChatEvent(t=float(t), user="u"))

    # Burst 1 at t=110: 25 messages
    for i in range(25):
        detector.push(ChatEvent(t=110.0 + i * 0.2, user=f"u_{i}", text="Pog"))
    detector.advance(125.0)

    # Burst 2 at t=150 (40s after burst 1 peak): 60 messages (much higher ratio and score)
    for i in range(60):
        detector.push(ChatEvent(t=150.0 + i * 0.1, user=f"u_{i}", text="LUL"))

    # Advance to confirm both
    detector.advance(200.0)
    spikes = detector.poll()
    # Within 90s cooldown, only the higher scoring spike is retained
    assert len(spikes) == 1
    assert spikes[0].peak >= 145.0
    assert spikes[0].peak_count == 60


def test_live_per_hour_cap():
    """Per-hour cap: the 13th spike within an hour is dropped and the cap flag is reported."""
    detector = LiveSpikeDetector(
        config=DetectorConfig(ratio_threshold=2.0, min_count=15),
        cooldown_sec=50.0,
        confirm_delay_sec=5.0,
        max_per_hour=12,
    )

    t = 0.0
    for burst_idx in range(14):
        # 30s of normal
        for _ in range(6):
            detector.push(ChatEvent(t=t, user="u"))
            t += 5.0
        # burst
        for i in range(20):
            detector.push(ChatEvent(t=t + i * 0.2, user=f"u_{i}", text="BURST"))
        t += 10.0
        detector.advance(t + 10.0)
        t += 60.0

    spikes = detector.poll()
    # Exactly 12 allowed in the 1-hour window
    assert len(spikes) == 12
    assert detector.cap_hit is True


def test_live_gaps_do_not_spike_or_lower_baseline():
    """Gaps: a 60-second gap inside a busy period does not create a spike and does not lower the baseline afterwards."""
    detector = LiveSpikeDetector()

    # Steady activity at t=0..120s
    for t in range(120):
        detector.push(ChatEvent(t=float(t), user="u"))

    # 60s gap at t=120..180s
    detector.mark_gap(120.0, 180.0)
    detector.advance(180.0)

    # Check that gap produced no spike
    assert detector.poll() == []

    # Resume chat at t=180..240s at normal rate
    for t in range(180, 240):
        detector.push(ChatEvent(t=float(t), user="u"))

    detector.advance(245.0)
    # Baseline shouldn't collapse to zero and cause fake spike
    assert detector.poll() == []


def test_live_out_of_order_events():
    """Events up to 2 seconds out of order are placed correctly; much later events are ignored without error."""
    detector = LiveSpikeDetector()

    detector.push(ChatEvent(t=10.0, user="u1"))
    detector.push(ChatEvent(t=12.0, user="u2"))
    detector.advance(13.0)

    # Out of order: arrives 1.5s late (t=11.5) -> should be accepted into target bin
    target_bin = int(10.0 / detector.config.bin_sec)
    detector.push(ChatEvent(t=11.5, user="u3"))
    assert detector.bins[target_bin]["count"] == 3

    # Way late event (t=0.5 when now is advanced to 600s)
    detector.advance(600.0)
    detector.push(ChatEvent(t=0.5, user="u_ancient"))  # Must not crash, ignored
    assert detector.poll() == []


def test_live_replay_equivalence():
    """Replay equivalence: the same recorded event list through LiveSpikeDetector and batch detector gives the same spikes."""
    config = DetectorConfig(ratio_threshold=3.0, min_count=15, baseline_sec=120.0)

    events = [ChatEvent(t=float(t), user=f"u_{t % 5}") for t in range(200)]
    events.extend(_generate_events(230.0, 45, 8.0, text="Pog"))
    for t in range(250, 400):
        events.append(ChatEvent(t=float(t), user=f"u_{t % 5}"))
    events.extend(_generate_events(420.0, 50, 8.0, text="LUL"))
    for t in range(440, 550):
        events.append(ChatEvent(t=float(t), user=f"u_{t % 5}"))

    # Batch detector run
    batch_spikes, _ = detect_spikes(events, config=config, duration=600.0)

    # Live detector run
    live_detector = LiveSpikeDetector(config=config, confirm_delay_sec=8.0, cooldown_sec=60.0)
    all_live_spikes = []
    for ev in events:
        live_detector.push(ev)
        live_detector.advance(ev.t)
        sp = live_detector.poll()
        if sp:
            all_live_spikes.extend(sp)

    # Advance to end to confirm remaining
    live_detector.advance(650.0)
    sp = live_detector.poll()
    if sp:
        all_live_spikes.extend(sp)

    # Both must find exactly 2 spikes
    assert len(batch_spikes) == 2
    assert len(all_live_spikes) == 2

    # Peaks should be within 1 bin (5 seconds) of each other
    for bs, ls in zip(sorted(batch_spikes, key=lambda s: s.peak), sorted(all_live_spikes, key=lambda s: s.peak)):
        assert abs(bs.peak - ls.peak) <= config.bin_sec


@pytest.mark.slow
def test_live_bounded_memory():
    """Bounded memory: pushing 5 million simulated events keeps the internal state size bounded."""
    detector = LiveSpikeDetector()

    # Stream 5,000,000 events over 500,000 virtual seconds
    total_events = 5_000_000
    for i in range(total_events):
        t = i * 0.1
        detector.push(ChatEvent(t=t, user="u"))
        if i % 10_000 == 0:
            detector.advance(t)
            detector.poll()

    detector.advance(total_events * 0.1)
    detector.poll()

    # Assert on internal counters (per spec):
    # 1. Active bins retained in memory are strictly bounded (e.g. 85 bins ~425s, well under 150)
    assert len(detector.bins) < 150
    # 2. History pruning advanced monotonically
    expected_min_bin = int(0.9 * ((total_events * 0.1) / detector.config.bin_sec))
    assert detector.min_bin_idx > expected_min_bin
    # 3. No leakage in pending or unpolled spike queues
    assert len(detector._pending_confirmation) == 0
    assert len(detector._unpolled_spikes) == 0
