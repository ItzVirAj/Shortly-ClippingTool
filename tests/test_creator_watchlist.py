import asyncio
from types import SimpleNamespace

import numpy as np

from live_clipper.audio_energy import LiveAudioEnergyAnalyzer
from live_clipper.cutter import speech_bounds
from live_clipper.watchlist import CreatorWatchlist


def test_watch_survives_restart_and_records_only_once(tmp_path, monkeypatch):
    active = []
    async def start(config, require_recorder=False):
        assert require_recorder
        active.append(SimpleNamespace(config=config, session_data=SimpleNamespace(state="recording"), id="live"))
        return active[0]

    manager = SimpleNamespace(data_dir=tmp_path, get_active_session=lambda: next(iter(active), None), start_session=start)
    CreatorWatchlist(manager).add("Speed", {"youtube": "@IShowSpeed"}, True)
    watch = CreatorWatchlist(manager)
    row, = watch.entries()
    monkeypatch.setattr("live_clipper.watchlist.check_channel_live", lambda *a, **kw: True)
    async def check():
        await watch.check(row)
        await watch.check(row)
    asyncio.run(check())
    assert len(active) == 1
    assert watch.status[row["id"]]["session_id"] == "live"


def test_analyzer_reads_finalized_recorder_index(tmp_path, monkeypatch):
    for name in ["quiet.mp4", "reaction.mp4"]:
        (tmp_path / name).touch()
    def decode(path, **kwargs):
        return np.full(16000 * 15, 0.01 if path.name == "quiet.mp4" else 0.25, dtype=np.float32)
    monkeypatch.setattr("live_clipper.audio_energy.decode_audio_segment", decode)
    analyzer = LiveAudioEnergyAnalyzer(tmp_path)
    peaks = analyzer.process_new_segments([dict(file="quiet.mp4", session_start=10), dict(file="reaction.mp4", session_start=25)])
    assert len(peaks) == 1 and peaks[0].t >= 25


def test_trim_retains_reaction_and_preserves_silent_clips():
    assert speech_bounds({}, 45, 20, 15) == (0, 45)
    words = [dict(word="hey", start=t, end=t+1) for t in (8, 10, 12)]
    assert speech_bounds({"segments": [{"words": words}]}, 45, 25, 15) == (7.5, 28)
