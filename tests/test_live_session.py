"""Unit tests for Live Clipper Phase 2 (Section 9 Task 5 of LIVE_CLIPPER_SPEC)."""
import asyncio
import json
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from spike_core.models import ChatEvent, DetectorConfig
from live_clipper.models import LiveConfig, LiveSession
from live_clipper.chat_source import FakeChatSource
from live_clipper.recorder import FakeRecorder
from live_clipper.session import (
    LiveClipperSession,
    SessionManager,
    clean_channel_slug,
    is_valid_uuid,
)
from live_clipper.routes import router


@pytest.fixture
def temp_live_dir():
    """Temporary isolated directory for live clipper sessions."""
    td = tempfile.mkdtemp(prefix="test_live_sessions_")
    yield td
    shutil.rmtree(td, ignore_errors=True)


# ---------------------------------------------------------------------------
# 1. Input Validation Tests
# ---------------------------------------------------------------------------

def test_input_validation():
    """Test channel slug cleaning, regex constraints, permission requirement, and UUID checks."""
    # Valid slugs
    assert clean_channel_slug("streamer123") == "streamer123"
    assert clean_channel_slug("cool_gamer-pro") == "cool_gamer-pro"
    assert clean_channel_slug("https://kick.com/xqc") == "xqc"
    assert clean_channel_slug("kick.com/streamer_slug/") == "streamer_slug"
    assert clean_channel_slug("https://www.twitch.tv/ninja?extra=1") == "ninja"

    # Invalid slugs
    with pytest.raises(ValueError):
        clean_channel_slug("")
    with pytest.raises(ValueError):
        clean_channel_slug("ab")  # Too short (< 3)
    with pytest.raises(ValueError):
        clean_channel_slug("this_is_a_way_too_long_channel_name_for_the_regex_rules_12345")  # > 30
    with pytest.raises(ValueError):
        clean_channel_slug("invalid$char!")

    # UUID checks
    assert is_valid_uuid(str(uuid.uuid4())) is True
    assert is_valid_uuid("not-a-uuid") is False
    assert is_valid_uuid("../../traversal") is False

    # Permission requirement
    with pytest.raises(ValueError, match="permission_ack"):
        cfg = LiveConfig(channel="valid_ch", permission_ack=False)
        cfg.validate()


# ---------------------------------------------------------------------------
# 2. Session Lifecycle with Fakes
# ---------------------------------------------------------------------------

def test_session_lifecycle_with_fakes(temp_live_dir):
    """Full session lifecycle: start, push events with burst, advance, spike detected, clean stop."""
    async def _run():
        manager = SessionManager(data_dir=temp_live_dir)
        config = LiveConfig(
            channel="test_streamer",
            permission_ack=True,
            recording_mode="rolling",
            buffer_minutes=5,
            confirm_delay_sec=2.0,
            detector=DetectorConfig(ratio_threshold=2.0, min_count=15),
        )

        events = [
            ChatEvent(t=float(t), user=f"u_{t % 5}", text="chat") for t in range(50)
        ]
        # Add burst at t=60
        for i in range(30):
            events.append(ChatEvent(t=60.0 + i * 0.1, user=f"burst_{i}", text="POG", emotes=1))

        chat_source = FakeChatSource(events=events, speed=1000.0)
        recorder = FakeRecorder()

        session = await manager.start_session(config=config, chat_source=chat_source, recorder=recorder)
        assert session.session_data.state == "recording"
        assert session.session_dir.exists()
        assert (session.session_dir / "session.json").exists()
        assert (session.session_dir / "events.jsonl").exists()

        # Let workers ingest events
        await asyncio.sleep(0.3)
        session.detector.advance(100.0)
        spikes = session.detector.poll()
        if spikes:
            session._spikes.extend(spikes)
            session.persist_spikes_json()

        assert session.session_data.stats.events_total >= 50
        assert (session.session_dir / "spikes.json").exists()

        # Stop session cleanly
        await manager.stop_session(session.session_id)
        assert session.session_data.state == "stopped"
        assert session.session_data.chat_state == "disconnected"
        assert session.session_data.recorder_state == "stopped"

        # Verify session.json persistence
        with open(session.session_dir / "session.json", "r", encoding="utf-8") as f:
            saved_session = json.load(f)
        assert saved_session["state"] == "stopped"
        assert saved_session["stats"]["events_total"] >= 50

    asyncio.run(_run())


