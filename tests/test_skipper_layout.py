import asyncio
from types import SimpleNamespace
import httpx
from fastapi import FastAPI
from live_clipper import skipper
from publishing_routes import install
from publishing_store import Store
from publishing_youtube import YouTube


def test_build_vertical_filter_default_is_streamer_bottom():
    """Default layout stacks full screen top half and streamer cam bottom half."""
    flag, graph, map_args = skipper.build_vertical_filter(
        1920, 1080, layout=skipper.DEFAULT_LAYOUT, box=(1400, 700, 480, 320)
    )
    assert skipper.DEFAULT_LAYOUT == "streamer_bottom"
    assert flag == "-filter_complex"
    assert "vstack=inputs=2" in graph
    assert "drawbox=" in graph
    assert "[top]" in graph and "[bot]" in graph
    assert map_args == ["-map", "[v]", "-map", "0:a?"]


def test_build_vertical_filter_blurred_center():
    """Single centered blur layout puts full uncropped video in the middle over blurred backdrop."""
    flag, graph, map_args = skipper.build_vertical_filter(
        1920, 1080, layout="blurred_center"
    )
    assert flag == "-filter_complex"
    assert "boxblur" in graph or "gblur" in graph
    # Full-width height for 1920x1080 at 1080 wide is 608px (no side-cropping)
    assert "scale=-2:608" in graph
    assert "overlay=x=(W-w)/2:y=(H-h)/2" in graph
    assert map_args == ["-map", "[v]", "-map", "0:a?"]


def test_skipper_api_defaults_to_streamer_bottom_and_toggles_layout(tmp_path, monkeypatch):
    """GET/PUT /api/publishing/skipper defaults to streamer_bottom, toggles to blurred_center, and validates."""
    async def channel(self):
        return {"id": "ch-1", "title": "My Channel"}

    monkeypatch.setattr(YouTube, "channel", channel)
    monkeypatch.setenv("SHORTLY_PUBLISHING_TOKEN", "secret-token")

    app = FastAPI()
    store = install(app, tmp_path, lambda: [])

    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer secret-token"},
        ) as client:
            # 1. Default layout reported before enabling Auto
            status = (await client.get("/api/publishing/skipper")).json()
            assert status["settings"]["skipper_layout"] == "streamer_bottom"

            # 2. Invalid layout rejected with 422
            bad = await client.put("/api/publishing/skipper", json={"layout": "invalid_mode"})
            assert bad.status_code == 422

            # 3. Enabling Auto without explicit layout defaults to streamer_bottom
            enabled = await client.put("/api/publishing/skipper", json={"enabled": True})
            assert enabled.status_code == 200
            assert store.settings()["skipper"] is True
            assert store.settings()["skipper_layout"] == "streamer_bottom"

            # 4. Live layout toggle while Auto stays enabled
            switched = await client.put("/api/publishing/skipper", json={"layout": "blurred_center"})
            assert switched.status_code == 200
            assert store.settings()["skipper"] is True
            assert store.settings()["skipper_layout"] == "blurred_center"

            # 5. Toggle back to default split layout
            switched_back = await client.put("/api/publishing/skipper", json={"layout": "streamer_bottom"})
            assert switched_back.status_code == 200
            assert store.settings()["skipper_layout"] == "streamer_bottom"

    asyncio.run(run())


def test_skipper_capture_freezes_active_layout(tmp_path, monkeypatch):
    """Each captured item freezes the skipper_layout active at capture time."""
    monkeypatch.delenv("OUTPUT_DIR", raising=False)
    monkeypatch.delenv("PUBLISHING_DIR", raising=False)
    monkeypatch.chdir(tmp_path)
    store = Store(tmp_path / "output/.publishing")
    store.configure({
        "skipper": True,
        "skipper_channel": "ch-1",
        "skipper_name": "My Channel",
    })

    clip1 = SimpleNamespace(
        session_id="s1", id="c1", clip_path="a.mp4", start_t=0.0, end_t=20.0, score=0.9, duration=20.0
    )
    assert skipper.capture(clip1, "StreamerA", "kick") is True

    store.configure({"skipper_layout": "blurred_center"})
    clip2 = SimpleNamespace(
        session_id="s1", id="c2", clip_path="b.mp4", start_t=40.0, end_t=60.0, score=0.8, duration=20.0
    )
    assert skipper.capture(clip2, "StreamerA", "kick") is True

    by_digest = {i["digest"]: i for i in store.list()}
    assert by_digest["c1"]["layout"] == "streamer_bottom"
    assert by_digest["c2"]["layout"] == "blurred_center"
