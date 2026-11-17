"""Batch debug and inspection CLI (Section 9 Task 3 of LIVE_CLIPPER_SPEC).

Runs the batch detector on a .jsonl events file and prints top spikes,
with an optional export of the binned series to CSV.
"""
import argparse
import csv
import sys
from typing import List

from .models import ChatEvent, DetectorConfig
from .detector import detect_spikes
from .simulate import format_hms, load_events_from_jsonl


def main():
    parser = argparse.ArgumentParser(description="Debug batch spike detection on events JSONL")
    parser.add_argument("file", type=str, help="Path to events.jsonl file")
    parser.add_argument("--csv", type=str, dest="csv_path", default=None, help="Export binned series to CSV")
    parser.add_argument("--top", type=int, default=10, help="Number of top spikes to show")

    args = parser.parse_args()

    try:
        events = load_events_from_jsonl(args.file)
    except Exception as e:
        print(f"❌ Error loading events from {args.file}: {e}")
        sys.exit(1)

    print(f"🔍 Loaded {len(events)} events from {args.file}.")
    config = DetectorConfig()
    spikes, series = detect_spikes(events, config=config)

    print(f"\n📊 Detected {len(spikes)} spikes (showing top {min(len(spikes), args.top)}):")
    print(f"{'Rank':<5} | {'Spike ID':<14} | {'Peak Time':<10} | {'Peak Cnt':<8} | {'Ratio':<6} | {'Score':<6} | {'Suggested Window':<20} | Tags")
    print("-" * 105)

    for i, sp in enumerate(spikes[:args.top], 1):
        window_str = f"{format_hms(sp.suggested_start)} - {format_hms(sp.suggested_end)}"
        tags_str = ", ".join(sp.tags) if sp.tags else "none"
        print(
            f"{i:<5} | "
            f"{sp.id:<14} | "
            f"{format_hms(sp.peak):<10} | "
            f"{sp.peak_count:<8} | "
            f"{sp.ratio:<6.1f} | "
            f"{sp.score:<6.1f} | "
            f"{window_str:<20} | "
            f"{tags_str}"
        )
    print("-" * 105)

    if args.csv_path:
        try:
            with open(args.csv_path, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=["t", "count", "smoothed", "baseline", "gap"])
                writer.writeheader()
                writer.writerows(series)
            print(f"📁 Binned time series written to {args.csv_path} ({len(series)} points).")
        except Exception as e:
            print(f"❌ Error exporting CSV: {e}")


if __name__ == "__main__":
    main()
