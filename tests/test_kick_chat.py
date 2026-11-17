"""Tests for real KickChatSource and webhook integration (Phase 2 Part B)."""
import asyncio
import json
import shutil
import tempfile
import time
from typing import List
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from spike_core.models import ChatEvent
from live_clipper.kick_chat import KickChatSource
from live_clipper.probe_webhook import verify_kick_signature
from live_clipper.models import LiveConfig
from live_clipper.session import SessionManager
from live_clipper.routes import router


@pytest.fixture
def temp_live_dir():
    """Temporary isolated directory for live clipper sessions."""
    td = tempfile.mkdtemp(prefix="test_live_kick_")
    yield td
    shutil.rmtree(td, ignore_errors=True)


def test_kick_chat_source_payload_normalization():
    """Verify raw Kick webhook payload is normalized into ChatEvent correctly."""
    source = KickChatSource(channel="my_channel", bot_users=["bot_helper"])

    # 1. Normal human message
    payload = {
        "event": "chat.message.sent",
        "data": {
            "content": "POGGERS PLAY!",
            "sender": {"username": "viewer123", "is_bot": False},
            "emotes": [{"id": "emote1"}, {"id": "emote2"}],
            "broadcaster": {"username": "my_channel"},
        }
    }
    accepted = source.dispatch_raw_webhook(payload)
    assert accepted is True

    # 2. Mismatched channel is ignored
    other_payload = {
        "event": "chat.message.sent",
        "data": {
            "content": "wrong channel",
            "sender": {"username": "viewer123"},
            "broadcaster": {"username": "some_other_streamer"},
        }
    }
    assert source.dispatch_raw_webhook(other_payload) is False

    # 3. Bot user detection
    bot_payload = {
        "event": "chat.message.sent",
        "data": {
            "content": "!rules",
            "sender": {"username": "bot_helper"},
            "broadcaster": {"username": "my_channel"},
        }
    }
    assert source.dispatch_raw_webhook(bot_payload) is True

    # Drain queue
    ev1 = source._queue.get_nowait()
    assert ev1.user == "viewer123"
    assert ev1.text == "POGGERS PLAY!"
    assert ev1.emotes == 2
    assert ev1.is_bot is False

    ev2 = source._queue.get_nowait()
    assert ev2.user == "bot_helper"
    assert ev2.is_bot is True


def test_kick_chat_source_keepalive_timeout_and_gap():
    """Silent disconnect for > keepalive_timeout transitions state to reconnecting and marks gap."""
    async def _run():
        source = KickChatSource(channel="my_channel", keepalive_timeout_sec=0.2)
        await source.connect()
        assert source.state == "connected"

        # Start consuming events in background
        consumed: List[ChatEvent] = []

        async def _consume():
            async for ev in source.events():
                consumed.append(ev)

        consumer_task = asyncio.create_task(_consume())

        # Push one event
        source.dispatch_raw_webhook({
            "event": "chat.message.sent",
            "data": {"content": "msg1", "sender": {"username": "u1"}},
        })

        # Wait longer than keepalive timeout (0.2s)
        await asyncio.sleep(0.35)
        assert source.state == "reconnecting"

        # Resume chat -> recovers to connected and records gap
        source.dispatch_raw_webhook({
            "event": "chat.message.sent",
            "data": {"content": "msg2", "sender": {"username": "u2"}},
        })
        await asyncio.sleep(0.05)
        assert source.state == "connected"

        gaps = source.get_and_clear_gaps()
        assert len(gaps) == 1
        assert gaps[0][0] < gaps[0][1]

        await source.close()
        await consumer_task
        assert len(consumed) == 2

    asyncio.run(_run())


def test_webhook_receiver_route_integration(temp_live_dir, monkeypatch):
    """Test POST /api/liveclipper/webhooks/kick dispatching to active KickChatSource."""
    async def _run():
        manager = SessionManager(data_dir=temp_live_dir)
        monkeypatch.setattr("live_clipper.routes.session_manager", manager)

        chat_source = KickChatSource(channel="kick_streamer")
        config = LiveConfig(channel="kick_streamer", permission_ack=True)
        session = await manager.start_session(config=config, chat_source=chat_source)

        test_app = FastAPI()
        test_app.include_router(router)
        client = TestClient(test_app)

        # Send webhook
        payload = {
            "event": "chat.message.sent",
            "data": {
                "content": "Live webhook test!",
                "sender": {"username": "real_viewer"},
                "broadcaster": {"username": "kick_streamer"},
            }
        }
        r = client.post("/api/liveclipper/webhooks/kick", json=payload)
        assert r.status_code == 200
        assert r.json()["accepted"] is True

        # Check that event entered chat_source queue
        await asyncio.sleep(0.1)
        assert session.session_data.stats.events_total >= 1

        await manager.stop_session(session.session_id)

    asyncio.run(_run())
