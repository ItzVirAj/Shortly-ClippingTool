import concurrent.futures
import pytest
from publishing_store import Store, Conflict


def draft(store):
    return store.add({'clip_key': 'job:0', 'channel_id': 'channel', 'digest': 'hash', 'title': 'Clip'})


def test_restart_and_duplicate(tmp_path):
    first = draft(Store(tmp_path))
    second = draft(Store(tmp_path))
    assert first['id'] == second['id']
    assert len(Store(tmp_path).list()) == 1


def test_pause_and_concurrent_claims(tmp_path):
    store = Store(tmp_path)
    item = draft(store)
    store.edit(item['id'], item['revision'], ('draft',), {'status': 'queued'})
    assert store.claim() is None
    store.configure({'paused': False})
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        claims = list(pool.map(lambda _: Store(tmp_path).claim(), range(4)))
    assert sum(c is not None for c in claims) == 1


def test_revision_and_lease(tmp_path):
    store = Store(tmp_path)
    item = draft(store)
    queued = store.edit(item['id'], 1, ('draft',), {'status': 'queued'})
    with pytest.raises(Conflict):
        store.edit(item['id'], 1, ('queued',), {'status': 'cancelled'})
    store.configure({'paused': False})
    claimed, lease = store.claim()
    assert claimed['status'] == 'uploading'
    with pytest.raises(Conflict):
        store.progress(item['id'], 'wrong', {'status': 'published'})
    store.progress(item['id'], lease, {'status': 'processing', 'video_id': 'youtube'}, done=True)
    assert Store(tmp_path).get(item['id'])['video_id'] == 'youtube'


def test_api_freezes_latest_export_and_approves(tmp_path, monkeypatch):
    import asyncio
    import httpx
    from fastapi import FastAPI
    from publishing_routes import install
    from publishing_youtube import YouTube
    async def channel(self):
        return {'id': 'channel', 'title': 'Test channel'}
    monkeypatch.setattr(YouTube, 'channel', channel)
    monkeypatch.setenv('SHORTLY_PUBLISHING_TOKEN', 'test-secret')
    source = tmp_path / 'latest.mp4'
    source.write_bytes(b'frame-and-text-export')
    app = FastAPI()
    store = install(app, tmp_path, lambda: [{'id': 'job:0', '_path': str(source), 'name': 'Latest clip'}])
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            assert (await client.get('/api/publishing', headers={'Origin': 'https://other-site.example'})).status_code == 403
            client.headers['Authorization'] = 'Bearer test-secret'
            item = (await client.post('/api/publishing/items', json={'clip_id': 'job:0'})).json()
            assert 'snapshot' not in item
            source.write_bytes(b'new-edit')
            preview = await client.get(f"/api/publishing/items/{item['id']}/preview")
            assert preview.content == b'frame-and-text-export'
            approved = await client.post(f"/api/publishing/items/{item['id']}/approve", json={'revision': item['revision']})
            assert approved.json()['status'] == 'queued'
            assert store.claim() is None  # paused by default
            duplicate = await client.post(f"/api/publishing/items/{item['id']}/approve", json={'revision': item['revision']})
            assert duplicate.status_code == 409
    asyncio.run(run())


def test_youtube_reconciles_completed_session_without_reupload(tmp_path, monkeypatch):
    import asyncio
    import httpx
    import publishing_youtube as module
    source = tmp_path / 'video.mp4'
    source.write_bytes(b'video')
    calls = []
    real_client = httpx.AsyncClient
    def respond(request):
        calls.append(request)
        assert request.method == 'PUT'
        assert request.headers['content-range'] == 'bytes */5'
        assert request.content == b''
        return httpx.Response(200, json={'id': 'existing-video'})
    monkeypatch.setattr(module.httpx, 'AsyncClient', lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs))
    async def token():
        return 'oauth'
    monkeypatch.setattr(module.yt_oauth, 'get_valid_access_token', token)
    updates = []
    result = asyncio.run(module.YouTube().upload({'snapshot': str(source), 'session_url': 'https://www.googleapis.com/session'}, updates.append))
    assert result == 'existing-video'
    assert updates[-1]['status'] == 'processing'
    assert len(calls) == 1


def test_skipper_render_error_skips_to_next_clip(tmp_path):
    store = Store(tmp_path)
    store.configure({'skipper': True})
    def add(key):
        return store.add({'clip_key': key, 'channel_id': 'ch', 'digest': key}, initial_status='editing')
    add('live:session:one')
    add('live:session:two')
    item, lease = store.claim()
    store.progress(item['id'], lease, {'status': 'attention', 'error': 'Caption burn failed'}, done=True)
    store.configure({'skipper': False})  # already accepted captures still finish
    next_item, _ = Store(tmp_path).claim()
    assert next_item['id'] != item['id']
    assert store.get(item['id'])['error'] == 'Caption burn failed'


def test_n8n_tick_handles_render_failure_and_continues(tmp_path, monkeypatch):
    import asyncio
    import httpx
    from fastapi import FastAPI
    from live_clipper import skipper
    from publishing_routes import install

    monkeypatch.setenv('SHORTLY_PUBLISHING_TOKEN', 'local-test')
    app = FastAPI()
    store = install(app, tmp_path, lambda: [])
    def render(item, root):
        if item['digest'] == 'first':
            raise ValueError('Missing speech')
        return {'status': 'metadata', 'snapshot': 'rendered.mp4'}
    monkeypatch.setattr(skipper, 'render', render)
    items = [store.add({'clip_key': f'live:{key}', 'digest': key, 'channel_id': 'ch'},
                       initial_status='editing') for key in ('first', 'second')]

    async def tick_twice():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test',
                                     headers={'Authorization': 'Bearer local-test'}) as client:
            for item in items:
                response = await client.post('/api/publishing/tick')
                assert response.json()['item_id'] == item['id']
                for _ in range(100):
                    if store.get(item['id'])['status'] != 'editing':
                        break
                    await asyncio.sleep(.01)
    asyncio.run(tick_twice())
    assert store.get(items[0]['id'])['failed_stage'] == 'editing'
    assert store.get(items[0]['id'])['status'] == 'attention'
    assert store.get(items[1]['id'])['status'] == 'metadata'
