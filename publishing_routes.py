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
                patch = await asyncio.to_thread(skipper.metadata, item)
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
            store.progress(item['id'], lease, {'status': 'attention', 'failed_stage': item['status'], 'error': str(exc) if isinstance(exc, (UploadProblem, FileNotFoundError)) else f'{item["status"].capitalize()} failed ({type(exc).__name__}). Clip skipped.', 'uncertain': bool(getattr(exc, 'uncertain', False))}, done=True)
        finally:
            pulse.cancel()

    @router.get('')
    async def overview(request: Request):
        await guard(request)
        import yt_oauth
        tokens = yt_oauth.load_tokens() or {}
        clips = [{k: v for k, v in c.items() if not k.startswith('_')} for c in list_clips()]
        return {'items': [public(i) for i in store.list()], 'clips': clips, 'settings': store.settings(), 'channel': tokens.get('channel'), 'n8n_token_configured': bool(os.environ.get('SHORTLY_PUBLISHING_TOKEN'))}

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
        item = store.add({'clip_key': body.clip_id, 'channel_id': channel['id'], 'channel_name': channel['title'], 'digest': digest, 'snapshot': str(snapshot), 'title': clip['name'][:100], 'description': '', 'privacy': 'private', 'made_for_kids': False, 'publish_at': None})
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
        settings = store.settings()
        import yt_oauth
        return {'channel': (yt_oauth.load_tokens() or {}).get('channel'), 'settings': settings, 'items': [
            {k: i.get(k) for k in ('id','clip_key','title','status','error','video_id')}
            for i in store.list() if i['clip_key'].startswith('live:')]}

    @router.put('/skipper')
    async def skipper_mode(request: Request):
        await guard(request)
        body = await request.json()
        enabled = body.get('enabled')
        if not isinstance(enabled, bool):
            raise HTTPException(400, 'Select Auto or Manual')
        patch = {'skipper': enabled}
        if enabled:
            channel = await youtube.channel()
            from caption_looks import Look
            from pydantic import ValidationError
            try:
                patch['skipper_look'] = Look.model_validate(body.get('look', store.settings().get('skipper_look', {}))).model_dump()
            except ValidationError as exc:
                raise HTTPException(422, 'Invalid caption settings') from exc
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