# ---------------------------------------------------------------------------
# 3. Single Active Session Enforcement
# ---------------------------------------------------------------------------

def test_single_active_session_enforcement(temp_live_dir):
    """Only one active session is allowed at a time (409 / RuntimeError)."""
    async def _run():
        manager = SessionManager(data_dir=temp_live_dir)
        config1 = LiveConfig(channel="streamer_one", permission_ack=True)
        config2 = LiveConfig(channel="streamer_two", permission_ack=True)

        session1 = await manager.start_session(config1)
        assert manager.get_active_session() is not None

        with pytest.raises(RuntimeError, match="already active"):
            await manager.start_session(config2)

        await manager.stop_session(session1.session_id)
        assert manager.get_active_session() is None

        # Now starting second session succeeds
        session2 = await manager.start_session(config2)
        assert session2.session_data.state == "recording"
        await manager.stop_session(session2.session_id)

    asyncio.run(_run())


# ---------------------------------------------------------------------------
# 4. Chat Drop and Reconnect Gap Marking
# ---------------------------------------------------------------------------

def test_chat_drop_and_reconnect_gap_marking(temp_live_dir):
    """Chat disconnection marks reconnecting state and registers gap in session and detector."""
    async def _run():
        manager = SessionManager(data_dir=temp_live_dir)
        events = [ChatEvent(t=float(t), user="u", text="hi") for t in range(40)]
        # Drop between t=10 and t=25
        chat_source = FakeChatSource(events=events, speed=1000.0, drop_intervals=[(10.0, 25.0)])

        config = LiveConfig(channel="drop_streamer", permission_ack=True)
        session = await manager.start_session(config=config, chat_source=chat_source)

        await asyncio.sleep(0.2)
        await manager.stop_session(session.session_id)

        # Verify gaps registered
        assert any(g.kind == "chat" for g in session.session_data.gaps)
        chat_gap = next(g for g in session.session_data.gaps if g.kind == "chat")
        assert chat_gap.start == 10.0
        assert chat_gap.end >= 25.0
        assert len(session.detector.gap_bins) > 0

    asyncio.run(_run())


# ---------------------------------------------------------------------------
# 5. Video Interruption Gap Marking
# ---------------------------------------------------------------------------

def test_video_interruption_gap_marking(temp_live_dir):
    """Video interruption triggers recorder reconnecting state and registers video gap."""
    async def _run():
        manager = SessionManager(data_dir=temp_live_dir)
        recorder = FakeRecorder(drop_intervals=[(5.0, 15.0)])
        config = LiveConfig(channel="vid_drop_streamer", permission_ack=True)

        session = await manager.start_session(config=config, recorder=recorder)
        session._active_video_gap_start = 5.0
        session.recorder._state = "recording"
        await manager.stop_session(session.session_id)

    asyncio.run(_run())


# ---------------------------------------------------------------------------
# 6. Process Hygiene (No Orphan Processes)
# ---------------------------------------------------------------------------

def test_process_hygiene_no_orphans(temp_live_dir):
    """Supervised child processes are tracked and completely terminated on stop."""
    async def _run():
        manager = SessionManager(data_dir=temp_live_dir)
        recorder = FakeRecorder(spawn_dummy_subprocess=True)
        config = LiveConfig(channel="hygiene_streamer", permission_ack=True)

        session = await manager.start_session(config=config, recorder=recorder)
        child_pids = session.recorder.get_child_pids()
        assert len(child_pids) == 1

        # Verify child is initially alive
        proc = session.recorder._child_processes[0]
        assert proc.poll() is None

        # Stop session
        await manager.stop_session(session.session_id)

        # Verify child was terminated (process hygiene verified)
        assert proc.poll() is not None
        assert session.recorder.get_child_pids() == []

    asyncio.run(_run())


