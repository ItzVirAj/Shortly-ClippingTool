"""Unit tests for audio RMS energy calculation and scream / hype peak detection."""
import numpy as np
import pytest

from live_clipper.audio_energy import (
    compute_rms_series,
    detect_audio_peaks_from_samples,
)


def test_compute_rms_series():
    sr = 16000
    # 5 seconds of quiet background (amplitude 0.01)
    # followed by 2 seconds of loud scream (amplitude 0.8)
    # followed by 3 seconds of quiet background (amplitude 0.01)
    quiet_part1 = np.ones(5 * sr, dtype=np.float32) * 0.01
    scream_part = np.ones(2 * sr, dtype=np.float32) * 0.8
    quiet_part2 = np.ones(3 * sr, dtype=np.float32) * 0.01

    samples = np.concatenate([quiet_part1, scream_part, quiet_part2])
    db, smooth, floor = compute_rms_series(samples, sr=sr)

    assert len(db) == 10
    assert len(smooth) == 10

    # The floor should be around the quiet level
    # 20 * log10(0.01) = -40 dB
    assert -45.0 <= floor <= -35.0

    # The scream should be much louder: 20 * log10(0.8) = -1.9 dB
    # Difference should easily exceed +20 dB
    assert np.max(smooth) - floor > 20.0


def test_detect_audio_peaks_from_samples():
    sr = 16000
    # 10s audio with a sudden peak at second 5
    quiet = np.ones(10 * sr, dtype=np.float32) * 0.02
    quiet[5 * sr : 6 * sr] = 0.5  # loud reaction at second 5

    peaks = detect_audio_peaks_from_samples(quiet, sr=sr, threshold_db=6.0)
    assert len(peaks) >= 1
    assert any(abs(p.t - 5.0) <= 1.0 for p in peaks)
    top_peak = max(peaks, key=lambda p: p.db_above_floor)
    assert top_peak.db_above_floor >= 6.0
