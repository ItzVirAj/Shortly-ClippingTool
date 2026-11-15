"""Manual Prompt Builder for Shortly BYO-Agent (Manual / Free) Mode.

Formats transcripts into human-readable, token-efficient chunks with [MM:SS]
timestamps, and bundles them into an engineered prompt for ChatGPT, Claude,
Gemini Web, DeepSeek, or any external AI assistant.
"""
from __future__ import annotations

import math
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
            "- Hook overlay should promise high utility (e.g. 'How to master X in 3 steps 🧠')."
        ),
    },
    "story": {
        "name": "Storytelling & Drama",
        "description": "Focuses on narrative arcs, personal anecdotes, emotional revelations, or suspense.",
        "guidelines": (
            "- Clip should establish tension or conflict early and deliver a satisfying payoff.\n"
            "- Avoid cutting before the emotional peak or resolution.\n"
            "- Hook overlay should emphasize the story stakes (e.g. 'I wasn't supposed to share this... 😳')."
        ),
    },
    "humor": {
        "name": "Humor & Entertainment",
        "description": "Focuses on comedic timing, funny reactions, witty punchlines, and absurd moments.",
        "guidelines": (
            "- Prioritize setup-to-punchline timing.\n"
            "- Keep clips snappy and high-velocity.\n"
            "- Hook overlay should prime the viewer for the laugh (e.g. 'He did NOT see that coming 💀')."
        ),
    },
}


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
    """Group word-level or segment-level transcript items into natural chunks.

    Instead of feeding raw JSON tokens or individual word objects (which wastes
    thousands of tokens), this groups speech into coherent 12-25 second blocks
    with clear [MM:SS - MM:SS] timestamp headers.
    """
    segments = transcript_result.get("segments", []) if transcript_result else []
    chunks: List[Dict[str, Any]] = []

    # If transcript has segments with words or text
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

            # Check if chunk reached target duration or punctuation break
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

    # Fallback if only raw text or words list is provided
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


def build_manual_prompt(
    transcript_result: Dict[str, Any],
    video_duration: float,
    video_title: str = "Video Source",
    style_preset: str = "viral",
    min_clips: int = 3,
    max_clips: int = 7,
    min_seconds: int = 15,
    max_seconds: int = 60,
) -> Dict[str, Any]:
    """Build the complete engineered prompt package for external LLMs.

    Returns:
        {
            "prompt_text": str,
            "chunks": List[Dict],
            "video_duration": float,
            "video_duration_formatted": str,
            "word_count": int,
            "estimated_tokens": int,
            "style_preset": str,
            "style_name": str,
        }
    """
    preset = STYLE_PRESETS.get(style_preset.lower(), STYLE_PRESETS["viral"])
    chunks = chunk_transcript_for_prompt(transcript_result)

    total_words = sum(len(c["text"].split()) for c in chunks)
    # Estimate tokens: ~1.3 tokens per word + structure overhead
    est_tokens = int(total_words * 1.35) + 450

    dur_fmt = seconds_to_timestamp(video_duration)
    dur_sec = int(round(video_duration)) if video_duration > 0 else 0

    # Build formatted transcript lines
    formatted_transcript_lines = []
    for c in chunks:
        formatted_transcript_lines.append(f"[{c['start_fmt']} - {c['end_fmt']}] {c['text']}")
    formatted_transcript_block = "\n".join(formatted_transcript_lines)

    prompt = f"""You are an elite short-form video editor for TikTok, YouTube Shorts, and Instagram Reels.
I am providing a timestamped transcript of a video titled: "{video_title}".

---
### YOUR TASK:
Analyze the transcript and select between {min_clips} and {max_clips} of the most engaging, viral moments that can stand alone as complete, captivating shorts.

### EDITORIAL FOCUS: {preset['name'].upper()}
{preset['description']}
{preset['guidelines']}

### STRICT CRITERIA:
1. Duration: Each clip MUST be between {min_seconds} and {max_seconds} seconds long.
2. Boundaries: Start on a strong, immediate hook or sentence opener. End on a conclusion, punchline, or high-retention cliffhanger. Do not start or end mid-thought.
3. Timestamps: Only use timestamps that exist within the transcript. The total video duration is: {dur_fmt} ({dur_sec}s).
   - "start" and "end" values MUST be numerical floats/integers in total seconds (e.g. 74.5, not "01:14").
4. Viral Hook Text: Provide a punchy text overlay (maximum 8-10 words with 1-2 fitting emojis) that hooks the viewer in the first 3 seconds. MUST be in the same language as the transcript.
5. Title: Provide an engaging YouTube Short title.
6. Output Format: Return ONLY a valid JSON array matching the exact structure below. Do not wrap in conversational explanations, pleasantries, or preamble.

---
### REQUIRED OUTPUT JSON SCHEMA:
```json
[
  {{
    "start": 14.5,
    "end": 45.2,
    "viral_hook_text": "The brutal truth nobody admits 🤯",
    "video_title_for_youtube_short": "Why 99% Of People Fail Early",
    "why": "Opens on a contrarian statement that hooks curiosity, followed by high-value advice."
  }}
]
```

---
### TIMESTAMPED TRANSCRIPT:
{formatted_transcript_block}
"""

    return {
        "prompt_text": prompt.strip(),
        "chunks": chunks,
        "video_duration": video_duration,
        "video_duration_formatted": dur_fmt,
        "word_count": total_words,
        "estimated_tokens": est_tokens,
        "style_preset": style_preset,
        "style_name": preset["name"],
    }
