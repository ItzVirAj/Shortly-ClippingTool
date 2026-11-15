"""Manual Parser for Shortly BYO-Agent (Manual / Free) Mode.

Parses external LLM outputs (ChatGPT, Claude, Gemini Web, DeepSeek, etc.)
whether returned as strict JSON, markdown code blocks, lenient JSON with
conversational text, or human-readable timestamp lists. Normalizes all clips into
the canonical DetailClipModel schema used by Shortly's video engine.
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple, Union


def parse_timestamp_to_seconds(val: Union[str, int, float]) -> Optional[float]:
    """Parse various timestamp representations into float seconds.

    Supports:
        - Numbers: 45, 74.5
        - String numbers: "45", "74.5", "74.5s"
        - Time codes: "01:14", "1:14", "01:14.5", "00:01:14", "1:02:15"
    """
    if val is None:
        return None

    if isinstance(val, (int, float)):
        return float(val) if val >= 0 else None

    s = str(val).strip().rstrip("sS")
    if not s:
        return None

    # Plain float/int string
    try:
        f = float(s)
        return f if f >= 0 else None
    except ValueError:
        pass

    # Timecode format (HH:MM:SS or MM:SS)
    parts = s.split(":")
    try:
        if len(parts) == 2:
            mins, secs = float(parts[0]), float(parts[1])
            return mins * 60.0 + secs
        elif len(parts) == 3:
            hrs, mins, secs = float(parts[0]), float(parts[1]), float(parts[2])
            return hrs * 3600.0 + mins * 60.0 + secs
    except (ValueError, TypeError):
        pass

    return None


def clean_json_text(text: str) -> str:
    """Sanitize typical small formatting errors in LLM JSON output."""
    # Remove trailing commas before closing braces/brackets
    cleaned = re.sub(r",\s*([\]}])", r"\1", text)
    return cleaned.strip()


def extract_json_candidate(raw_text: str) -> Optional[Any]:
    """Locate and extract JSON from raw text containing chatter or markdown fences."""
    if not raw_text or not raw_text.strip():
        return None

    text = raw_text.strip()

    # 1. Check for markdown code blocks (```json ... ``` or ``` ... ```)
    code_block_matches = re.findall(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    for block in code_block_matches:
        block_clean = clean_json_text(block)
        try:
            return json.loads(block_clean)
        except json.JSONDecodeError:
            # Try isolating outer brackets/braces inside the code block
            isolated = _isolate_brackets(block_clean)
            if isolated is not None:
                return isolated

    # 2. Try parsing entire text directly as JSON
    try:
        return json.loads(clean_json_text(text))
    except json.JSONDecodeError:
        pass

    # 3. Try finding the outer [ ... ] or { ... } anywhere in the text
    return _isolate_brackets(text)


def _isolate_brackets(text: str) -> Optional[Any]:
    """Find outermost JSON array or object substring and parse it."""
    # Try finding an array first
    first_bracket = text.find("[")
    last_bracket = text.rfind("]")
    if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
        candidate = text[first_bracket:last_bracket + 1]
        try:
            return json.loads(clean_json_text(candidate))
        except json.JSONDecodeError:
            pass

    # Try finding an object { ... }
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = text[first_brace:last_brace + 1]
        try:
            return json.loads(clean_json_text(candidate))
        except json.JSONDecodeError:
            pass

    return None


def parse_plain_text_clips(raw_text: str, video_duration: float = 0.0) -> List[Dict[str, Any]]:
    """Fallback parser for unstructured plain text containing timestamps.

    Handles formats like:
        Clip 1: [00:15 - 00:45]
        Hook: Stop doing this right now 🚫
        Title: 3 Big Mistakes in Code
        Why: Great opening hook

        OR:
        1. 01:10 - 01:45 | Hook: The secret truth 🤯 | Title: Coding Secrets
    """
    clips: List[Dict[str, Any]] = []
    lines = raw_text.splitlines()

    timestamp_regex = re.compile(
        r"(?:(?:clip\s*\d+|part\s*\d+):?\s*)?"
        r"(?:\[|\()?\s*(\d{1,2}:\d{2}(?::\d{2})?|\d+(?:\.\d+)?s?)\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2}(?::\d{2})?|\d+(?:\.\d+)?s?)\s*(?:\]|\))?",
        re.IGNORECASE,
    )

    current_clip: Optional[Dict[str, Any]] = None

    for line in lines:
        line_s = line.strip()
        if not line_s:
            continue

        ts_match = timestamp_regex.search(line_s)
        if ts_match:
            # If we already had a clip being built, save it
            if current_clip and "start" in current_clip and "end" in current_clip:
                clips.append(current_clip)

            raw_s, raw_e = ts_match.group(1), ts_match.group(2)
            st = parse_timestamp_to_seconds(raw_s)
            et = parse_timestamp_to_seconds(raw_e)

            if st is not None and et is not None and et > st:
                current_clip = {
                    "start": st,
                    "end": et,
                    "viral_hook_text": "",
                    "video_title_for_youtube_short": "",
                    "why": "",
                }

                # Check if remainder of this line has hook or title
                remainder = line_s[ts_match.end():].strip().lstrip(":-| ")
                if remainder:
                    _extract_metadata_from_line(remainder, current_clip)
            continue

        # Look for Hook, Title, Why lines in context of current clip
        if current_clip:
            _extract_metadata_from_line(line_s, current_clip)

    if current_clip and "start" in current_clip and "end" in current_clip:
        clips.append(current_clip)

    return clips


def _extract_metadata_from_line(line: str, clip: Dict[str, Any]) -> None:
    """Helper to extract hook, title, or why from an annotated line."""
    lower = line.lower()
    if lower.startswith(("hook:", "hook text:", "viral hook:", "viral hook text:")):
        clip["viral_hook_text"] = line.split(":", 1)[1].strip().strip('"\'')
    elif lower.startswith(("title:", "video title:", "youtube title:")):
        clip["video_title_for_youtube_short"] = line.split(":", 1)[1].strip().strip('"\'')
    elif lower.startswith(("why:", "reason:", "why it works:")):
        clip["why"] = line.split(":", 1)[1].strip().strip('"\'')
    elif not clip.get("viral_hook_text") and len(line) < 70 and ("🔥" in line or "🤯" in line or "👀" in line or "POV" in line):
        clip["viral_hook_text"] = line.strip().strip('"\'')
    elif not clip.get("video_title_for_youtube_short") and len(line) < 80:
        clip["video_title_for_youtube_short"] = line.strip().strip('"\'')


def normalize_clip_item(
    item: Dict[str, Any],
    index: int,
    video_duration: float = 0.0,
    min_duration: float = 8.0,
    max_duration: float = 180.0,
) -> Optional[Dict[str, Any]]:
    """Validate, sanitize, and format a raw clip candidate into canonical schema."""
    if not isinstance(item, dict):
        return None

    # Parse timestamps
    raw_start = item.get("start")
    raw_end = item.get("end")

    start_sec = parse_timestamp_to_seconds(raw_start)
    end_sec = parse_timestamp_to_seconds(raw_end)

    if start_sec is None or end_sec is None:
        return None

    start_sec = max(0.0, round(start_sec, 2))
    end_sec = round(end_sec, 2)

    # Check bounds against video duration
    if video_duration > 0:
        if start_sec >= video_duration:
            return None
        # Clamp end to video duration if slightly exceeding
        end_sec = min(end_sec, round(video_duration, 2))

    duration = end_sec - start_sec
    if duration < min_duration or duration > max_duration or end_sec <= start_sec:
        return None

    # Hooks & Titles
    hook_text = str(item.get("viral_hook_text") or item.get("hook") or item.get("hook_text") or "").strip()
    title = str(item.get("video_title_for_youtube_short") or item.get("title") or item.get("video_title") or "").strip()
    why = str(item.get("why") or item.get("reason") or "").strip()

    if not title:
        title = f"Viral Moment #{index + 1}"

    if not hook_text:
        # Fallback to title or default attention hook
        hook_text = title if len(title) <= 50 else "Watch this moment 🔥"

    # Score calculation
    raw_score = item.get("predicted_score") or item.get("score")
    try:
        score = int(raw_score) if raw_score is not None else (95 - (index * 3))
        score = max(50, min(99, score))
    except (ValueError, TypeError):
        score = max(50, 95 - (index * 3))

    # Social descriptions
    tiktok_desc = str(item.get("video_description_for_tiktok") or f"{title} #shorts #viral #fyp").strip()
    insta_desc = str(item.get("video_description_for_instagram") or f"{title} #reels #viral").strip()

    source_window = str(item.get("source_window_id") or f"manual_w{index + 1}")

    return {
        "start": start_sec,
        "end": end_sec,
        "source_window_id": source_window,
        "predicted_score": score,
        "video_title_for_youtube_short": title,
        "viral_hook_text": hook_text,
        "video_description_for_tiktok": tiktok_desc,
        "video_description_for_instagram": insta_desc,
        "why": why,
        "proposed": [start_sec, end_sec],
    }


def extract_clips_from_raw_text(
    raw_text: str,
    video_duration: float = 0.0,
    min_duration: float = 8.0,
    max_duration: float = 180.0,
) -> List[Dict[str, Any]]:
    """Main extraction routine.

    Extracts, repairs, validates, and normalizes clips from any arbitrary text
    pasted by the user from external LLM chat interfaces.
    """
    if not raw_text or not raw_text.strip():
        return []

    raw_items: List[Dict[str, Any]] = []

    # 1. Attempt JSON extraction
    parsed_json = extract_json_candidate(raw_text)
    if isinstance(parsed_json, list):
        raw_items = [x for x in parsed_json if isinstance(x, dict)]
    elif isinstance(parsed_json, dict):
        # Look for standard wrapper keys (shorts, clips, moments, results, windows)
        for key in ("shorts", "clips", "moments", "results", "windows", "data"):
            val = parsed_json.get(key)
            if isinstance(val, list):
                raw_items = [x for x in val if isinstance(x, dict)]
                break
        if not raw_items and "start" in parsed_json and "end" in parsed_json:
            raw_items = [parsed_json]

    # 2. If JSON extraction produced nothing, fall back to plain-text regex parser
    if not raw_items:
        raw_items = parse_plain_text_clips(raw_text, video_duration)

    # 3. Validate and normalize each candidate
    valid_clips: List[Dict[str, Any]] = []
    for idx, item in enumerate(raw_items):
        norm = normalize_clip_item(
            item,
            index=idx,
            video_duration=video_duration,
            min_duration=min_duration,
            max_duration=max_duration,
        )
        if norm:
            valid_clips.append(norm)

    # Sort clips chronologically by start time
    valid_clips.sort(key=lambda c: c["start"])
    return valid_clips
