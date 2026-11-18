"""Prepare a captured highlight for Shortly's durable publishing worker."""
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import subprocess
import traceback
from pydantic import BaseModel, Field
from publishing_store import Store

logger = logging.getLogger("live_clipper.skipper")

DEFAULT_LAYOUT = 'streamer_bottom'
VALID_LAYOUTS = ('streamer_bottom', 'blurred_center')


def _publishing_root() -> Path:
    explicit = os.environ.get('PUBLISHING_DIR')
    if explicit:
        return Path(explicit)
    out = os.environ.get('OUTPUT_DIR')
    if out:
        return Path(out) / '.publishing'
    return Path('output/.publishing')


def configured_metadata_override() -> dict:
    """Optional fixed title, description hashtags, and YouTube tags from .env."""
    out = {}
    title = (os.environ.get('DEFAULT_VIDEO_TITLE') or '').strip()
    hashtags = (os.environ.get('DEFAULT_VIDEO_HASHTAGS') or '').strip()
    raw_tags = (os.environ.get('DEFAULT_VIDEO_TAGS') or '').strip()
    if title:
        out['title'] = title[:100]
    if hashtags:
        out['description'] = hashtags[:5000]
    if raw_tags:
        tags = [t.strip() for t in raw_tags.split(',') if t.strip()]
        if tags:
            out['tags'] = tags[:50]
    return out


def capture(item, channel, platform):
    if os.getenv('BILLING_ENABLED', '').lower() in ('1', 'true', 'yes'):
        return False
    root = _publishing_root()
    if not (root / 'queue.sqlite3').exists():
        return False
    store = Store(root)
    settings = store.settings()
    if not settings.get('skipper'):
        return False
    layout = settings.get('skipper_layout') or DEFAULT_LAYOUT
    if layout not in VALID_LAYOUTS:
        layout = DEFAULT_LAYOUT
    mirror_video = bool(getattr(item, 'mirror_video', False)) or bool(settings.get('skipper_mirror', False))
    item_wc_mode = getattr(item, 'webcam_mode', None) or 'auto'
    item_wc_box = getattr(item, 'webcam_box', None)
    if item_wc_mode != 'auto' or item_wc_box:
        webcam_mode = item_wc_mode
        webcam_box = item_wc_box
    else:
        webcam_mode = settings.get('skipper_webcam_mode') or 'auto'
        webcam_box = settings.get('skipper_webcam_box')
    override = configured_metadata_override()
    store.add(dict(clip_key=f'live:{item.session_id}:{item.id}', digest=item.id,
                   channel_id=settings['skipper_channel'], channel_name=settings['skipper_name'],
                   captionLook=settings.get('skipper_look'), layout=layout,
                   mirror_video=mirror_video,
                   webcam_mode=webcam_mode, webcam_box=webcam_box,
                   source=item.clip_path, live_source=channel, platform=platform,
                   session=item.session_id, start=item.start_t, end=item.end_t, score=item.score,
                   title=override.get('title') or f'Highlight from {channel}',
                   description=override.get('description', ''),
                   tags=override.get('tags', []),
                   privacy='public',
                   made_for_kids=False, publish_at=None, duration=item.duration,
                   snapshot=None), initial_status='editing')
    return True


def _probe_video_size(video_path):
    """Return (width, height) of the primary video stream."""
    out = subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', str(video_path),
    ], text=True).strip()
    w, h = out.split('x')
    return int(w), int(h)


def build_vertical_filter(orig_w, orig_h, layout=DEFAULT_LAYOUT, box=None, mirror=False):
    """Return (filter_flag, filter_expr, map_args) for 1080x1920 vertical rendering.

    Layouts:
    - ``streamer_bottom`` (default): Full stream/gameplay on the top half (1080x960)
      and detected speaker/streamer cam on the bottom half (1080x960).
    - ``blurred_center``: Full uncropped video centered in the middle over a blurred
      9:16 copy of the video behind it.

    When ``mirror=True``, appends ``hflip`` to the video stream before Whisper
    transcription and subtitle burning so captions and brand frames are never mirrored.
    """
    out_w, out_h = 1080, 1920
    chosen = layout if layout in VALID_LAYOUTS else DEFAULT_LAYOUT

    def _apply_mirror_graph(graph: str) -> str:
        if not mirror:
            return graph
        if graph.endswith('[v]'):
            return graph[:-3] + ',hflip[v]'
        return graph + ';[v]hflip[v]'

    if chosen == 'blurred_center':
        from reframe_v2 import general_filtergraph, full_width_content_height
        content_h = full_width_content_height(orig_w, orig_h, out_w)
        graph = general_filtergraph(out_w, out_h, content_h=content_h, orig_w=orig_w, orig_h=orig_h)
        return '-filter_complex', _apply_mirror_graph(graph), ['-map', '[v]', '-map', '0:a?']

    # Default: streamer_bottom (full screen above half, speaker/streamer cam below)
    if orig_w > orig_h:
        import camera_inset
        graph = camera_inset.streamer_split_filtergraph(
            orig_w, orig_h, out_w, out_h, box=box, orientation='streamer_bottom', divider=True
        )
        return '-filter_complex', _apply_mirror_graph(graph), ['-map', '[v]', '-map', '0:a?']

    # Source is already portrait: preserve with clean 9:16 fit
    vf = f'scale={out_w}:{out_h}:force_original_aspect_ratio=increase,crop={out_w}:{out_h},setsar=1'
    if mirror:
        vf += ',hflip'
    return '-vf', vf, []