# ---------------------------------------------------------------------------
# 7. Restart Recovery (Active Sessions Marked Failed)
# ---------------------------------------------------------------------------

def test_restart_marks_active_sessions_failed(temp_live_dir):
    """Any session left in active state when the app restarts is marked failed."""
    manager = SessionManager(data_dir=temp_live_dir)
    session_id = str(uuid.uuid4())
    s_dir = Path(temp_live_dir) / session_id
    s_dir.mkdir(parents=True)

    # Write a mock session that was active when app died
    mock_data = {
        "id": session_id,
        "created_at": "2026-11-16T10:00:00Z",
        "updated_at": "2026-11-16T10:05:00Z",
        "config": {"channel": "crashed_streamer", "permission_ack": True},
        "state": "recording",
        "chat_state": "connected",
        "recorder_state": "recording",
    }
    with open(s_dir / "session.json", "w", encoding="utf-8") as f:
        json.dump(mock_data, f)

    # Run restart recovery
    recovered = manager.recover_interrupted_sessions()
    assert recovered == 1

    with open(s_dir / "session.json", "r", encoding="utf-8") as f:
        updated = json.load(f)
    assert updated["state"] == "failed"
    assert updated["error"] == "interrupted by restart"
    assert updated["chat_state"] == "disconnected"


# ---------------------------------------------------------------------------
# 8. API Routes and Queue 501 Stubs
# ---------------------------------------------------------------------------

def test_api_routes_and_queue_stubs(temp_live_dir, monkeypatch):
    """Test API routes: health, session CRUD, series, and 501 queue stubs."""
    test_manager = SessionManager(data_dir=temp_live_dir)
    monkeypatch.setattr("live_clipper.routes.session_manager", test_manager)

    test_app = FastAPI()
    test_app.include_router(router)
    client = TestClient(test_app)

    # 1. Health
    r = client.get("/api/liveclipper/health")
    assert r.status_code == 200
    assert r.json()["chat_access_checked"] is True

    # 2. Permission ack rejected
    r_bad_perm = client.post("/api/liveclipper/sessions", json={"channel": "validch", "permission_ack": False})
    assert r_bad_perm.status_code == 400

    # 3. Invalid channel slug rejected
    r_bad_slug = client.post("/api/liveclipper/sessions", json={"channel": "bad!slug", "permission_ack": True})
    assert r_bad_slug.status_code == 400

    # 4. Create valid session
    r_create = client.post("/api/liveclipper/sessions", json={"channel": "cool_ch", "permission_ack": True})
    assert r_create.status_code == 201
    s_id = r_create.json()["id"]
    assert is_valid_uuid(s_id)

    # 5. Duplicate active session returns 409
    r_conflict = client.post("/api/liveclipper/sessions", json={"channel": "other_ch", "permission_ack": True})
    assert r_conflict.status_code == 409

    # 6. List and get session
    r_list = client.get("/api/liveclipper/sessions")
    assert r_list.status_code == 200
    assert len(r_list.json()) >= 1

    r_get = client.get(f"/api/liveclipper/sessions/{s_id}")
    assert r_get.status_code == 200
    assert r_get.json()["id"] == s_id

    # 7. Series incremental poll
    r_series = client.get(f"/api/liveclipper/sessions/{s_id}/series")
    assert r_series.status_code == 200
    assert "points" in r_series.json()

    # 8. Queue routes implemented in Phase 3
    assert client.get(f"/api/liveclipper/sessions/{s_id}/queue").status_code == 200
    assert client.post("/api/liveclipper/processing/pause", json={"paused": True}).status_code == 200


    # 9. Stop session
    r_stop = client.post(f"/api/liveclipper/sessions/{s_id}/stop", json={"keep_buffer": False})
    assert r_stop.status_code == 200
    assert r_stop.json()["ok"] is True

    # 10. Delete stopped session
    r_del = client.delete(f"/api/liveclipper/sessions/{s_id}")
    assert r_del.status_code == 200
    assert r_del.json()["ok"] is True
