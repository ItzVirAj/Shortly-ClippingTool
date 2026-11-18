import asyncio
import json
import uuid
import httpx
from fastapi import FastAPI
from live_clipper import cutter, routes
from live_clipper.models import LiveConfig
from live_clipper.queue import global_queue
from live_clipper.session import LiveClipperSession, session_manager


def test_manual_cut_validation_and_execution(tmp_path, monkeypatch):
    """POST /api/liveclipper/sessions/{id}/manual-cut validates window, waits for after_sec, and cuts clip."""
    monkeypatch.setenv("OUTPUT_DIR", "")
    monkeypatch.setenv("PUBLISHING_DIR", "")

    app = FastAPI()
    app.include_router(routes.router)

    sid = str(uuid.uuid4())
    session_dir = tmp_path / sid
    buffer_dir = session_dir / "buffer"
    buffer_dir.mkdir(parents=True, exist_ok=True)
    seg_path = buffer_dir / "seg_000.mp4"
    seg_path.write_bytes(b"fake-mp4")
    (buffer_dir / "index.json").write_text(
        json.dumps({"segments": [{"path": str(seg_path), "start_sec": 0.0, "end_sec": 200.0, "duration": 200.0}]}),
        encoding="utf-8",
    )

    cfg = LiveConfig(channel="tester", platform="kick", permission_ack=True, audio_peaks_enabled=False)
    active = LiveClipperSession(session_id=sid, config=cfg, session_dir=session_dir)
    active.session_data.state = "recording"
    active._session_clock_zero = 0.0

    # Anchor session clock at ~60s and advance naturally via monotonic
    clock_val = [60.0]
    monkeypatch.setattr(type(active), "session_clock", property(lambda self: clock_val[0]))
    monkeypatch.setattr(session_manager, "get_active_session", lambda: active)

    extracted = []

    def fake_extract(covering_segments, start_rec, end_rec, out_path, **kwargs):
        extracted.append((start_rec, end_rec, str(out_path)))
        out_path.write_bytes(b"cut-clip-bytes")
        return True

    monkeypatch.setattr(cutter, "extract_clip", fake_extract)

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # 1. Reject < 2s total
            bad_short = await client.post(
                f"/api/liveclipper/sessions/{sid}/manual-cut",
                json={"before_sec": 1, "after_sec": 0},
            )
            assert bad_short.status_code == 400

            # 2. Reject > 600s total
            bad_long = await client.post(
                f"/api/liveclipper/sessions/{sid}/manual-cut",
                json={"before_sec": 400, "after_sec": 300},
            )
            assert bad_long.status_code == 400

            # 3. Schedule manual cut: 30s before, 10s after (from anchor t=60 -> [30, 70])
            resp = await client.post(
                f"/api/liveclipper/sessions/{sid}/manual-cut",
                json={"before_sec": 30, "after_sec": 10, "send_to_skipper": False},
            )
            assert resp.status_code == 200
            cut = resp.json()["cut"]
            assert cut["status"] == "waiting"
            assert cut["start_t"] == 30.0
            assert cut["end_t"] == 70.0

            # Advance session clock past 70s so the background task completes
            clock_val[0] = 75.0
            for _ in range(40):
                cuts = active.get_manual_cuts()
                if cuts and cuts[0]["status"] == "done":
                    break
                await asyncio.sleep(0.05)

            cuts = active.get_manual_cuts()
            assert cuts[0]["status"] == "done", f"Unexpected manual cut state: {cuts[0]}"
            assert cuts[0]["duration"] == 40.0
            assert extracted and extracted[0][0] == 30.0 and extracted[0][1] == 70.0

            # Verify QueueItem added with 'manual' tag
            q_item = global_queue.get_item(cuts[0]["clip_id"])
            assert q_item is not None
            assert "manual" in q_item.tags
            assert q_item.duration == 40.0

    asyncio.run(run())


def test_prune_buffer_before_cutoff_and_after_manual_cut(tmp_path, monkeypatch):
    """Pruning deletes only segments older than the cutoff point and keeps newer footage intact."""
    monkeypatch.setenv("OUTPUT_DIR", "")
    monkeypatch.setenv("PUBLISHING_DIR", "")

    app = FastAPI()
    app.include_router(routes.router)

    sid = str(uuid.uuid4())
    session_dir = tmp_path / sid
    buffer_dir = session_dir / "buffer"
    buffer_dir.mkdir(parents=True, exist_ok=True)

    segments = []
    for i in range(6):
        p = buffer_dir / f"seg_{i:03d}.mp4"
        p.write_bytes(b"x" * 1024 * 64)
        segments.append({"file": p.name, "session_start": float(i * 10), "duration": 10.0})
    (buffer_dir / "index.json").write_text(json.dumps({"segments": segments}), encoding="utf-8")

    cfg = LiveConfig(channel="tester", platform="kick", permission_ack=True, audio_peaks_enabled=False)
    active = LiveClipperSession(session_id=sid, config=cfg, session_dir=session_dir)
    active.session_data.state = "recording"
    monkeypatch.setattr(type(active), "session_clock", property(lambda self: 60.0))
    monkeypatch.setattr(session_manager, "get_active_session", lambda: active)

    def fake_extract(covering_segments, start_rec, end_rec, out_path, **kwargs):
        out_path.write_bytes(b"clip-data")
        return True

    monkeypatch.setattr(cutter, "extract_clip", fake_extract)

    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            # 1. Standalone prune: keep last 40s (cutoff = 60 - 40 = 20s -> deletes seg_000 [0..10] and seg_001 [10..20])
            r1 = await client.post(
                f"/api/liveclipper/sessions/{sid}/buffer/prune",
                json={"keep_last_sec": 40},
            )
            assert r1.status_code == 200
            body1 = r1.json()
            assert body1["deleted_segments"] == 2
            assert body1["remaining_segments"] == 4
            assert not (buffer_dir / "seg_000.mp4").exists()
            assert not (buffer_dir / "seg_001.mp4").exists()
            assert (buffer_dir / "seg_002.mp4").exists()

            # 2. Manual cut of last 20s [40..60] with prune_buffer_before=True -> deletes seg_002 [20..30] and seg_003 [30..40]
            r2 = await client.post(
                f"/api/liveclipper/sessions/{sid}/manual-cut",
                json={"before_sec": 20, "after_sec": 0, "send_to_skipper": False, "prune_buffer_before": True},
            )
            assert r2.status_code == 200
            for _ in range(40):
                cuts = active.get_manual_cuts()
                if cuts and cuts[0]["status"] == "done":
                    break
                await asyncio.sleep(0.05)

            cuts = active.get_manual_cuts()
            assert cuts[0]["status"] == "done"
            assert cuts[0]["pruned_segments"] == 2
            assert not (buffer_dir / "seg_002.mp4").exists()
            assert not (buffer_dir / "seg_003.mp4").exists()
            assert (buffer_dir / "seg_004.mp4").exists()
            assert (buffer_dir / "seg_005.mp4").exists()

    asyncio.run(run())
