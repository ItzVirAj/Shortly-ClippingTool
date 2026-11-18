import pytest
from live_clipper import skipper


@pytest.fixture(autouse=True)
def _clear_default_video_env(monkeypatch):
    """Isolate unit tests from local .env video metadata and storage overrides."""
    for key in ("DEFAULT_VIDEO_TITLE", "DEFAULT_VIDEO_HASHTAGS", "DEFAULT_VIDEO_TAGS", "OUTPUT_DIR", "PUBLISHING_DIR"):
        monkeypatch.setenv(key, "")


def test_metadata_configured_override(monkeypatch):
    """When DEFAULT_VIDEO_* env vars are set, they supply title, hashtags, and all tags without calling an LLM."""
    monkeypatch.setenv("DEFAULT_VIDEO_TITLE", "GTA 6 Has Something INSANE! 😱")
    monkeypatch.setenv("DEFAULT_VIDEO_HASHTAGS", "#GTA6 #GTA5 #GTAShorts #GamingShorts #KRYO")
    monkeypatch.setenv(
        "DEFAULT_VIDEO_TAGS",
        "GTA 6, GTA VI, GTA 5, GTA V, Grand Theft Auto 6, Grand Theft Auto 5, GTA 6 gameplay, "
        "GTA 5 gameplay, GTA 6 Hindi, GTA 5 Hindi, GTA 6 India, GTA 6 news, GTA 6 updates, "
        "GTA 6 walkthrough, GTA 6 review, GTA 6 map, GTA 6 secrets, GTA 6 easter eggs, "
        "GTA 6 cars, GTA 6 Lucia, GTA 6 Jason, Vice City, GTA 5 mods, GTA 5 funny moments, "
        "GTA gaming, GTA Shorts, KRYO Gaming",
    )
    meta = skipper.metadata({"live_source": "Streamer", "platform": "kick", "transcript": "anything"})
    assert meta["title"] == "GTA 6 Has Something INSANE! 😱"
    assert meta["description"] == "#GTA6 #GTA5 #GTAShorts #GamingShorts #KRYO"
    assert len(meta["tags"]) == 27
    assert "GTA 6" in meta["tags"] and "KRYO Gaming" in meta["tags"]


def test_metadata_no_key_uses_fallback_without_creating_client(monkeypatch):
    """When no key is configured, no Gemini client is created, and transcript fallback is used."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    client_created = []

    class DummyClient:
        def __init__(self, *args, **kwargs):
            client_created.append(kwargs)

    # Monkeypatch genai in main so if anything attempts to create genai.Client, we catch it
    import main
    monkeypatch.setattr(main.genai, "Client", DummyClient)

    item = {
        "live_source": "CaseOh",
        "platform": "twitch",
        "title": "Highlight from CaseOh",
        "transcript": "He really thought he was going to escape the giant monster in the basement! That was the funniest moment of the stream.",
    }

    meta = skipper.metadata(item)

    # 1. No Gemini client must be created
    assert len(client_created) == 0, f"genai.Client should not have been created, but was: {client_created}"

    # 2. Fallback title must be at most 70 characters and built from the transcript's first sentence
    assert len(meta["title"]) <= 70
    assert meta["title"].startswith("He really thought he was going to escape")
    # 3. Description must be a 1-sentence description
    assert meta["description"].startswith("He really thought he was going to escape the giant monster in the basement")
    assert meta["tags"] == ["CaseOh", "twitch", "shorts"]


def test_metadata_invalid_json_from_model_uses_fallback(monkeypatch, caplog):
    """When the model returns invalid JSON or fails validation, fallback is used and clip is not skipped."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-12345")
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    import main

    class DummyClient:
        def __init__(self, *args, **kwargs):
            pass

    monkeypatch.setattr(main.genai, "Client", DummyClient)

    def fake_run_stage(client, model, prompt, schema):
        # Simulate invalid json / malformed response from model
        raise ValueError("Invalid JSON response from model: ```bad_json```")

    monkeypatch.setattr(main, "_run_gemini_stage", fake_run_stage)

    item = {
        "live_source": "Jynxzi",
        "platform": "twitch",
        "title": "Highlight from Jynxzi",
        "transcript": "We just hit the greatest clutch in Rainbow Six history. I cannot believe my aim was that locked in.",
    }

    with caplog.at_level("ERROR"):
        meta = skipper.metadata(item)

    # Fallback used
    assert len(meta["title"]) <= 70
    assert "greatest clutch" in meta["title"]
    assert "greatest clutch" in meta["description"]
    # Exception must be logged with message and traceback
    assert "Invalid JSON response from model" in caplog.text


def test_metadata_normal_success(monkeypatch):
    """When the model returns valid metadata, it is parsed and returned."""
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-12345")
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    import main

    class DummyClient:
        def __init__(self, *args, **kwargs):
            pass

    monkeypatch.setattr(main.genai, "Client", DummyClient)

    expected_data = {
        "title": "Insane Ending to the Tournament Match!",
        "description": "Watch this unbelievable clutch play that won the entire match.",
        "tags": ["gaming", "tournament", "clutch"],
    }

    def fake_run_stage(client, model, prompt, schema):
        return expected_data, None

    monkeypatch.setattr(main, "_run_gemini_stage", fake_run_stage)

    item = {
        "live_source": "Shroud",
        "platform": "youtube",
        "transcript": "Some long transcript here...",
    }

    meta = skipper.metadata(item)
    assert meta["title"] == expected_data["title"]
    assert meta["description"] == expected_data["description"]
    assert meta["tags"] == expected_data["tags"]


def test_metadata_failure_in_publishing_worker_never_skips_clip(tmp_path, monkeypatch):
    """End-to-end publishing worker verification: metadata failure never skips the clip, it queues it."""
    import asyncio
    from publishing_store import Store
    from publishing_routes import install
    from fastapi import FastAPI
    import httpx

    monkeypatch.setenv("SHORTLY_PUBLISHING_TOKEN", "test-token")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    app = FastAPI()
    store = install(app, tmp_path, lambda: [])

    # Add an item in 'metadata' status
    item = store.add(
        {
            "clip_key": "live:sess1:item1",
            "digest": "digest1",
            "channel_id": "ch1",
            "live_source": "Streamer",
            "platform": "kick",
            "transcript": "Unbelievable trickshot executed on the stream. Everyone went wild in chat.",
            "title": "Highlight from Streamer",
        },
        initial_status="metadata",
    )

    # Let the worker process the item via tick
    async def run():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
            headers={"Authorization": "Bearer test-token"},
        ) as client:
            resp = await client.post("/api/publishing/tick")
            assert resp.status_code == 200
            for _ in range(50):
                curr = store.get(item["id"])
                if curr["status"] != "metadata":
                    break
                await asyncio.sleep(0.02)

    asyncio.run(run())

    final_item = store.get(item["id"])
    # The clip must NOT be skipped (status 'attention' with failed_stage='metadata')
    assert final_item["status"] == "queued", f"Expected 'queued' but got {final_item['status']}: error={final_item.get('error')}"
    assert len(final_item["title"]) <= 70
    assert "Unbelievable trickshot" in final_item["title"]
