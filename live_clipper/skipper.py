"""Prepare a captured highlight for Shortly's durable publishing worker."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from pydantic import BaseModel, Field
from publishing_store import Store


def capture(item, channel, platform):
    if os.getenv('BILLING_ENABLED', '').lower() in ('1', 'true', 'yes'):
        return False
    root = Path('output/.publishing')
    if not (root / 'queue.sqlite3').exists():
        return False
    store = Store(root)
    settings = store.settings()
    if not settings.get('skipper'):
        return False
    store.add(dict(clip_key=f'live:{item.session_id}:{item.id}', digest=item.id,
                   channel_id=settings['skipper_channel'], channel_name=settings['skipper_name'],
                   captionLook=settings.get('skipper_look'), source=item.clip_path, live_source=channel, platform=platform,
                   session=item.session_id, start=item.start_t, end=item.end_t, score=item.score,
                   title=f'Highlight from {channel}', description='', privacy='public',
                   made_for_kids=False, publish_at=None, duration=item.duration,
                   snapshot=None), initial_status='editing')
    return True


def render(item, root):
    from main import transcribe_video, auto_caption_clip, apply_brand_frame
    folder = root / 'live' / item['id']
    folder.mkdir(parents=True, exist_ok=True)
    vertical = folder / 'vertical.mp4'
    # Preserve the entire detected time window and center-crop portrait video.
    subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', item['source'],
                    '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1',
                    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(vertical)], check=True)
    transcript = transcribe_video(str(vertical))
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
    tags: list[str] = Field(max_length=12)


def metadata(item):
    import llm_backend
    from main import _run_gemini_stage, genai
    prompt = 'Write factual YouTube Shorts metadata. Return title, description and tags from this source material: ' + json.dumps([item['live_source'], item['transcript'][:18000]])
    if llm_backend.active():
        data, _ = llm_backend.generate_json(prompt, Metadata)
    else:
        client = genai.Client(api_key=os.environ.get('GEMINI_API_KEY'))
        data, _ = _run_gemini_stage(client, os.getenv('GEMINI_MODEL') or 'gemini-3.1-flash-lite', prompt, Metadata)
    return Metadata.model_validate(data).model_dump()
