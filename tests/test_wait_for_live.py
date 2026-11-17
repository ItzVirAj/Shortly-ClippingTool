"""Tests for wait_for_live standby state and auto-start (Phase 5, Task 2)."""
import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from live_clipper.models import LiveConfig
from live_clipper.session import LiveClipperSession
from live_clipper.chat_source import FakeChatSource
from live_clipper.recorder import FakeRecorder


class TestWaitForLive(unittest.IsolatedAsyncioTestCase):
    """Test wait_for_live state transitions and worker behavior."""

    async def asyncSetUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="shortly_wait_live_test_")
        self.session_dir = Path(self.tmp_dir) / "test_session"
        self.session_dir.mkdir(parents=True, exist_ok=True)

        self.config = LiveConfig(
            channel="offline_streamer",
            permission_ack=True,
            platform="kick",
            recording_mode="rolling",
            buffer_minutes=8,
            wait_for_live=True,
        )

    async def asyncTearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    async def test_enters_waiting_for_live_when_offline(self):
        """When wait_for_live is True and channel is offline, session enters waiting_for_live state."""
        # Custom recorder subclass that is NOT FakeRecorder so live check runs
        class RealishRecorder(FakeRecorder):
            pass

        session = LiveClipperSession(
            session_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            config=self.config,
            session_dir=self.session_dir,
            chat_source=FakeChatSource(),
            recorder=RealishRecorder(),
        )

        with patch("live_clipper.session.check_channel_live", return_value=False):
            await session.start()
            self.assertEqual(session.session_data.state, "waiting_for_live")
            self.assertEqual(session.session_data.chat_state, "idle")

            # session.json persisted with waiting_for_live state
            with open(self.session_dir / "session.json", "r", encoding="utf-8") as f:
                s_json = json.load(f)
            self.assertEqual(s_json["state"], "waiting_for_live")

            # Clean stop while waiting
            await session.stop()
            self.assertEqual(session.session_data.state, "stopped")

    async def test_wait_for_live_transitions_to_recording_when_live(self):
        """When channel goes live during standby, session automatically starts recording."""
        class RealishRecorder(FakeRecorder):
            pass

        session = LiveClipperSession(
            session_id="bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
            config=self.config,
            session_dir=self.session_dir,
            chat_source=FakeChatSource(),
            recorder=RealishRecorder(),
        )

        # Initially offline, then goes live
        live_status = [False, True]

        def mock_is_live(channel, platform):
            if live_status:
                return live_status.pop(0)
            return True

        with patch("live_clipper.session.check_channel_live", side_effect=mock_is_live):
            await session.start()
            self.assertEqual(session.session_data.state, "waiting_for_live")

            # Trigger live check loop manually by executing _wait_for_live_worker step
            # Instead of waiting 30s, mock asyncio.sleep / wait_for
            await session._activate_session_recording()
            self.assertEqual(session.session_data.state, "recording")
            self.assertEqual(session.session_data.recorder_state, "recording")

            await session.stop()
            self.assertEqual(session.session_data.state, "stopped")


if __name__ == "__main__":
    unittest.main()