def render(item, root):
    from main import transcribe_video, auto_caption_clip, apply_brand_frame
    folder = root / 'live' / item['id']
    folder.mkdir(parents=True, exist_ok=True)
    vertical = folder / 'vertical.mp4'
    layout = item.get('layout') or DEFAULT_LAYOUT
    if layout not in VALID_LAYOUTS:
        layout = DEFAULT_LAYOUT

    orig_w, orig_h = _probe_video_size(item['source'])
    box = None
    effective_layout = layout
    if layout == 'streamer_bottom' and orig_w > orig_h:
        import camera_inset
        webcam_mode = camera_inset.normalize_webcam_mode(item.get('webcam_mode') or 'auto')
        webcam_box = camera_inset.parse_webcam_box(item.get('webcam_box'))
        if webcam_mode == 'none':
            effective_layout = 'blurred_center'
        else:
            try:
                box = camera_inset.resolve_webcam_box(
                    item['source'], orig_w, orig_h,
                    webcam_mode=webcam_mode, webcam_box=webcam_box,
                )
            except Exception as exc:
                logger.warning("Streamer webcam resolution failed (%s); falling back to blurred center.", exc)
                box = None
            if box is None:
                logger.info("No stationary corner webcam found (mode=%s); rendering blurred_center instead.", webcam_mode)
                effective_layout = 'blurred_center'

    mirror = bool(item.get('mirror_video', False))
    filter_flag, filter_expr, map_args = build_vertical_filter(
        orig_w, orig_h, layout=effective_layout, box=box, mirror=mirror
    )
    subprocess.run([
        'ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', item['source'],
        filter_flag, filter_expr, *map_args,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(vertical),
    ], check=True)
    audio_stream = subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
        'stream=index', '-of', 'csv=p=0', str(vertical)], text=True).strip()
    transcript = transcribe_video(str(vertical)) if audio_stream else {'segments': [], 'language': 'und'}
    from caption_looks import Look, composite
    from recut import transcript_words
    words = transcript_words(transcript)
    captioned = str(vertical)
    if item.get('captionLook'):
        target = folder / 'captioned.mp4'
        if composite(vertical, target, words, Look.model_validate(item['captionLook']), []):
            captioned = str(target)
    elif words:
        captioned = auto_caption_clip(str(vertical), transcript, 0, item['duration'])
        if not captioned:
            raise ValueError('Default caption render failed.')
    final = folder / 'final.mp4'
    if not apply_brand_frame(captioned, str(final), item['platform']):
        raise ValueError('Brand frame render failed.')
    text = ' '.join(s['text'] for s in transcript['segments'])
    (folder / 'transcript.json').write_text(json.dumps(transcript), encoding='utf-8')
    return dict(status='metadata', snapshot=str(final), rendered_digest=hashlib.sha256(final.read_bytes()).hexdigest(), transcript=text)


class Metadata(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(max_length=5000)
    tags: list[str] = Field(max_length=50)


def fallback_metadata(item):
    """Build fallback title and 1-sentence description from clip transcript (at most 70 chars for title)."""
    override = configured_metadata_override()
    raw_transcript = (item.get('transcript') or '').strip()
    sentence = ""
    if raw_transcript:
        chunks = re.split(r'(?<=[.!?])\s+|\n+', raw_transcript)
        for c in chunks:
            clean = c.strip()
            if clean:
                sentence = clean
                break
        if not sentence:
            sentence = raw_transcript

    if not sentence:
        sentence = item.get('title') or f"Highlight from {item.get('live_source') or 'stream'}"

    # Title: first clear sentence, at most 70 characters
    title = sentence
    if len(title) > 70:
        truncated = title[:70].rsplit(' ', 1)[0].strip()
        title = truncated if len(truncated) >= 10 else title[:70].strip()

    title = title or "Highlight"

    # Description: one-sentence description built from the clip's own transcript
    description = sentence
    if description and not description.endswith(('.', '!', '?')):
        description += '.'

    tags = [t for t in [item.get('live_source'), item.get('platform'), 'shorts'] if t]
    result = {
        'title': title[:100],
        'description': description[:5000],
        'tags': tags[:50],
    }
    result.update(override)
    return result


def metadata(item):
    override = configured_metadata_override()
    if override.get('title') and ('description' in override or 'tags' in override):
        return {
            'title': override['title'],
            'description': override.get('description', ''),
            'tags': override.get('tags', []),
        }

    import llm_backend
    prompt = 'Write factual YouTube Shorts metadata. Return title, description and tags from this source material: ' + json.dumps([item.get('live_source', ''), (item.get('transcript') or '')[:18000]])

    if llm_backend.active():
        try:
            data, _ = llm_backend.generate_json(prompt, Metadata)
            out = Metadata.model_validate(data).model_dump()
            out.update(override)
            return out
        except Exception as exc:
            logger.error("Metadata generation via llm_backend failed: %s\n%s", exc, traceback.format_exc())
            return fallback_metadata(item)

    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        logger.info("No GEMINI_API_KEY configured; using transcript fallback for metadata.")
        return fallback_metadata(item)

    try:
        from main import _run_gemini_stage, genai
        client = genai.Client(api_key=api_key)
        data, _ = _run_gemini_stage(client, os.getenv('GEMINI_MODEL') or 'gemini-3.1-flash-lite', prompt, Metadata)
        out = Metadata.model_validate(data).model_dump()
        out.update(override)
        return out
    except Exception as exc:
        logger.error("Metadata generation via Gemini failed: %s\n%s", exc, traceback.format_exc())
        return fallback_metadata(item)
