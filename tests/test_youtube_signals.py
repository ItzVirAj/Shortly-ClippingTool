"""Unit tests for YouTube retention heatmap peak extraction."""
import pytest

from live_clipper.youtube_signals import (
    extract_heatmap_peaks,
    normalize_youtube_url,
)


def test_extract_heatmap_peaks():
    # Synthetic heatmap with a clear peak at 60s
    heatmap = [
        {"start_time": 0.0, "end_time": 10.0, "value": 0.2},
        {"start_time": 10.0, "end_time": 20.0, "value": 0.3},
        {"start_time": 20.0, "end_time": 30.0, "value": 0.35},
        {"start_time": 30.0, "end_time": 40.0, "value": 0.4},
        {"start_time": 40.0, "end_time": 50.0, "value": 0.65},
        {"start_time": 50.0, "end_time": 60.0, "value": 0.95},  # Peak!
        {"start_time": 60.0, "end_time": 70.0, "value": 0.50},
        {"start_time": 70.0, "end_time": 80.0, "value": 0.25},
    ]

    peaks = extract_heatmap_peaks(heatmap, duration=80.0, min_value=0.5, gap_sec=30.0)
    assert len(peaks) == 1
    p = peaks[0]
    assert p["peak"] == 55.0  # Midpoint of 50-60
    assert p["value"] == 0.95
    assert p["score"] == 95.0
    assert p["source"] == "most_replayed"


def test_extract_heatmap_peaks_empty():
    assert extract_heatmap_peaks([]) == []
