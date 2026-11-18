"""Manual and Shared Prompt Builder for Shortly (BYO-Agent, Auto/Gemini, and Local LLM).

Formats transcripts into human-readable, token-efficient chunks with [MM:SS]
timestamps, and bundles them into an engineered prompt for ChatGPT, Claude,
Gemini Web, DeepSeek, or local LLMs using a single unified template.
"""
from __future__ import annotations

import math
import os
import re
from typing import Any, Dict, List, Optional, Tuple


STYLE_PRESETS: Dict[str, Dict[str, str]] = {
    "viral": {
        "name": "Viral & Retention",
        "description": "High energy, punchy hooks, pattern interrupts, and curiosity gaps for TikTok/Reels/Shorts.",
        "guidelines": (
            "- Open on a bold contrarian claim, striking question, or high-stakes moment.\n"
            "- Cut immediately before dead air or rambling.\n"
            "- Hook overlay must be concise (max 8-10 words) with 1-2 expressive emojis."
        ),
    },
    "educational": {
        "name": "Educational & Actionable",
        "description": "Focuses on valuable insights, frameworks, step-by-step advice, and takeaways.",
        "guidelines": (
            "- Clip should contain a complete lesson, framework, or mental model.\n"
            "- Ensure the problem and solution are both covered within the duration.\n"
            "- Hook overlay should promise high utility with concise, direct phrasing and 1-2 expressive emojis."
        ),
    },
    "story": {
        "name": "Storytelling & Drama",
        "description": "Focuses on narrative arcs, personal anecdotes, emotional revelations, or suspense.",
        "guidelines": (
            "- Clip should establish tension or conflict early and deliver a satisfying payoff.\n"
            "- Avoid cutting before the emotional peak or resolution.\n"
            "- Hook overlay should emphasize story stakes and emotional curiosity."
        ),
    },
    "humor": {
        "name": "Humor & Entertainment",
        "description": "Focuses on comedic timing, funny reactions, witty punchlines, and absurd moments.",
        "guidelines": (
            "- Prioritize setup-to-punchline timing.\n"
            "- Keep clips snappy and high-velocity.\n"
            "- Hook overlay should prime the viewer for the laugh without spoiling the punchline."
        ),
    },
}

UUID_REGEX = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
HEX_HASH_REGEX = re.compile(r"^[0-9a-fA-F]{16,64}$")

# List of known phrases old prompts used that must trigger output guard rejections
COPIED_EXAMPLE_PHRASES = [
    "why 99% of people fail early",
    "why 99% of people",
    "the brutal truth nobody admits",
    "the brutal truth",
    "how to master x in 3 steps",
    "i wasn't supposed to share this",
    "he did not see that coming",
    "why does everyone get this wrong",
    "stop doing this. seriously",
    "stop doing this right now",
    "97% of people miss this",
    "this one email almost ruined me",
    "pov: you finally understand it",
    "i automated my clips with ai",
    "3 big mistakes in code",
    "coding secrets",
    "watch this moment",
    "viral moment #",
]

PROFANITY_MAP = {
    r"\bfuck(?:ing|ed|er|s)?\b": "freaking",
    r"\bshit(?:ting|ty|s)?\b": "crap",
    r"\bbitch(?:es|ing)?\b": "jerk",
    r"\basshole(?:s)?\b": "jerk",
    r"\bbastard(?:s)?\b": "jerk",
    r"\bcunt(?:s)?\b": "person",
    r"\bdick(?:s)?\b": "fool",
    r"\bdamn\b": "darn",
    r"\bpiss(?:ed)?\b": "ticked",
    r"\bmotherfuck(?:er|ing)?\b": "freaking",
}


