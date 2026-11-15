"""Tests for manual mode (BYO-Agent) prompt building and parsing."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from manual_prompt_builder import (
    STYLE_PRESETS,
    build_manual_prompt,
    chunk_transcript_for_prompt,
    seconds_to_timestamp,
)
from manual_parser import (
    clean_json_text,
    extract_clips_from_raw_text,
    extract_json_candidate,
    normalize_clip_item,
    parse_plain_text_clips,
    parse_timestamp_to_seconds,
)


class TestManualPromptBuilder(unittest.TestCase):

    def test_seconds_to_timestamp(self):
        self.assertEqual(seconds_to_timestamp(0), "00:00")
        self.assertEqual(seconds_to_timestamp(45.2), "00:45")
        self.assertEqual(seconds_to_timestamp(74.9), "01:15")
        self.assertEqual(seconds_to_timestamp(3665), "01:01:05")

    def test_chunk_transcript_for_prompt(self):
        transcript = {
            "segments": [
                {"start": 0.0, "end": 5.0, "text": "Hello world and welcome."},
                {"start": 5.2, "end": 12.0, "text": "Today we are discussing startups."},
                {"start": 12.2, "end": 20.0, "text": "First rule is validate early."},
                {"start": 20.1, "end": 28.5, "text": "Second rule is iterate fast."},
            ]
        }
        chunks = chunk_transcript_for_prompt(transcript, target_chunk_seconds=15.0)
        self.assertGreaterEqual(len(chunks), 2)
        self.assertIn("start_fmt", chunks[0])
        self.assertIn("end_fmt", chunks[0])
        self.assertIn("Hello world", chunks[0]["text"])

    def test_build_manual_prompt(self):
        transcript = {
            "segments": [
                {"start": 0.0, "end": 15.0, "text": "The secret to building great products is listening to users."},
                {"start": 15.5, "end": 35.0, "text": "Most companies fail because they build what nobody needs."},
                {"start": 35.5, "end": 60.0, "text": "Always talk to 10 customers every week without fail."},
            ]
        }
        res = build_manual_prompt(
            transcript_result=transcript,
            video_duration=60.0,
            video_title="Founder Secrets",
            style_preset="viral",
        )
        self.assertIn("Founder Secrets", res["prompt_text"])
        self.assertIn("VIRAL & RETENTION", res["prompt_text"])
        self.assertGreater(res["word_count"], 10)
        self.assertGreater(res["estimated_tokens"], 100)
        self.assertIn("[00:00 -", res["prompt_text"])


class TestManualParser(unittest.TestCase):

    def test_parse_timestamp_to_seconds(self):
        self.assertEqual(parse_timestamp_to_seconds(45), 45.0)
        self.assertEqual(parse_timestamp_to_seconds("45.5"), 45.5)
        self.assertEqual(parse_timestamp_to_seconds("45.5s"), 45.5)
        self.assertEqual(parse_timestamp_to_seconds("01:14"), 74.0)
        self.assertEqual(parse_timestamp_to_seconds("1:14.5"), 74.5)
        self.assertEqual(parse_timestamp_to_seconds("01:02:10"), 3730.0)
        self.assertIsNone(parse_timestamp_to_seconds("invalid"))
        self.assertIsNone(parse_timestamp_to_seconds(None))

    def test_clean_json_text(self):
        dirty = '{"start": 10, "end": 25,}'
        self.assertEqual(clean_json_text(dirty), '{"start": 10, "end": 25}')

    def test_extract_json_candidate_markdown_code_block(self):
        raw = """Sure, here are your requested viral shorts:
```json
[
  {
    "start": 10.5,
    "end": 35.2,
    "viral_hook_text": "The crazy truth 🤯",
    "video_title_for_youtube_short": "Crazy Truth",
    "why": "High curiosity"
  }
]
```
Hope you enjoy them!"""
        res = extract_json_candidate(raw)
        self.assertIsInstance(res, list)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["start"], 10.5)

    def test_extract_json_candidate_wrapped_in_object(self):
        raw = """{
          "shorts": [
            {
              "start": 15.0,
              "end": 45.0,
              "viral_hook_text": "Stop Doing This 🚫",
              "video_title_for_youtube_short": "Stop Doing This"
            }
          ]
        }"""
        clips = extract_clips_from_raw_text(raw, video_duration=120.0)
        self.assertEqual(len(clips), 1)
        self.assertEqual(clips[0]["start"], 15.0)
        self.assertEqual(clips[0]["end"], 45.0)
        self.assertEqual(clips[0]["viral_hook_text"], "Stop Doing This 🚫")
        self.assertEqual(clips[0]["predicted_score"], 95)

    def test_extract_clips_with_trailing_commas(self):
        raw = """[
          {
            "start": 12.0,
            "end": 38.0,
            "viral_hook_text": "Mind blown 🔥",
            "video_title_for_youtube_short": "Amazing Fact",
          },
        ]"""
        clips = extract_clips_from_raw_text(raw, video_duration=60.0)
        self.assertEqual(len(clips), 1)
        self.assertEqual(clips[0]["start"], 12.0)
        self.assertEqual(clips[0]["end"], 38.0)

    def test_extract_clips_with_timestamp_strings(self):
        raw = """[
          {
            "start": "01:10",
            "end": "01:45",
            "viral_hook_text": "The hardest part 😳",
            "video_title_for_youtube_short": "Hardest Part"
          }
        ]"""
        clips = extract_clips_from_raw_text(raw, video_duration=180.0)
        self.assertEqual(len(clips), 1)
        self.assertEqual(clips[0]["start"], 70.0)
        self.assertEqual(clips[0]["end"], 105.0)

    def test_fallback_plain_text_clips(self):
        raw = """Here are the top moments I picked for you:

Clip 1:
Timestamp: 00:15 - 00:45
Hook: The hidden mistake founders make 🚫
Title: Founder Mistakes
Why: Clear advice

Clip 2:
[01:10 - 01:50]
Hook: Nobody told you this truth 🤯
Title: Unspoken Truths
"""
        clips = extract_clips_from_raw_text(raw, video_duration=200.0)
        self.assertEqual(len(clips), 2)
        self.assertEqual(clips[0]["start"], 15.0)
        self.assertEqual(clips[0]["end"], 45.0)
        self.assertIn("hidden mistake", clips[0]["viral_hook_text"])
        self.assertEqual(clips[1]["start"], 70.0)
        self.assertEqual(clips[1]["end"], 110.0)
        self.assertIn("Nobody told you", clips[1]["viral_hook_text"])

    def test_clamp_and_validate_boundaries(self):
        raw = """[
          {"start": 10.0, "end": 55.0, "viral_hook_text": "Good Clip"},
          {"start": 60.0, "end": 80.0, "viral_hook_text": "Invalid Clip"}
        ]"""
        clips = extract_clips_from_raw_text(raw, video_duration=50.0)
        self.assertEqual(len(clips), 1)
        self.assertEqual(clips[0]["start"], 10.0)
        self.assertEqual(clips[0]["end"], 50.0)


if __name__ == "__main__":
    unittest.main()
