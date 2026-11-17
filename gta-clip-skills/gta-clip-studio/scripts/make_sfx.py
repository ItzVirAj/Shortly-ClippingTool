#!/usr/bin/env python
"""Makes the Pro Shorts sound-effect kit (whoosh, whip, pop, stamp, impact) from scratch with numpy,
so the product ships no third-party audio. Output: assets/sfx/*.wav (48 kHz stereo, 16-bit)."""
import sys, wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import SFX  # noqa: E402

SR = 48000
rng = np.random.default_rng(7)


def t_axis(sec):
    return np.arange(int(SR * sec)) / SR


def env(n, attack, release_curve=4.0):
    a = max(1, int(n * attack))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a) ** 2
    e[a:] = np.exp(-release_curve * np.linspace(0, 1, n - a))
    return e


def bandpass_sweep(noise, f0, f1, q=2.5):
    """Simple state-variable band-pass whose centre moves from f0 to f1 (log sweep)."""
    n = len(noise)
    fc = f0 * (f1 / f0) ** np.linspace(0, 1, n)
    out = np.zeros(n)
    low = band = 0.0
    damp = 1.0 / q
    for i in range(n):
        f = 2 * np.sin(np.pi * min(fc[i], SR / 6) / SR)
        high = noise[i] - low - damp * band
        band += f * high
        low += f * band
        out[i] = band
    return out


def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.zeros_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def norm(x, peak=0.89):
    m = np.max(np.abs(x)) or 1
    return x / m * peak


def stereo(x, width=0.0, delay_ms=0.0):
    d = int(SR * delay_ms / 1000)
    r = np.concatenate([np.zeros(d), x])[:len(x)] if d else x
    return np.stack([x * (1 + width) / 2 + r * (1 - width) / 2, r * (1 + width) / 2 + x * (1 - width) / 2], 1)


def save(name, st):
    SFX.mkdir(parents=True, exist_ok=True)
    data = (np.clip(st, -1, 1) * 32767).astype("<i2")
    with wave.open(str(SFX / f"{name}.wav"), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    print("sfx:", SFX / f"{name}.wav")


def whoosh(sec=0.9, f0=300, f1=3200, name="whoosh"):
    n = int(SR * sec)
    x = bandpass_sweep(rng.standard_normal(n), f0, f1, q=1.8)
    shape = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.6       # swell up and away
    save(name, stereo(norm(x * shape, 0.8), width=0.6, delay_ms=6))


def whip():
    n = int(SR * 0.35)
    x = bandpass_sweep(rng.standard_normal(n), 5000, 600, q=2.2)
    e = env(n, 0.08, 6)
    save("whip", stereo(norm(x * e, 0.85), width=0.4, delay_ms=3))


def pop():
    t = t_axis(0.18)
    f = 520 * np.exp(-t * 18) + 140                            # quick pitch drop = round "pop"
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 28)
    click = rng.standard_normal(len(t)) * np.exp(-t * 900) * 0.25
    save("pop", stereo(norm(body + click, 0.85)))


def stamp():
    t = t_axis(0.45)
    thud = np.sin(2 * np.pi * np.cumsum(110 * np.exp(-t * 8) + 55) / SR) * np.exp(-t * 14)
    slap = lowpass(rng.standard_normal(len(t)), 2500) * np.exp(-t * 60) * 1.4
    knock = np.sin(2 * np.pi * 420 * t) * np.exp(-t * 45) * 0.3
    save("stamp", stereo(norm(np.tanh(1.6 * (thud + slap + knock)), 0.9)))


def impact():
    t = t_axis(1.1)
    sub = np.sin(2 * np.pi * np.cumsum(70 * np.exp(-t * 3) + 38) / SR) * np.exp(-t * 4.5)
    crack = lowpass(rng.standard_normal(len(t)), 4000) * np.exp(-t * 30)
    tail = lowpass(rng.standard_normal(len(t)), 900) * np.exp(-t * 5) * 0.35
    save("impact", stereo(norm(np.tanh(1.3 * (sub + crack + tail)), 0.9), width=0.3, delay_ms=4))


def riser():
    n = int(SR * 1.6)
    x = bandpass_sweep(rng.standard_normal(n), 200, 6000, q=3)
    t = np.linspace(0, 1, n)
    tone = np.sin(2 * np.pi * np.cumsum(180 * 2 ** (t * 2)) / SR) * 0.3
    save("riser", stereo(norm((x + tone) * t ** 2.2, 0.8), width=0.7, delay_ms=8))


if __name__ == "__main__":
    for fn in (whoosh, whip, pop, stamp, impact, riser):
        fn()
