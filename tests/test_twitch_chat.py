"""Tests for Twitch anonymous read-only IRC chat source (Phase 5, Task 3)."""
import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from live_clipper.twitch_chat import (
    TwitchChatSource,
    parse_irc_privmsg,
    _PRIVMSG_RE,
)


class TestTwitchChat(unittest.IsolatedAsyncioTestCase):
    """Test Twitch anonymous IRC client and message parser."""

    def test_parse_irc_privmsg_regular(self):
        """Standard IRC PRIVMSG lines parse into ChatEvent with correct fields."""
        line = ":cooluser!cooluser@cooluser.tmi.twitch.tv PRIVMSG #shroud :HELLO CHAT POGGERS"
        ev = parse_irc_privmsg(line, now_t=12.5)

        self.assertIsNotNone(ev)
        self.assertEqual(ev.t, 12.5)
        self.assertEqual(ev.user, "cooluser")
        self.assertEqual(ev.text, "HELLO CHAT POGGERS")
        self.assertFalse(ev.is_bot)
        self.assertGreaterEqual(ev.emotes, 1)

    def test_parse_irc_privmsg_bot(self):
        """Known moderation bots are flagged as is_bot=True."""
        lines = [
            ":nightbot!nightbot@nightbot.tmi.twitch.tv PRIVMSG #streamer :Follow the Twitter at...",
            ":streamelements!streamelements@streamelements.tmi.twitch.tv PRIVMSG #streamer :Tip link...",
            ":mychannelbot!mychannelbot@mychannelbot.tmi.twitch.tv PRIVMSG #streamer :Song playing...",
        ]
        for line in lines:
            ev = parse_irc_privmsg(line, now_t=5.0)
            self.assertIsNotNone(ev)
            self.assertTrue(ev.is_bot)

    def test_parse_irc_non_privmsg(self):
        """IRC protocol notices or JOIN/PART messages return None."""
        lines = [
            ":tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!",
            ":tmi.twitch.tv 353 justinfan123 = #channel :user1 user2",
            "PING :tmi.twitch.tv",
        ]
        for line in lines:
            ev = parse_irc_privmsg(line, now_t=1.0)
            self.assertIsNone(ev)

    async def test_twitch_chat_connection_and_flow(self):
        """TwitchChatSource connects, parses stream, and shuts down cleanly."""
        src = TwitchChatSource(channel="testchannel")

        # Mock reader and writer
        mock_reader = AsyncMock()
        mock_writer = MagicMock()
        mock_writer.drain = AsyncMock()
        mock_writer.wait_closed = AsyncMock()
        mock_writer.is_closing = MagicMock(return_value=False)

        mock_reader.readline = AsyncMock(side_effect=[
            b":tmi.twitch.tv 001 justinfan123 :Welcome\r\n",
            b"PING :tmi.twitch.tv\r\n",
            b":streamfan!streamfan@streamfan.tmi.twitch.tv PRIVMSG #testchannel :INSANE CLUTCH LETS GO\r\n",
            b"", # EOF
        ])

        with patch("asyncio.open_connection", return_value=(mock_reader, mock_writer)):
            await src.connect()
            self.assertEqual(src.state, "connected")

            # Read event
            events_gen = src.events()
            ev = await anext(events_gen)
            self.assertEqual(ev.user, "streamfan")
            self.assertEqual(ev.text, "INSANE CLUTCH LETS GO")

            # Verify PONG was sent in response to PING
            mock_writer.write.assert_any_call(b"PONG :tmi.twitch.tv\r\n")

            await src.close()
            self.assertEqual(src.state, "disconnected")


if __name__ == "__main__":
    unittest.main()
