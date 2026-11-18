"""Resumable publishing adapter using Shortly's existing OAuth connection."""
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import httpx
import yt_oauth


class UploadProblem(ValueError):
    def __init__(self, message, uncertain=False):
        super().__init__(message)
        self.uncertain = uncertain


def check_response(response):
    if response.is_success or response.status_code == 308:
        return
    messages = {
        401: 'YouTube authorization expired. Reconnect the channel, then retry.',
        403: 'YouTube refused the request. Check channel permissions and API quota.',
        429: 'YouTube rate limit reached. Wait before retrying.',
    }
    raise UploadProblem(messages.get(response.status_code, f'YouTube request failed (HTTP {response.status_code}).'))


class YouTube:
    async def channel(self):
        channel = await yt_oauth.get_channel_info()
        if not channel or not channel.get('id'):
            raise UploadProblem('Connect your YouTube channel in Settings.')
        return channel

    async def upload(self, item, persist):
        token = await yt_oauth.get_valid_access_token()
        path = Path(item['snapshot'])
        size = path.stat().st_size
        auth = {'Authorization': f'Bearer {token}'}
        async with httpx.AsyncClient(timeout=120) as client:
            session = item.get('session_url')
            if not session:
                status = {'privacyStatus': item['privacy'], 'selfDeclaredMadeForKids': item['made_for_kids']}
                if item.get('publish_at'):
                    if datetime.fromisoformat(item['publish_at']).timestamp() <= datetime.now(timezone.utc).timestamp():
                        raise UploadProblem('The publication time has passed. Cancel this item and prepare a new schedule.')
                    status.update(privacyStatus='private', publishAt=item['publish_at'])
                response = await client.post('https://www.googleapis.com/upload/youtube/v3/videos',
                    params={'uploadType': 'resumable', 'part': 'snippet,status'},
                    headers={**auth, 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': str(size)},
                    json={'snippet': {'title': item['title'], 'description': item['description'], 'categoryId': '22', 'tags': item.get('tags', [])}, 'status': status})
                check_response(response)
                session = response.headers.get('Location')
                host = urlparse(session or '').hostname or ''
                if not session or urlparse(session).scheme != 'https' or not (host == 'googleapis.com' or host.endswith('.googleapis.com')):
                    raise UploadProblem('YouTube returned an invalid upload session.')
                persist({'session_url': session})
            # Probe even a newly created session. A completed response reconciles a
            # lost final PUT response without starting another upload.
            response = await client.put(session, headers={**auth, 'Content-Length': '0', 'Content-Range': f'bytes */{size}'}, content=b'')
            if response.status_code in (404, 410):
                raise UploadProblem('Upload session expired. Check YouTube Studio before creating another upload.', uncertain=True)
            check_response(response)
            if response.status_code in (200, 201):
                return self.completed(response, persist)
            offset = int(response.headers.get('Range', 'bytes=0--1').rsplit('-', 1)[-1]) + 1 if response.headers.get('Range') else 0
            with path.open('rb') as video:
                video.seek(offset)
                while offset < size:
                    chunk = await asyncio.to_thread(video.read, 8 * 1024 * 1024)
                    if not chunk:
                        raise UploadProblem('Approved video snapshot is incomplete.')
                    end = offset + len(chunk) - 1
                    # Record intent before network IO. Never silently start a new
                    # session after any transfer with an uncertain outcome.
                    persist({'transfer_started': True})
                    response = await client.put(session, headers={**auth, 'Content-Type': 'video/mp4',
                        'Content-Length': str(len(chunk)), 'Content-Range': f'bytes {offset}-{end}/{size}'}, content=chunk)
                    check_response(response)
                    if response.status_code in (200, 201):
                        return self.completed(response, persist)
                    confirmed = response.headers.get('Range')
                    next_offset = int(confirmed.rsplit('-', 1)[-1]) + 1 if confirmed else 0
                    if next_offset <= offset:
                        raise UploadProblem('YouTube did not confirm transfer progress. Retry to resume the same upload.')
                    offset = next_offset
                    video.seek(offset)
                    persist({'bytes_sent': offset})
            raise UploadProblem('Upload completion is unconfirmed. Retry to check the existing session.')

    @staticmethod
    def completed(response, persist):
        video_id = response.json().get('id')
        if not video_id:
            raise UploadProblem('YouTube did not return a video ID. Check YouTube Studio.', uncertain=True)
        persist({'video_id': video_id, 'status': 'processing', 'error': None})
        return video_id

    async def status(self, video_id):
        token = await yt_oauth.get_valid_access_token()
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get('https://www.googleapis.com/youtube/v3/videos',
                params={'part': 'status,processingDetails', 'id': video_id}, headers={'Authorization': f'Bearer {token}'})
            check_response(response)
            items = response.json().get('items', [])
            if not items:
                raise UploadProblem('YouTube video is unavailable. Check the connected channel and YouTube Studio.')
            item = items[0]
            status = item.get('status', {})
            processing = item.get('processingDetails', {}).get('processingStatus')
            if processing in ('failed', 'terminated') or status.get('uploadStatus') in ('failed', 'rejected', 'deleted'):
                raise UploadProblem('YouTube could not process this video. Review it in YouTube Studio.')
            if processing == 'processing' or status.get('uploadStatus') == 'uploaded':
                state = 'processing'
            elif status.get('privacyStatus') == 'public':
                state = 'published'
            elif status.get('publishAt'):
                state = 'scheduled'
            else:
                state = 'uploaded'
            return {'status': state, 'actual_privacy': status.get('privacyStatus'), 'youtube_publish_at': status.get('publishAt'), 'error': None}
