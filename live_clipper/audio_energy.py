"""Audio loudness and RMS energy analyzer for scream and hype detection.

Extracts audio from live buffer video segments (or full VODs) via FFmpeg,
computes 1-second RMS volume profiles, detects sudden shouting, laughter,
or explosion volume spikes (e.g. +6 dB above ambient baseline), and emits
candidate highlight moments.
"""
import asyncio
from dataclasses import dataclass, asdict
import logging
import os
from pathlib import Path
import shutil
import subprocess
from typing import Dict, List, Optional, Set, Tuple

import numpy as np

logger = logging.getLogger("live_clipper.audio_energy")


@dataclass
class AudioPeak:
    """A detected audio loudness surge (screaming, laughing, explosion)."""
    t: float
    db_above_floor: float
    db_level: float
    floor_db: float
    label: str = "scream_or_hype"


def decode_audio_segment(
    file_path: Path,
    ffmpeg_bin: Optional[str] = None,
    sr: int = 16000,
    timeout_sec: float = 15.0,
) -> Optional[np.ndarray]:
    """Decode a video or audio file into mono 16kHz float32 audio samples using FFmpeg."""
    ff = ffmpeg_bin or shutil.which("ffmpeg") or "ffmpeg"
    cmd = [
        ff,
        "-v", "error",
        "-i", str(file_path),
        "-f", "s16le",
        "-ac", "1",
        "-ar", str(sr),
        "pipe:1",
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_sec,
        )
        if proc.returncode != 0 or not proc.stdout:
            return None
        raw = np.frombuffer(proc.stdout, dtype=np.int16)
        return raw.astype(np.float32) / 32768.0
    except subprocess.TimeoutExpired:
        logger.warning(f"FFmpeg audio extraction timed out for {file_path}")
        return None
    except Exception as e:
        logger.warning(f"FFmpeg audio extraction failed for {file_path}: {e}")
        return None


def compute_rms_series(
    audio: np.ndarray,
    sr: int = 16000,
) -> Tuple[np.ndarray, np.ndarray, float]:
    """Compute 1-second raw RMS dB, 3-second smoothed dB, and median floor."""
    n = int(len(audio) // sr)
    if n < 2:
        return np.array([]), np.array([]), -90.0

    # 1-second RMS volume
    chunks = audio[: n * sr].reshape(n, sr)
    rms = np.sqrt(np.mean(chunks ** 2, axis=1) + 1e-9)
    db = 20.0 * np.log10(rms)

    # 3-second moving average convolution with edge padding (avoids 0 dB zero-pad distortion)
    padded = np.pad(db, (1, 1), mode="edge")
    smooth = np.convolve(padded, np.ones(3) / 3.0, mode="valid")
    floor = float(np.median(smooth))

    return db, smooth, floor


def detect_audio_peaks_from_samples(
    audio: np.ndarray,
    sr: int = 16000,
    threshold_db: float = 6.0,
    gap_sec: float = 35.0,
    time_offset: float = 0.0,
    top_n: int = 20,
) -> List[AudioPeak]:
    """Detect loudest seconds (+threshold_db above median ambient floor)."""
    db, smooth, floor = compute_rms_series(audio, sr=sr)
    if len(smooth) < 3:
        return []

    picked: List[AudioPeak] = []
    # Sort indices by loudness descending
    sort_indices = np.argsort(-smooth)

    for i in sort_indices:
        level = float(smooth[i])
        diff = level - floor
        if diff < threshold_db:
            break

        cand_t = round(time_offset + float(i), 2)
        if all(abs(cand_t - p.t) > gap_sec for p in picked):
            picked.append(
                AudioPeak(
                    t=cand_t,
                    db_above_floor=round(diff, 1),
                    db_level=round(level, 1),
                    floor_db=round(floor, 1),
                )
            )
        if len(picked) >= top_n:
            break

    return sorted(picked, key=lambda p: p.t)


class LiveAudioEnergyAnalyzer:
    """Continuously monitors video buffer segments and tracks audio energy & scream peaks."""

    def __init__(
        self,
        buffer_dir: Path,
        threshold_db: float = 6.0,
        gap_sec: float = 35.0,
        ffmpeg_bin: Optional[str] = None,
    ) -> None:
        self.buffer_dir = Path(buffer_dir)
        self.threshold_db = float(threshold_db)
        self.gap_sec = float(gap_sec)
        self.ffmpeg_bin = ffmpeg_bin

        self.processed_segments: Set[str] = set()
        self.energy_points: List[Dict] = []  # [{"t": float, "db": float, "smooth": float, "peak": bool}]
        self.peaks: List[AudioPeak] = []
        self._history_samples: List[np.ndarray] = []
        self._current_floor: float = -45.0

    def process_new_segments(self, segments: List[Dict]) -> List[AudioPeak]:
        """Process any unanalyzed segments and return newly detected peaks."""
        new_peaks: List[AudioPeak] = []

        for seg in segments:
            filename = seg.get("filename", "")
            if not filename or filename in self.processed_segments:
                continue

            seg_path = self.buffer_dir / filename
            if not seg_path.exists():
                continue

            start_t = float(seg.get("start_sec", 0.0))
            audio = decode_audio_segment(seg_path, ffmpeg_bin=self.ffmpeg_bin)
            self.processed_segments.add(filename)

            if audio is None or len(audio) < 16000:
                continue

            # Detect peaks in this segment
            seg_peaks = detect_audio_peaks_from_samples(
                audio=audio,
                threshold_db=self.threshold_db,
                gap_sec=self.gap_sec,
                time_offset=start_t,
            )

            # Record 1s energy points for frontend graph
            db, smooth, floor = compute_rms_series(audio)
            self._current_floor = floor
            for i in range(len(smooth)):
                t_sec = round(start_t + float(i), 1)
                is_pk = any(abs(t_sec - p.t) < 1.0 for p in seg_peaks)
                self.energy_points.append({
                    "t": t_sec,
                    "db": round(float(db[i]), 1),
                    "smooth": round(float(smooth[i]), 1),
                    "is_peak": is_pk,
                })

            # Append unique peaks respecting gap
            for sp in seg_peaks:
                if all(abs(sp.t - existing.t) > self.gap_sec for existing in self.peaks):
                    self.peaks.append(sp)
                    new_peaks.append(sp)

        # Keep energy points bounded (e.g. last 1000 points = ~16 minutes)
        if len(self.energy_points) > 1200:
            self.energy_points = self.energy_points[-1000:]

        return new_peaks

    def get_series(self, since: Optional[float] = None) -> List[Dict]:
        """Return rolling audio energy points for the UI graph."""
        if since is None:
            return self.energy_points[-300:] if self.energy_points else []
        return [p for p in self.energy_points if p["t"] >= since]

    def get_peaks_dicts(self) -> List[Dict]:
        return [asdict(p) for p in self.peaks]
