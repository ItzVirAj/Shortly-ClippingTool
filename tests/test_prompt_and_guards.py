"""Tests for prompt builder, output guards, profanity softening, and fallback metadata generation."""
import pytest
from manual_prompt_builder import (
    COPIED_EXAMPLE_PHRASES,
    build_manual_prompt,
    build_unified_prompt,
    clean_source_title,
    contains_copied_example,
    format_context_lines,
    generate_fallback_metadata_from_transcript,
    soften_profanity,
)
from manual_parser import extract_clips_from_raw_text, has_copied_examples, normalize_clip_item


class TestCleanSourceTitle:
    def test_empty_or_whitespace_returns_none(self):
        assert clean_source_title("") is None
        assert clean_source_title("   ") is None
        assert clean_source_title(None) is None

    def test_uuid_or_hash_returns_none(self):
        assert clean_source_title("161c4381-044f-4a76-bfec-7c9ace4987f0") is None
        assert clean_source_title("f24d8173-a93b-4240-ad97-6dfd18011822") is None
        assert clean_source_title("a1b2c3d4e5f67890123456789abcdef0") is None

    def test_preview_suffix_returns_none(self):
        assert clean_source_title("adinross_preview") is None
        assert clean_source_title("stream-preview.mp4") is None

    def test_uuid_prefix_with_real_title_extracts_real_title(self):
        title = clean_source_title("f24d8173-a93b-4240-ad97-6dfd18011822_adinross_stream.mp4")
        assert title == "adinross_stream"

    def test_real_title_preserved(self):
        assert clean_source_title("GTA V RP Server Heist") == "GTA V RP Server Heist"
        assert clean_source_title("Podcast_Episode_42.mp4") == "Podcast_Episode_42"


class TestContextLinesFormatting:
    def test_empty_fields_omitted_never_printed_as_none(self):
        formatted = format_context_lines(
            source_title=None,
            platform=None,
            streamer=None,
            topic=None,
            notes=None,
        )
        assert formatted == ""
        assert "None" not in formatted

    def test_uuid_source_title_omitted(self):
        formatted = format_context_lines(
            source_title="161c4381-044f-4a76-bfec-7c9ace4987f0",
            platform="Kick",
            streamer="adinross",
        )
        assert "- Source title:" not in formatted
        assert "- Platform: Kick" in formatted
        assert "- Streamer or channel: adinross" in formatted

    def test_all_valid_fields_included(self):
        formatted = format_context_lines(
            source_title="Epic GTA Heist",
            platform="Twitch",
            streamer="Summit1g",
            topic="GTA RP",
            notes="Focus on the motorcycle getaway",
        )
        assert "- Source title: Epic GTA Heist" in formatted
        assert "- Platform: Twitch" in formatted
        assert "- Streamer or channel: Summit1g" in formatted
        assert "- Topic or game: GTA RP" in formatted
        assert "- Notes: Focus on the motorcycle getaway" in formatted


class TestUnifiedPromptBuilder:
    def test_substitutes_all_variables_and_omits_none(self):
        prompt = build_unified_prompt(
            transcript_text="[00:10 - 00:25] We took the vault keys and ran.",
            video_duration=120.0,
            min_clips=2,
            max_clips=5,
            min_seconds=15.0,
            max_seconds=45.0,
            source_title="Vault Heist",
            platform="YouTube",
            streamer="GamerX",
        )
        assert "Choose between 2 and 5 moments" in prompt
        assert "Each clip is between 15 and 45 seconds" in prompt
        assert "total video duration is 120 seconds" in prompt
        assert "- Source title: Vault Heist" in prompt
        assert "- Platform: YouTube" in prompt
        assert "- Streamer or channel: GamerX" in prompt
        assert "Topic or game:" not in prompt
        assert "Notes:" not in prompt
        assert "None" not in prompt

    def test_no_example_titles_or_hooks_in_prompt_schema(self):
        prompt = build_unified_prompt(
            transcript_text="[00:00 - 00:15] Hello stream welcome back.",
            video_duration=60.0,
        )
        schema_part = prompt[prompt.find("OUTPUT:"):prompt.find("TRANSCRIPT:")]
        for phrase in COPIED_EXAMPLE_PHRASES:
            assert phrase.lower() not in schema_part.lower()
        # Realistic old examples must never appear anywhere in the schema
        assert "the brutal truth nobody admits" not in prompt.lower()
        assert "stop doing this. seriously" not in prompt.lower()
        assert "97% of people miss this" not in prompt.lower()
        assert "this one email almost ruined me" not in prompt.lower()
        assert "i automated my clips with ai" not in prompt.lower()

    def test_schema_uses_placeholders_never_realistic_sample_text(self):
        pkg = build_manual_prompt(
            transcript_result={"segments": [{"start": 0, "end": 10, "text": "Testing audio transcript."}]},
            video_duration=100.0,
            video_title="Test Video",
        )
        prompt = pkg["prompt_text"]
        assert '"video_title_for_youtube_short": string - specific title' in prompt
        assert '"viral_hook_text": string - hook text' in prompt
        assert "Why 99% Of People Fail Early" not in prompt
        assert "The brutal truth nobody admits" not in prompt


