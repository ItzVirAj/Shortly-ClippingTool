"""Unit tests for YouTube live chat parsing and URL normalization."""
import json
import pytest

from live_clipper.youtube_chat import (
    normalize_youtube_url,
    extract_chat_text,
    extract_video_id,
    parse_chat_action,
    parse_chat_line,
)
from live_clipper.session import clean_channel_slug


def test_extract_video_id():
    assert extract_video_id("https://www.youtube.com/watch?v=dklfSqHUu4c") == "dklfSqHUu4c"
    assert extract_video_id("https://youtu.be/dklfSqHUu4c") == "dklfSqHUu4c"
    assert extract_video_id("https://www.youtube.com/live/dklfSqHUu4c") == "dklfSqHUu4c"
    assert extract_video_id("dklfSqHUu4c") == "dklfSqHUu4c"
    assert extract_video_id("https://www.youtube.com/@IShowSpeed") is None


def test_parse_chat_action():
    action = {
        "addChatItemAction": {
            "item": {
                "liveChatTextMessageRenderer": {
                    "authorName": {"simpleText": "SpeedFan"},
                    "message": {"runs": [{"text": "W STREAM W W W"}]},
                    "timestampUsec": "1700000025000000",
                }
            }
        }
    }
    events = parse_chat_action(action, now_offset=25.0)
    assert len(events) == 1
    assert events[0].user == "SpeedFan"
    assert events[0].text == "W STREAM W W W"
    assert events[0].t == 25.0


def test_clean_channel_slug_youtube():
    assert clean_channel_slug("https://www.youtube.com/watch?v=dklfSqHUu4c", platform="youtube") == "https://www.youtube.com/watch?v=dklfSqHUu4c"
    assert clean_channel_slug("www.youtube.com/watch?v=dklfSqHUu4c", platform="youtube") == "https://www.youtube.com/watch?v=dklfSqHUu4c"
    assert clean_channel_slug("dklfSqHUu4c", platform="youtube") == "https://www.youtube.com/watch?v=dklfSqHUu4c"
    assert clean_channel_slug("@IShowSpeed", platform="youtube") == "@IShowSpeed"
    assert clean_channel_slug("IShowSpeed", platform="youtube") == "@IShowSpeed"


def test_normalize_youtube_url():
    # Full URL
    assert normalize_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    # Channel handle
    assert normalize_youtube_url("@LofiGirl") == "https://www.youtube.com/@LofiGirl/live"
    # Handle without @
    assert normalize_youtube_url("LofiGirl") == "https://www.youtube.com/@LofiGirl/live"
    # Video ID
    assert normalize_youtube_url("dQw4w9WgXcQ") == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"


def test_extract_chat_text():
    # Text run
    item = {"message": {"runs": [{"text": "Hello world!"}]}}
    assert extract_chat_text(item) == "Hello world!"

    # Mixed text and emoji
    item_emoji = {
        "message": {
            "runs": [
                {"text": "OMG "},
                {"emoji": {"shortcuts": [":fire:"], "emojiId": "fire"}},
                {"text": " that was insane!"},
            ]
        }
    }
    assert extract_chat_text(item_emoji) == "OMG :fire: that was insane!"


def test_parse_chat_line_live():
    # Sample yt-dlp live chat line
    raw = json.dumps({
        "addChatItemAction": {
            "item": {
                "liveChatTextMessageRenderer": {
                    "authorName": {"simpleText": "ProGamer99"},
                    "message": {"runs": [{"text": "CLUTCH GOD POG"}]},
                    "timestampUsec": "1700000010000000",
                }
            }
        }
    })
    events = parse_chat_line(raw, rec_start=1700000000.0)
    assert len(events) == 1
    ev = events[0]
    assert ev.user == "ProGamer99"
    assert ev.text == "CLUTCH GOD POG"
    assert ev.t == 10.0
    assert ev.emotes >= 1
    assert not ev.is_bot


def test_parse_chat_line_vod_replay():
    # Sample yt-dlp VOD replay line
    raw = json.dumps({
        "replayChatItemAction": {
            "videoOffsetTimeMsec": "45200",
            "actions": [
                {
                    "addChatItemAction": {
                        "item": {
                            "liveChatTextMessageRenderer": {
                                "authorName": {"simpleText": "Viewer123"},
                                "message": {"runs": [{"text": "LMAOOO"}]},
                            }
                        }
                    }
                }
            ]
        }
    })
    events = parse_chat_line(raw)
    assert len(events) == 1
    ev = events[0]
    assert ev.user == "Viewer123"
    assert ev.text == "LMAOOO"
    assert ev.t == 45.2
