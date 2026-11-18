"""Local publishing API. n8n triggers work; Shortly owns upload state."""
import asyncio
import hashlib
import os
import secrets
import shutil
import time
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from publishing_store import Store, Conflict
from publishing_youtube import YouTube, UploadProblem


def install(app, output_dir, list_clips):
    router = APIRouter(prefix='/api/publishing')
    store = Store(Path(output_dir) / '.publishing')
    youtube = YouTube()
    tasks = set()

    async def guard(request: Request):
        expected = os.environ.get('SHORTLY_PUBLISHING_TOKEN', '')
        supplied = request.headers.get('authorization', '').removeprefix('Bearer ')
        if expected and secrets.compare_digest(supplied, expected):
            return
        origin = request.headers.get('origin')
        allowed = ('http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:8000', 'http://127.0.0.1:8000')
        if not request.client or request.client.host not in ('127.0.0.1', '::1', 'testclient') or (origin and origin not in allowed):
            raise HTTPException(403, 'Local access or publishing bearer token required')

    def public(item):
        return {**{k: v for k, v in item.items() if k not in ('session_url', 'snapshot', 'source', 'transcript')}, 'preview_ready': bool(item.get('snapshot'))}

    async def worker(item, lease):
        async def heartbeat():
            while True:
                await asyncio.sleep(30)
                if not store.renew(item['id'], lease):
                    return
        pulse = asyncio.create_task(heartbeat())
        def persist(patch):
            return store.progress(item['id'], lease, patch)
        try:
            if item['status'] == 'editing':
                from live_clipper import skipper
                patch = await asyncio.to_thread(skipper.render, item, store.root)
                store.progress(item['id'], lease, patch, done=True)
                return
            if item['status'] == 'metadata':
                from live_clipper import skipper
                try:
                    patch = await asyncio.to_thread(skipper.metadata, item)
                except Exception as meta_exc:
                    import logging
                    import traceback
                    logging.getLogger('publishing').error('Metadata generation failed: %s\n%s', meta_exc, traceback.format_exc())
                    patch = skipper.fallback_metadata(item)
                store.progress(item['id'], lease, {**patch, 'status': 'queued'}, done=True)
                return
            channel = await youtube.channel()
            if channel['id'] != item['channel_id']:
                raise UploadProblem('Connected channel differs from the approved destination.')
            if not item.get('video_id'):
                digest = await asyncio.to_thread(lambda: hashlib.sha256(Path(item['snapshot']).read_bytes()).hexdigest())
                if digest != item.get('rendered_digest', item['digest']):
                    raise UploadProblem('Approved video changed. Prepare a new draft.')
                video_id = await youtube.upload(item, persist)
            else:
                video_id = item['video_id']
            result = await youtube.status(video_id)
            store.progress(item['id'], lease, result, done=True)
        except Exception as exc:
            import logging
            import traceback
            tb = traceback.format_exc()
            logging.getLogger('publishing').error('Publishing worker failed in stage %s: %s\n%s', item.get('status'), exc, tb)
            err_msg = str(exc) if isinstance(exc, (UploadProblem, FileNotFoundError)) else f'{item["status"].capitalize()} failed ({type(exc).__name__}: {exc}). Clip skipped.\n{tb}'
            store.progress(item['id'], lease, {'status': 'attention', 'failed_stage': item['status'], 'error': err_msg, 'uncertain': bool(getattr(exc, 'uncertain', False))}, done=True)
        finally:
            pulse.cancel()

    @router.get('')
    async def overview(request: Request):
        await guard(request)
        import yt_oauth
        from live_clipper.skipper import configured_metadata_override
        tokens = yt_oauth.load_tokens() or {}
        clips = [{k: v for k, v in c.items() if not k.startswith('_')} for c in list_clips()]
        return {
            'items': [public(i) for i in store.list()],
            'clips': clips,
            'settings': store.settings(),
            'defaults': configured_metadata_override(),
            'channel': tokens.get('channel'),
            'n8n_token_configured': bool(os.environ.get('SHORTLY_PUBLISHING_TOKEN')),
        }

    def _resolve_clip_source(clip_id: str | None, job_id: str | None = None, filename: str | None = None) -> tuple[str, Path, str]:
        """Resolve a Studio or History clip to (canonical_key, Path, fallback_name)."""
        out_root = Path(output_dir).resolve()
        # 1. Match Studio clip via list_clips() (e.g. "<job_id>:<index>")
        if clip_id:
            clip = next((c for c in list_clips() if c['id'] == clip_id), None)
            if clip:
                src = Path(clip['_path']).resolve()
                if not src.is_relative_to(out_root) or not src.is_file():
                    raise HTTPException(400, 'Invalid or missing clip path')
                return clip_id, src, clip.get('name') or src.stem

        # 2. Match explicit job_id + filename under OUTPUT_DIR (e.g. subtitled/hooked clip in Studio)
        if job_id and filename:
            safe_job = Path(job_id).name
            safe_file = Path(filename).name
            candidate = (out_root / safe_job / safe_file).resolve()
            if candidate.is_relative_to(out_root) and candidate.is_file():
                return clip_id or f"{safe_job}:{safe_file}", candidate, candidate.stem

        # 3. Match Live Clipper clip from History ("live:<uuid>")
        if clip_id and clip_id.startswith('live:'):
            raw_id = clip_id.split(':', 1)[1]
            try:
                from live_clipper.queue import global_queue
                q_item = global_queue.get_item(raw_id)
                if q_item and q_item.clip_path:
                    src = Path(q_item.clip_path).resolve()
                    live_root = Path(os.environ.get('LIVE_SESSIONS_DIR', str(out_root / 'live_sessions'))).resolve()
                    if src.is_file() and (src.is_relative_to(out_root) or src.is_relative_to(live_root)):
                        return clip_id, src, src.stem
            except Exception:
                pass

        raise HTTPException(404, f'Clip not found on disk: {clip_id or filename or "unknown"}')

    async def _run_direct_uploads(item_ids: list[str]):
        """Upload newly pushed clips straight to YouTube sequentially."""
        for iid in item_ids:
            claimed = store.claim_item(iid)
            if not claimed:
                continue
            await worker(*claimed)

    class DirectPushItem(BaseModel):
        clip_id: str | None = None
        job_id: str | None = None
        filename: str | None = None
        title: str = Field(min_length=1, max_length=100)
        description: str = Field(default='', max_length=5000)
        tags: list[str] = Field(default_factory=list, max_length=50)
        privacy: str = Field(default='public', pattern='^(private|unlisted|public)$')
        made_for_kids: bool = False
        publish_at: str | None = None

    class DirectPushRequest(BaseModel):
        items: list[DirectPushItem] = Field(min_length=1, max_length=30)
        auto_start: bool = True

    @router.post('/push')
    async def direct_push(body: DirectPushRequest, request: Request):
        """Queue and immediately upload one or more clips directly to YouTube (no Live Clipper pipeline)."""
        await guard(request)
        channel = await youtube.channel()
        created = []
        created_ids = []

        for entry in body.items:
            if entry.publish_at:
                from datetime import datetime
                dt = datetime.fromisoformat(entry.publish_at.replace('Z', '+00:00'))
                if dt.tzinfo is None or dt.timestamp() < time.time() + 120 or entry.privacy != 'public':
                    raise HTTPException(400, 'Schedule public videos at least two minutes ahead, including timezone')

            canon_key, source, _fallback = _resolve_clip_source(entry.clip_id, entry.job_id, entry.filename)
            digest = await asyncio.to_thread(lambda p=source: hashlib.sha256(p.read_bytes()).hexdigest())
            snapshot = store.root / f'{digest}.mp4'
            if not snapshot.exists():
                temporary = store.root / f'{digest}.{secrets.token_hex(6)}.tmp'
                await asyncio.to_thread(shutil.copyfile, source, temporary)
                copied_digest = await asyncio.to_thread(lambda p=temporary: hashlib.sha256(p.read_bytes()).hexdigest())
                if copied_digest != digest:
                    temporary.unlink(missing_ok=True)
                    raise HTTPException(409, 'Video changed during preparation. Try again after rendering finishes.')
                os.replace(temporary, snapshot)

            clean_tags = [t.strip() for t in (entry.tags or []) if isinstance(t, str) and t.strip()][:50]
            item = store.add({
                'clip_key': f'direct:{canon_key}:{secrets.token_hex(4)}',
                'source_clip_id': canon_key,
                'channel_id': channel['id'],
                'channel_name': channel['title'],
                'digest': digest,
                'snapshot': str(snapshot),
                'title': entry.title.strip()[:100],
                'description': (entry.description or '')[:5000],
                'tags': clean_tags,
                'privacy': entry.privacy,
                'made_for_kids': bool(entry.made_for_kids),
                'publish_at': entry.publish_at,
                'custom_metadata': True,
                'direct_push': True,
            }, initial_status='queued')
            created.append(public(item))
            created_ids.append(item['id'])

        if body.auto_start and created_ids:
            task = asyncio.create_task(_run_direct_uploads(created_ids))
            tasks.add(task)
            task.add_done_callback(tasks.discard)

        return {'ok': True, 'count': len(created), 'items': created}

    class Draft(BaseModel):
        clip_id: str

    @router.post('/items')
    async def draft(body: Draft, request: Request):
        await guard(request)
        clip = next((c for c in list_clips() if c['id'] == body.clip_id), None)
        if not clip:
            raise HTTPException(404, 'Rendered clip no longer exists')
        channel = await youtube.channel()
        source = Path(clip['_path']).resolve()
        if not source.is_relative_to(Path(output_dir).resolve()):
            raise HTTPException(400, 'Invalid clip path')
        digest = await asyncio.to_thread(lambda: hashlib.sha256(source.read_bytes()).hexdigest())
        snapshot = store.root / f'{digest}.mp4'
        if not snapshot.exists():
            temporary = store.root / f'{digest}.{secrets.token_hex(6)}.tmp'
            await asyncio.to_thread(shutil.copyfile, source, temporary)
            copied_digest = await asyncio.to_thread(lambda: hashlib.sha256(temporary.read_bytes()).hexdigest())
            if copied_digest != digest:
                temporary.unlink(missing_ok=True)
                raise HTTPException(409, 'Video changed during preparation. Try again after rendering finishes.')
            os.replace(temporary, snapshot)
        from live_clipper.skipper import configured_metadata_override
        override = configured_metadata_override()
        item = store.add({
            'clip_key': body.clip_id,
            'channel_id': channel['id'],
            'channel_name': channel['title'],
            'digest': digest,
            'snapshot': str(snapshot),
            'title': override.get('title') or clip['name'][:100],
            'description': override.get('description', ''),
            'tags': override.get('tags', []),
            'privacy': 'private',
            'made_for_kids': False,
            'publish_at': None,
        })
        return public(item)

    class Edit(BaseModel):
        revision: int
        title: str = Field(min_length=1, max_length=100)
        description: str = Field(default='', max_length=5000)
        privacy: str = Field(default='private', pattern='^(private|unlisted|public)$')
        made_for_kids: bool = False
        publish_at: str | None = None

    @router.patch('/items/{item_id}')
    async def edit(item_id: str, body: Edit, request: Request):
        await guard(request)
        if body.publish_at:
            from datetime import datetime
            date = datetime.fromisoformat(body.publish_at.replace('Z', '+00:00'))
            if date.tzinfo is None or date.timestamp() < time.time() + 120 or body.privacy != 'public':
                raise HTTPException(400, 'Schedule public videos at least two minutes ahead, including timezone')
        return public(store.edit(item_id, body.revision, ('draft',), body.model_dump(exclude={'revision'})))

    class Revision(BaseModel):
        revision: int

    @router.post('/items/{item_id}/{action}')
    async def action(item_id: str, action: str, body: Revision, request: Request):
        await guard(request)
        item = store.get(item_id)
        if action == 'approve':
            channel = await youtube.channel()
            if channel['id'] != item['channel_id']:
                raise HTTPException(409, 'Reconnect the destination channel before approval')
            patch, allowed = {'status': 'queued'}, ('draft',)
        elif action == 'cancel':
            patch, allowed = {'status': 'cancelled'}, ('draft', 'queued', 'attention')
        elif action == 'retry':
            if item.get('uncertain'):
                raise HTTPException(409, 'Check YouTube Studio. Automatic retry could duplicate this video.')
            patch, allowed = {'status': 'processing' if item.get('video_id') else item.get('failed_stage', 'queued'), 'error': None}, ('attention',)
        else:
            raise HTTPException(404, 'Unknown action')
        return public(store.edit(item_id, body.revision, allowed, patch))

    @router.get('/skipper')
    async def skipper_status(request: Request):
        await guard(request)
        from live_clipper.skipper import DEFAULT_LAYOUT, VALID_LAYOUTS
        import camera_inset
        settings = store.settings()
        if settings.get('skipper_layout') not in VALID_LAYOUTS:
            settings = {**settings, 'skipper_layout': DEFAULT_LAYOUT}
        settings = {
            **settings,
            'skipper_mirror': bool(settings.get('skipper_mirror', False)),
            'skipper_webcam_mode': camera_inset.normalize_webcam_mode(settings.get('skipper_webcam_mode')),
            'skipper_webcam_box': camera_inset.parse_webcam_box(settings.get('skipper_webcam_box')),
        }
        import yt_oauth
        return {'channel': (yt_oauth.load_tokens() or {}).get('channel'), 'settings': settings, 'items': [
            {k: i.get(k) for k in ('id','clip_key','title','status','error','video_id','layout','mirror_video','webcam_mode')}
            for i in store.list() if i['clip_key'].startswith('live:')]}

    @router.put('/skipper')
    async def skipper_mode(request: Request):
        await guard(request)
        from live_clipper.skipper import DEFAULT_LAYOUT, VALID_LAYOUTS
        import camera_inset
        body = await request.json()
        enabled = body.get('enabled')
        layout = body.get('layout')
        mirror = body.get('mirror')
        webcam_mode = body.get('webcam_mode')
        has_webcam_box = 'webcam_box' in body
        webcam_box = body.get('webcam_box')
        if layout is not None and layout not in VALID_LAYOUTS:
            raise HTTPException(422, 'Invalid layout mode')
        if mirror is not None and not isinstance(mirror, bool):
            raise HTTPException(422, 'mirror must be true or false')
        if webcam_mode is not None and str(webcam_mode).strip().lower() not in camera_inset.VALID_WEBCAM_MODES:
            raise HTTPException(422, 'Invalid webcam_mode')
        parsed_wc_box = None
        if has_webcam_box and webcam_box is not None:
            parsed_wc_box = camera_inset.parse_webcam_box(webcam_box)
            if parsed_wc_box is None:
                raise HTTPException(422, 'Invalid webcam_box coordinates')
        if enabled is None and (layout is not None or mirror is not None or webcam_mode is not None or has_webcam_box):
            quick_patch = {}
            if layout is not None:
                quick_patch['skipper_layout'] = layout
            if mirror is not None:
                quick_patch['skipper_mirror'] = mirror
            if webcam_mode is not None:
                quick_patch['skipper_webcam_mode'] = camera_inset.normalize_webcam_mode(webcam_mode)
            if has_webcam_box:
                quick_patch['skipper_webcam_box'] = parsed_wc_box
            return store.configure(quick_patch)
        if not isinstance(enabled, bool):
            raise HTTPException(400, 'Select Auto or Manual')
        patch = {'skipper': enabled}
        if layout is not None:
            patch['skipper_layout'] = layout
        if mirror is not None:
            patch['skipper_mirror'] = mirror
        if webcam_mode is not None:
            patch['skipper_webcam_mode'] = camera_inset.normalize_webcam_mode(webcam_mode)
        if has_webcam_box:
            patch['skipper_webcam_box'] = parsed_wc_box
        if enabled:
            channel = await youtube.channel()
            from caption_looks import Look
            from pydantic import ValidationError
            try:
                patch['skipper_look'] = Look.model_validate(body.get('look', store.settings().get('skipper_look', {}))).model_dump()
            except ValidationError as exc:
                raise HTTPException(422, 'Invalid caption settings') from exc
            if 'skipper_layout' not in patch:
                saved_layout = store.settings().get('skipper_layout')
                patch['skipper_layout'] = saved_layout if saved_layout in VALID_LAYOUTS else DEFAULT_LAYOUT
            patch.update(skipper_channel=channel['id'], skipper_name=channel['title'])
        return store.configure(patch)

    @router.put('/settings')
    async def settings(request: Request):
        await guard(request)
        body = await request.json()
        if not isinstance(body.get('paused'), bool):
            raise HTTPException(400, 'paused must be true or false')
        return store.configure({'paused': body['paused']})

    @router.post('/tick')
    async def tick(request: Request):
        await guard(request)
        store.configure({'last_contact': time.time()})
        claimed = store.claim()
        if not claimed:
            return {'started': False, 'paused': store.settings()['paused']}
        task = asyncio.create_task(worker(*claimed))
        tasks.add(task)
        task.add_done_callback(tasks.discard)
        return {'started': True, 'item_id': claimed[0]['id']}

    @router.get('/items/{item_id}/preview')
    async def preview(item_id: str, request: Request):
        await guard(request)
        snapshot = store.get(item_id).get('snapshot')
        if not snapshot or not Path(snapshot).is_file():
            raise HTTPException(404, 'Rendered video unavailable')
        return FileResponse(snapshot, media_type='video/mp4')

    @app.exception_handler(Conflict)
    async def conflict_handler(request, exc):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=409, content={'detail': str(exc)})

    app.include_router(router)
    return store