class TestOutputGuardsAndCopiedPhrases:
    @pytest.mark.parametrize("phrase", [
        "Why 99% Of People Fail Early",
        "The brutal truth nobody admits 🤯",
        "Why does everyone get this wrong?",
        "Stop doing this. Seriously.",
        "97% of people miss this.",
        "I automated my clips with AI",
    ])
    def test_detects_forbidden_copied_examples(self, phrase):
        assert contains_copied_example(phrase) is True
        assert has_copied_examples(f"Title: {phrase}") is True

    def test_clean_grounded_text_passes_guard(self):
        assert contains_copied_example("Tarik executes the B site clutch on 1 HP") is False
        assert contains_copied_example("Summit crashes the helicopter into the crane") is False


class TestProfanityFilter:
    def test_softens_severe_profanities(self):
        raw = "What the fucking hell was that shit?"
        softened = soften_profanity(raw)
        assert "fucking" not in softened.lower()
        assert "shit" not in softened.lower()
        assert "freaking" in softened.lower() or "crap" in softened.lower()

    def test_leaves_clean_text_unchanged(self):
        clean = "This is a clean and exciting video game highlight."
        assert soften_profanity(clean) == clean


class TestMetadataNormalizationAndFallbacks:
    def test_truncates_long_titles_at_word_boundary(self):
        long_title = "This is an extremely long title that exceeds seventy characters and would otherwise ruin the formatting of the clip"
        clip = {
            "start": 10.0,
            "end": 35.0,
            "video_title_for_youtube_short": long_title,
            "viral_hook_text": "Look at this",
        }
        norm = normalize_clip_item(clip, index=0, video_duration=100.0)
        assert norm is not None
        assert len(norm["video_title_for_youtube_short"]) <= 70
        assert not norm["video_title_for_youtube_short"].endswith(" ")

    def test_truncates_long_hook_to_ten_words(self):
        long_hook = "One two three four five six seven eight nine ten eleven twelve thirteen"
        clip = {
            "start": 10.0,
            "end": 35.0,
            "video_title_for_youtube_short": "Valid Title of Appropriate Length Here",
            "viral_hook_text": long_hook,
        }
        norm = normalize_clip_item(clip, index=0, video_duration=100.0)
        assert norm is not None
        assert len(norm["viral_hook_text"].split()) <= 10

    def test_copied_example_triggers_transcript_fallback(self):
        transcript_segments = [
            {"start": 10.0, "end": 20.0, "text": "We secured the helicopter and escaped the cops without losing cash."}
        ]
        clip = {
            "start": 10.0,
            "end": 20.0,
            "video_title_for_youtube_short": "Why 99% Of People Fail Early",
            "viral_hook_text": "The brutal truth nobody admits 🤯",
        }
        norm = normalize_clip_item(clip, index=0, video_duration=100.0, transcript_segments=transcript_segments)
        assert norm is not None
        # Should NOT contain the copied phrase
        assert "Why 99% Of People Fail Early" not in norm["video_title_for_youtube_short"]
        assert "The brutal truth" not in norm["viral_hook_text"]
        # Should contain words from the transcript
        assert "helicopter" in norm["video_title_for_youtube_short"].lower() or "escaped" in norm["video_title_for_youtube_short"].lower()

    def test_extract_clips_from_raw_text_with_guard(self):
        raw = """
        [
          {
            "start": 5.0,
            "end": 30.0,
            "video_title_for_youtube_short": "Unbelievable trick shot scored from downtown",
            "viral_hook_text": "He actually did that 🔥"
          }
        ]
        """
        clips = extract_clips_from_raw_text(raw, video_duration=60.0)
        assert len(clips) == 1
        assert clips[0]["start"] == 5.0
        assert clips[0]["end"] == 30.0
        assert "trick shot" in clips[0]["video_title_for_youtube_short"]
