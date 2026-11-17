# spike_core

Pure, self-contained chat spike detection core for Shortly Live Clipper.

`spike_core` contains zero network or file I/O in its core algorithms and zero imports from other project modules or third-party packages. It operates strictly using Python 3.10+ standard library.

## Architecture

- `models.py`: Data contracts (`ChatEvent`, `DetectorConfig`, `Spike`).
- `windows.py`: Clip window calculation and boundary enforcement (`compute_clip_window`).
- `detector.py`: Pure batch algorithm functions (binning, causal smoothing, rolling baseline, candidate grouping, quality scoring).
- `live.py`: `LiveSpikeDetector` streaming wrapper with out-of-order event tolerance, confirmation delays, cooldown, and hourly caps.
- `simulate.py`: CLI replay simulator for recorded and synthetic streams.
- `debug.py`: CLI debug tool for batch analysis and CSV time-series export.

## Configuration Fields & Ranges (`DetectorConfig`)

| Field | Type | Default | Description |
|---|---|---|---|
| `bin_sec` | `float` | `5.0` | Bin size in seconds (`1.0` to `30.0`) |
| `smooth_bins` | `int` | `2` | Trailing moving average width in bins (`1` to `10`) |
| `baseline_sec` | `float` | `300.0` | Rolling baseline window in seconds (`60.0` to `1800.0`) |
| `baseline_stat` | `str` | `"median"` | Statistic for baseline calculation (`"median"` or `"mean"`) |
| `min_baseline` | `float` | `1.0` | Minimum baseline floor to prevent divide-by-zero |
| `ratio_threshold`| `float` | `3.0` | Multiplier over baseline to qualify as a spike |
| `min_count` | `int` | `15` | Minimum raw messages required at peak bin |
| `onset_ratio` | `float` | `1.5` | Ratio threshold when walking backward to find spike start |
| `end_ratio` | `float` | `1.5` | Ratio threshold when walking forward to detect return to normal |
| `before_sec` | `float` | `25.0` | Lead-in time added before spike onset for clip start |
| `after_sec` | `float` | `10.0` | Lead-out time added after spike end for clip finish |
| `min_len` | `float` | `20.0` | Minimum clip duration in seconds |
| `max_len` | `float` | `60.0` | Maximum clip duration in seconds |
| `min_gap_sec` | `float` | `60.0` | Minimum separation between distinct spikes (closer are merged) |
| `max_spikes` | `int` | `20` | Maximum top spikes to return |
| `spam_text_share`| `float` | `0.6` | Threshold ratio for repetitive text to tag `spam_heavy` |

## Usage Examples

### 1. Batch Detection

```python
from spike_core import ChatEvent, DetectorConfig, detect_spikes

events = [
    ChatEvent(t=10.0, user="u1", text="hello"),
    ChatEvent(t=12.5, user="u2", text="LUL", emotes=1),
    # ...
]

config = DetectorConfig(ratio_threshold=3.0, min_count=15)
spikes, series = detect_spikes(events, config=config, duration=3600.0)

for sp in spikes:
    print(f"Spike at {sp.peak}s: score={sp.score}, clip [{sp.suggested_start}s - {sp.suggested_end}s]")
```

### 2. Real-Time Streaming Detection

```python
from spike_core import ChatEvent, DetectorConfig, LiveSpikeDetector

detector = LiveSpikeDetector(
    config=DetectorConfig(),
    confirm_delay_sec=8.0,
    cooldown_sec=90.0,
    max_per_hour=12,
)

# On chat message:
detector.push(ChatEvent(t=125.4, user="viewer9", text="W PLAY", emotes=1))

# On clock advance (e.g. periodically even when quiet):
detector.advance(now=126.0)

# Check for newly confirmed spikes:
confirmed_spikes = detector.poll()
for sp in confirmed_spikes:
    print(f"Confirmed viral moment at {sp.peak}s: cut [{sp.suggested_start}s - {sp.suggested_end}s]")
```

## CLI Commands

### Simulator
```bash
# Synthetic benchmark
python -m spike_core.simulate --synthetic --duration 3600 --base-rate 0.5 --burst 600:20:12

# Replay existing events
python -m spike_core.simulate --events session_events.jsonl --speed 20
```

### Debug & Inspect
```bash
python -m spike_core.debug session_events.jsonl --csv series.csv
```