def clean_source_title(raw_title: Optional[str]) -> Optional[str]:
    """Clean a source title, treating UUIDs, hashes, _preview, and empty values as unknown (None)."""
    if not raw_title:
        return None
    s = str(raw_title).strip()
    if not s:
        return None

    # Strip video extension
    base, ext = os.path.splitext(s)
    if ext.lower() in (".mp4", ".mov", ".mkv", ".webm", ".avi", ".ts"):
        s = base

    # Discard preview suffixes
    if s.endswith("_preview") or s.endswith("-preview"):
        return None

    # Discard bare UUID or hash
    if UUID_REGEX.match(s) or HEX_HASH_REGEX.match(s):
        return None

    # If prefixed by UUID (e.g. app.py upload path "{job_id}_{safe_name}")
    uuid_prefix = re.match(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}_(.*)$", s)
    if uuid_prefix:
        rest = uuid_prefix.group(1).strip()
        return clean_source_title(rest)

    # Discard generic placeholders
    if s.lower() in ("video source", "source", "upload", "video", "input", "untitled", "none"):
        return None

    return s


def format_context_lines(
    source_title: Optional[str] = None,
    platform: Optional[str] = None,
    streamer: Optional[str] = None,
    topic: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """Format non-empty context fields into bullet lines; empty fields are omitted, never 'None'."""
    lines = []
    clean_title = clean_source_title(source_title)
    if clean_title:
        lines.append(f"- Source title: {clean_title}")
    if platform and str(platform).strip() and str(platform).strip().lower() != "none":
        lines.append(f"- Platform: {str(platform).strip()}")
    if streamer and str(streamer).strip() and str(streamer).strip().lower() != "none":
        lines.append(f"- Streamer or channel: {str(streamer).strip()}")
    if topic and str(topic).strip() and str(topic).strip().lower() != "none":
        lines.append(f"- Topic or game: {str(topic).strip()}")
    if notes and str(notes).strip() and str(notes).strip().lower() != "none":
        lines.append(f"- Notes: {str(notes).strip()}")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Integration point for future Live Clipper module
# ---------------------------------------------------------------------------
def extract_live_clipper_context(session_or_job_meta: Optional[Dict[str, Any]]) -> Dict[str, Optional[str]]:
    """Hook for live-clipper module to automatically pass channel and platform.

    Future implementation will populate streamer, platform, and game directly
    from active live stream session metadata.
    """
    if not session_or_job_meta:
        return {"streamer": None, "platform": None, "topic": None, "notes": None}

    return {
        "streamer": session_or_job_meta.get("streamer") or session_or_job_meta.get("channel"),
        "platform": session_or_job_meta.get("platform"),
        "topic": session_or_job_meta.get("topic") or session_or_job_meta.get("game"),
        "notes": session_or_job_meta.get("notes"),
    }


def soften_profanity(text: str) -> str:
    """Replace severe profanities with milder alternatives so content remains monetizable."""
    if not text:
        return text
    result = text
    for pattern, replacement in PROFANITY_MAP.items():
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result


def contains_copied_example(text: str) -> bool:
    """Check if text copies any of the forbidden sample phrases from old prompts."""
    if not text:
        return False
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    cleaned = " ".join(cleaned.split())
    for phrase in COPIED_EXAMPLE_PHRASES:
        p_clean = re.sub(r"[^\w\s]", " ", phrase.lower())
        p_clean = " ".join(p_clean.split())
        if p_clean in cleaned:
            return True
    return False


def seconds_to_timestamp(seconds: float) -> str:
    """Format seconds into MM:SS or HH:MM:SS."""
    if seconds < 0:
        seconds = 0
    total_sec = int(round(seconds))
    hrs = total_sec // 3600
    mins = (total_sec % 3600) // 60
    secs = total_sec % 60
    if hrs > 0:
        return f"{hrs:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"


def chunk_transcript_for_prompt(
    transcript_result: Dict[str, Any],
    target_chunk_seconds: float = 18.0,
    max_chunk_seconds: float = 30.0,
) -> List[Dict[str, Any]]:
    """Group word-level or segment-level transcript items into natural chunks with [MM:SS] headers."""
    segments = transcript_result.get("segments", []) if transcript_result else []
    chunks: List[Dict[str, Any]] = []

    if segments:
        current_words: List[str] = []
        chunk_start: Optional[float] = None
        chunk_end: float = 0.0

        for seg in segments:
            seg_start = float(seg.get("start", 0.0))
            seg_end = float(seg.get("end", seg_start))
            text = str(seg.get("text", "")).strip()

            if not text:
                continue

            if chunk_start is None:
                chunk_start = seg_start

            current_words.append(text)
            chunk_end = max(chunk_end, seg_end)

            dur = chunk_end - chunk_start
            ends_with_terminal = text.endswith((".", "!", "?", "...", ":"))
            if (dur >= target_chunk_seconds and ends_with_terminal) or dur >= max_chunk_seconds:
                chunks.append({
                    "start": round(chunk_start, 2),
                    "end": round(chunk_end, 2),
                    "start_fmt": seconds_to_timestamp(chunk_start),
                    "end_fmt": seconds_to_timestamp(chunk_end),
                    "text": " ".join(current_words).strip(),
                })
                current_words = []
                chunk_start = None

        if current_words and chunk_start is not None:
            chunks.append({
                "start": round(chunk_start, 2),
                "end": round(chunk_end, 2),
                "start_fmt": seconds_to_timestamp(chunk_start),
                "end_fmt": seconds_to_timestamp(chunk_end),
                "text": " ".join(current_words).strip(),
            })
    elif transcript_result and transcript_result.get("text"):
        raw_text = str(transcript_result.get("text", "")).strip()
        chunks.append({
            "start": 0.0,
            "end": 0.0,
            "start_fmt": "00:00",
            "end_fmt": "00:00",
            "text": raw_text,
        })

    return chunks


# Canonical schema fields representation for prompt template:
# One line per existing key in form: "<key>": <type> - <what it must contain>
SCHEMA_FIELDS_SPEC = """[
  {
    "start": number - start timestamp in total seconds from the transcript,
    "end": number - end timestamp in total seconds from the transcript,
    "source_window_id": string - candidate window identifier or segment id,
    "predicted_score": integer - estimated viral score from 0 to 100,
    "video_title_for_youtube_short": string - specific title (40 to 70 characters) based on concrete events in this clip,
    "viral_hook_text": string - SINGLE LINE punchy hook strictly 3 to 4 words (+ optional 1 emoji) relative to the streamer being recorded,
    "video_description_for_tiktok": string - 1 to 2 sentences (at most 200 characters) plus 3 to 5 relevant hashtags,
    "video_description_for_instagram": string - 1 to 2 sentences (at most 200 characters) plus 3 to 5 relevant hashtags,
    "why": string - brief explanation of why this moment was selected
  }
]"""


def build_unified_prompt(
    transcript_text: str,
    video_duration: float,
    min_clips: int = 3,
    max_clips: int = 7,
    min_seconds: float = 15.0,
    max_seconds: float = 60.0,
    style_focus: str = "High energy, punchy hooks, and pattern interrupts for maximum audience retention.",
    source_title: Optional[str] = None,
    platform: Optional[str] = None,
    streamer: Optional[str] = None,
    topic: Optional[str] = None,
    notes: Optional[str] = None,
) -> str:
    """Build the single shared prompt using verbatim required template wording."""
    context_lines = format_context_lines(
        source_title=source_title,
        platform=platform,
        streamer=streamer,
        topic=topic,
        notes=notes,
    )

    if context_lines:
        context_block = f"{context_lines}\n"
    else:
        context_block = ""

    dur_sec = int(round(video_duration)) if video_duration > 0 else 0

    prompt = f"""You are an expert short-form video editor for TikTok, YouTube Shorts and Instagram Reels. I give you a timestamped transcript. Find the best standalone moments and write the title, hook and descriptions for each.

CONTEXT (from the user; may be incomplete):
{context_block}Anything not listed is unknown. Never guess names, games, or events that are not in this context or the transcript.

ABOUT THE TRANSCRIPT: It was produced automatically from audio. It may contain wrong words and missing parts, and you cannot see the video. Base everything on what the words clearly say. If the meaning is unclear, describe what is audibly happening (a loud reaction, an argument, a big win or loss, an escalating plea) in neutral words. Do not invent a storyline, topic, or lesson.

SELECTION:
- Choose between {min_clips} and {max_clips} moments; fewer is better than weak ones.
- Each clip is between {min_seconds:g} and {max_seconds:g} seconds. The total video duration is {dur_sec} seconds.
- "start" and "end" are numbers in total seconds taken from the transcript timestamps (for example 74.5, never "01:14"). Do not use times outside the transcript.
- Start at a sentence opener or a strong moment, end on a payoff or natural stop. Do not cut mid-sentence. Clips must not overlap.
- Editorial focus: {style_focus}

WRITING RULES for every clip:
- Title: 40 to 70 characters, specific to what happens in THIS clip. Use concrete details from the transcript or context (numbers, names, objects, actions). No generic advice or lesson formulas ("Why 99% of people...", "The truth about...") unless the clip literally says that. No claim the clip does not deliver.
- Hook text: SINGLE LINE, strictly 3 to 4 words (plus optional 1 emoji), NEVER longer than 4 words and NEVER multi-line. Make it directly relative to the streamer being recorded (use the streamer's name from CONTEXT when available, e.g. "<Streamer> broke GTA 😱", "<Streamer>'s insane clutch 🔥", "When <Streamer> panics 💀").
- Description: 1 to 2 sentences (at most 200 characters) saying what happens, then 3 to 5 hashtags built from the real topic, context, and transcript.
- Keep profanity out of the title, hook, and description; use a milder word that keeps the meaning.
- Write in the same language as the transcript.
- Every field must be written fresh for the clip. Do not reuse any wording from this schema.

OUTPUT: only a JSON array (one code block is fine), no other text. One object per clip with these fields:
{SCHEMA_FIELDS_SPEC}

TRANSCRIPT:
{transcript_text}

REMINDER: JSON only. Title, hook, and descriptions must describe this clip, using the context and transcript, and must not copy the schema text."""

    return prompt.strip()


def build_manual_prompt(
    transcript_result: Dict[str, Any],
    video_duration: float,
    video_title: str = "Video Source",
    style_preset: str = "viral",
    min_clips: int = 3,
    max_clips: int = 7,
    min_seconds: int = 15,
    max_seconds: int = 60,
    platform: Optional[str] = None,
    streamer: Optional[str] = None,
    topic: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """Build the complete engineered prompt package for manual / BYO-agent mode."""
    preset = STYLE_PRESETS.get(style_preset.lower(), STYLE_PRESETS["viral"])
    chunks = chunk_transcript_for_prompt(transcript_result)

    total_words = sum(len(c["text"].split()) for c in chunks)
    est_tokens = int(total_words * 1.35) + 450

    dur_fmt = seconds_to_timestamp(video_duration)

    formatted_transcript_lines = []
    for c in chunks:
        formatted_transcript_lines.append(f"[{c['start_fmt']} - {c['end_fmt']}] {c['text']}")
    formatted_transcript_block = "\n".join(formatted_transcript_lines)

    style_focus = f"{preset['name']}: {preset['description']}"

    prompt_text = build_unified_prompt(
        transcript_text=formatted_transcript_block,
        video_duration=video_duration,
        min_clips=min_clips,
        max_clips=max_clips,
        min_seconds=float(min_seconds),
        max_seconds=float(max_seconds),
        style_focus=style_focus,
        source_title=video_title,
        platform=platform,
        streamer=streamer,
        topic=topic,
        notes=notes,
    )

    return {
        "prompt_text": prompt_text,
        "chunks": chunks,
        "video_duration": video_duration,
        "video_duration_formatted": dur_fmt,
        "word_count": total_words,
        "estimated_tokens": est_tokens,
        "style_preset": style_preset,
        "style_name": preset["name"],
        "video_title": clean_source_title(video_title) or "",
        "platform": platform or "",
        "streamer": streamer or "",
        "topic": topic or "",
        "notes": notes or "",
    }


def generate_fallback_metadata_from_transcript(
    clip_start: float,
    clip_end: float,
    transcript_segments_or_words: List[Dict[str, Any]],
    topic: Optional[str] = None,
    streamer: Optional[str] = None,
) -> Dict[str, str]:
    """Generate grounded fallback metadata from the actual spoken transcript words for a clip slice."""
    spoken_words = []
    for item in (transcript_segments_or_words or []):
        s = float(item.get("start", 0))
        e = float(item.get("end", s))
        if "words" in item and isinstance(item["words"], list):
            for w in item["words"]:
                ws = float(w.get("start", s))
                we = float(w.get("end", ws))
                if clip_start - 0.5 <= ws and we <= clip_end + 0.5:
                    wtext = str(w.get("word") or w.get("text") or "").strip()
                    if wtext:
                        spoken_words.append(wtext)
        elif clip_start - 0.5 <= s and e <= clip_end + 0.5:
            text = str(item.get("text") or "").strip()
            if text:
                spoken_words.extend(text.split())

    spoken_sentence = " ".join(spoken_words).strip()
    if not spoken_sentence:
        spoken_sentence = "Unbelievable moment from the recording"

    spoken_clean = soften_profanity(spoken_sentence)

    # 1. Fallback Hook: SINGLE LINE strictly 3-4 words (+ emoji), relative to streamer when known
    from hooks import enforce_single_line_hook
    words = spoken_clean.split()
    hook_seed = " ".join(words[:4]).strip() or "Watch this moment"
    hook_text = enforce_single_line_hook(f"{hook_seed} 👀", streamer=streamer, max_words=4)

    # 2. Fallback Title: 40 to 70 chars, concrete from transcript
    if len(spoken_clean) >= 40:
        title = spoken_clean[:70]
        if len(spoken_clean) > 70:
            title = title.rsplit(" ", 1)[0]
    else:
        ctx_prefix = f"{topic}: " if topic else (f"{streamer}: " if streamer else "")
        combined = f"{ctx_prefix}{spoken_clean}"
        if len(combined) < 40:
            combined = f"{combined} - Key Highlights"
        title = combined[:70]
        if len(combined) > 70:
            title = title.rsplit(" ", 1)[0]

    if len(title) < 40:
        title = (title + " - Viral Moments").strip()[:70]
        if len(title) < 40:
            title = (title + " Full Clip").strip()[:70]

    # 3. Fallback Description: 1 to 2 sentences (at most 200 chars) + 3 to 5 hashtags
    desc_base = spoken_clean[:125]
    if len(spoken_clean) > 125:
        desc_base = desc_base.rsplit(" ", 1)[0] + "."
    elif not desc_base.endswith((".", "!", "?")):
        desc_base += "."

    tags = []
    if streamer:
        tags.append(f"#{re.sub(r'[^a-zA-Z0-9]', '', streamer).lower()}")
    if topic:
        tags.append(f"#{re.sub(r'[^a-zA-Z0-9]', '', topic).lower()}")
    tags.extend(["#shorts", "#viral", "#trending"])
    tags_str = " ".join(tags[:4])

    full_desc = f"{desc_base} {tags_str}".strip()
    if len(full_desc) > 200:
        full_desc = full_desc[:200].rsplit(" ", 1)[0]

    return {
        "video_title_for_youtube_short": title,
        "viral_hook_text": hook_text,
        "video_description_for_tiktok": full_desc,
        "video_description_for_instagram": full_desc,
    }
