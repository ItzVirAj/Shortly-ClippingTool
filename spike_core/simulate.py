"""Replay simulator tool (Section 9 Task 3 of LIVE_CLIPPER_SPEC).

Replays recorded or synthetic chat events through LiveSpikeDetector at accelerated
speed and prints confirmed spikes with simulated confirmation times.
"""
import argparse
import json
import random
import sys
import time
from typing import List, Tuple

from .models import ChatEvent, DetectorConfig
from .live import LiveSpikeDetector


def format_hms(seconds: float) -> str:
    """Format seconds into H:MM:SS."""
    s = int(round(seconds))
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    return f"{h}:{m:02d}:{sec:02d}"


def generate_synthetic_events(
    duration: float = 3600.0,
    base_rate: float = 0.5,
    bursts: List[Tuple[float, float, float]] = None,
) -> List[ChatEvent]:
    """Generate synthetic chat events with baseline activity and bursts."""
    bursts = bursts or []
    events: List[ChatEvent] = []
    t = 0.0

    users_pool = [f"user_{i}" for i in range(1, 100)]
    emotes_pool = ["LUL", "KEKW", "Pog", "W", "GG", "OMG"]

    # Simple simulation stepping in 0.5s increments
    step = 0.5
    while t < duration:
        rate = base_rate
        is_burst = False
        for b_start, b_len, b_mult in bursts:
            if b_start <= t < b_start + b_len:
                rate = base_rate * b_mult
                is_burst = True
                break

        # Number of messages in this step (Poisson approximation)
        expected = rate * step
        count = int(expected) + (1 if random.random() < (expected - int(expected)) else 0)

        for _ in range(count):
            ev_t = round(t + random.uniform(0.0, step), 3)
            user = random.choice(users_pool)
            if is_burst:
                txt = random.choice(emotes_pool)
                emotes = 1
            else:
                txt = "chatting" if random.random() < 0.8 else random.choice(emotes_pool)
                emotes = 1 if txt in emotes_pool else 0
            events.append(ChatEvent(t=ev_t, user=user, text=txt, emotes=emotes))

        t += step

    events.sort(key=lambda e: e.t)
    return events


def load_events_from_jsonl(path: str) -> List[ChatEvent]:
    """Load events from a JSON Lines file."""
    events: List[ChatEvent] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            data = json.loads(line)
            events.append(ChatEvent(
                t=float(data["t"]),
                user=data.get("user"),
                text=data.get("text"),
                emotes=int(data.get("emotes") or 0),
                is_bot=bool(data.get("is_bot", False)),
            ))
    events.sort(key=lambda e: e.t)
    return events


def run_simulation(
    events: List[ChatEvent],
    speed: float = 20.0,
    gaps: List[Tuple[float, float]] = None,
    config: DetectorConfig = None,
) -> None:
    """Run events through LiveSpikeDetector with simulated time advances."""
    detector = LiveSpikeDetector(config=config)
    for gs, ge in gaps or []:
        detector.mark_gap(gs, ge)

    if not events:
        print("No events to simulate.")
        return

    sim_start_time = events[0].t
    sim_end_time = events[-1].t + 30.0

    print(f"🎬 Starting simulation from {format_hms(sim_start_time)} to {format_hms(sim_end_time)} ({len(events)} events, speed: {speed}x)...")
    print(f"{'Sim Time':<10} | {'Spike ID':<16} | {'Peak Time':<10} | {'Peak Cnt':<8} | {'Ratio':<6} | {'Score':<6} | {'Suggested Window':<20} | Tags")
    print("-" * 105)

    ev_idx = 0
    num_events = len(events)
    sim_now = sim_start_time

    # Advance in increments of 1 second
    while sim_now <= sim_end_time:
        # Push all events up to sim_now
        while ev_idx < num_events and events[ev_idx].t <= sim_now:
            detector.push(events[ev_idx])
            ev_idx += 1

        detector.advance(sim_now)

        new_spikes = detector.poll()
        for sp in new_spikes:
            tags_str = ", ".join(sp.tags) if sp.tags else "none"
            window_str = f"{format_hms(sp.suggested_start)} - {format_hms(sp.suggested_end)}"
            print(
                f"{format_hms(sim_now):<10} | "
                f"{sp.id:<16} | "
                f"{format_hms(sp.peak):<10} | "
                f"{sp.peak_count:<8} | "
                f"{sp.ratio:<6.1f} | "
                f"{sp.score:<6.1f} | "
                f"{window_str:<20} | "
                f"{tags_str}"
            )

        sim_now += 1.0

    print("-" * 105)
    print("✅ Simulation complete.")


def main():
    parser = argparse.ArgumentParser(description="Replay simulator for LiveSpikeDetector")
    parser.add_argument("--events", type=str, help="Path to events.jsonl file")
    parser.add_argument("--speed", type=float, default=20.0, help="Replay speed multiplier")
    parser.add_argument("--gap", type=str, action="append", help="Simulate gap as START:END (seconds)")
    parser.add_argument("--synthetic", action="store_true", help="Generate synthetic chat events")
    parser.add_argument("--duration", type=float, default=3600.0, help="Duration for synthetic data in seconds")
    parser.add_argument("--base-rate", type=float, default=0.5, help="Baseline chat rate in msgs/sec")
    parser.add_argument("--burst", type=str, action="append", help="Synthetic burst as START:LENGTH:MULTIPLIER")

    parser.add_argument("--spike", "--ratio", dest="ratio", type=float, default=2.5, help="Spike ratio threshold multiplier (default 2.5x median)")
    parser.add_argument("--min", dest="min_count", type=int, default=5, help="Minimum messages in window to qualify as spike (default 5)")

    args = parser.parse_args()

    gaps: List[Tuple[float, float]] = []
    if args.gap:
        for g in args.gap:
            parts = g.split(":")
            if len(parts) == 2:
                gaps.append((float(parts[0]), float(parts[1])))

    if args.synthetic:
        bursts: List[Tuple[float, float, float]] = []
        if args.burst:
            for b in args.burst:
                parts = b.split(":")
                if len(parts) == 3:
                    bursts.append((float(parts[0]), float(parts[1]), float(parts[2])))
        else:
            # Default burst at 600s
            bursts = [(600.0, 20.0, 12.0)]
        events = generate_synthetic_events(duration=args.duration, base_rate=args.base_rate, bursts=bursts)
    elif args.events:
        events = load_events_from_jsonl(args.events)
    else:
        parser.print_help()
        sys.exit(1)

    cfg = DetectorConfig(
        bin_sec=10.0,
        baseline_sec=180.0,
        ratio_threshold=args.ratio,
        min_count=args.min_count,
    )
    run_simulation(events, speed=args.speed, gaps=gaps, config=cfg)


if __name__ == "__main__":
    main()
