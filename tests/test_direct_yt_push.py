"""Tests for direct Studio/History YouTube Push pipeline (bypasses Live Clipper/Skipper)."""
import time
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient

import publishing_routes
import publishing_youtube


def test_direct_push_uploads_immediately_with_custom_emoji_metadata(monkeypatch, tmp_path):
    # Create two fake Studio clip files on disk
    job_dir = tmp_path / "job123"
    job_dir.mkdir(parents=True)
    clip1 = job_dir / "clip_1.mp4"
    clip2 = job_dir / "clip_2.mp4"
    clip1.write_bytes(b"fake-mp4-video-bytes-1")
    clip2.write_bytes(b"fake-mp4-video-bytes-2")

    fake_clips = [
        {"id": "job123:0", "name": "Clip 1", "_path": str(clip1), "url": "/videos/job123/clip_1.mp4"},
        {"id": "job123:1", "name": "Clip 2", "_path": str(clip2), "url": "/videos/job123/clip_2.mp4"},
    ]

    uploaded_items = []

    async def fake_channel(self):
        return {"id": "UC_TEST_123", "title": "KRYO Gaming"}

    async def fake_upload(self, item, persist):
        uploaded_items.append(dict(item))
        persist({"video_id": f"yt_{len(uploaded_items)}", "status": "processing", "error": None})
        return f"yt_{len(uploaded_items)}"

    async def fake_status(self, video_id):
        return {"status": "published", "video_id": video_id, "error": None}

    monkeypatch.setattr(publishing_youtube.YouTube, "channel", fake_channel)
    monkeypatch.setattr(publishing_youtube.YouTube, "upload", fake_upload)
    monkeypatch.setattr(publishing_youtube.YouTube, "status", fake_status)

    app = FastAPI()
    store = publishing_routes.install(app, str(tmp_path), lambda: fake_clips)
    with TestClient(app) as client:
        # Batch direct push with custom titles, emojis, descriptions, and tags
        res = client.post(
            "/api/publishing/push",
            json={
                "auto_start": True,
                "items": [
                    {
                        "clip_id": "job123:0",
                        "title": "INSANE GTA 6 Clutch! 😱🔥",
                        "description": "Unbelievable moment 💀 #GTA6 #Shorts",
                        "tags": ["GTA 6", "Shorts"],
                        "privacy": "public",
                        "made_for_kids": False,
                    },
                    {
                        "clip_id": "job123:1",
                        "title": "No Way This Happened 🤯🚨",
                        "description": "Watch till the end! #GTA5 #GamingShorts",
                        "tags": ["GTA 5"],
                        "privacy": "unlisted",
                        "made_for_kids": False,
                    },
                ],
            },
        )
        assert res.status_code == 200
        body = res.json()
        assert body["ok"] is True
        assert body["count"] == 2
        assert len(body["items"]) == 2

        # Wait briefly for the background direct-upload task to finish both uploads
        deadline = time.time() + 3.0
        while len(uploaded_items) < 2 and time.time() < deadline:
            time.sleep(0.05)

    # Ensure both items were marked custom_metadata=True & direct_push=True and published directly
    stored = {it["id"]: it for it in store.list()}
    for pushed in body["items"]:
        rec = stored[pushed["id"]]
        assert rec["custom_metadata"] is True
        assert rec["direct_push"] is True
        assert rec["clip_key"].startswith("direct:")
        assert rec["status"] == "published", f"Unexpected status: {rec}"

    # Confirm custom titles/emojis were preserved verbatim when uploaded
    assert len(uploaded_items) == 2
    assert uploaded_items[0]["title"] == "INSANE GTA 6 Clutch! 😱🔥"
    assert uploaded_items[0]["description"] == "Unbelievable moment 💀 #GTA6 #Shorts"
    assert uploaded_items[1]["title"] == "No Way This Happened 🤯🚨"
    assert uploaded_items[1]["privacy"] == "unlisted"


def test_direct_push_resolves_explicit_job_id_and_filename(monkeypatch, tmp_path):
    job_dir = tmp_path / "job_sub"
    job_dir.mkdir(parents=True)
    sub_clip = job_dir / "subtitled_999_clip_1.mp4"
    sub_clip.write_bytes(b"subtitled-clip-data")

    async def fake_channel(self):
        return {"id": "UC_TEST_123", "title": "KRYO Gaming"}

    monkeypatch.setattr(publishing_youtube.YouTube, "channel", fake_channel)

    app = FastAPI()
    publishing_routes.install(app, str(tmp_path), lambda: [])
    client = TestClient(app)

    res = client.post(
        "/api/publishing/push",
        json={
            "auto_start": False,
            "items": [
                {
                    "job_id": "job_sub",
                    "filename": "subtitled_999_clip_1.mp4",
                    "title": "Subtitled Short ⚡",
                    "description": "#GTA6",
                    "privacy": "public",
                }
            ],
        },
    )
    assert res.status_code == 200
    assert res.json()["count"] == 1
    assert res.json()["items"][0]["status"] == "queued"
