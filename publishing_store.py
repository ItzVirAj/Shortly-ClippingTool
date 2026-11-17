"""Disk-backed local publishing records. No OAuth credentials are stored here."""
import contextlib
import json
import sqlite3
import time
import uuid
from pathlib import Path


class Conflict(ValueError):
    pass


class Store:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / 'queue.sqlite3'
        with self.connect() as db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY, clip_key TEXT, channel_id TEXT, digest TEXT,
                    status TEXT, revision INTEGER, payload TEXT,
                    lease TEXT, lease_until REAL DEFAULT 0, next_check REAL DEFAULT 0,
                    created REAL, UNIQUE(clip_key, channel_id, digest));
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
                CREATE TABLE IF NOT EXISTS sources (
                    source_key TEXT PRIMARY KEY, state TEXT, job_id TEXT, created REAL);
            ''')

    @contextlib.contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def decode(row):
        if not row:
            raise KeyError('Publication not found')
        return {**json.loads(row['payload']), **{k: row[k] for k in
                ('id', 'clip_key', 'channel_id', 'digest', 'status', 'revision', 'created')}}

    def get(self, item_id):
        with self.connect() as db:
            return self.decode(db.execute('SELECT * FROM items WHERE id=?', (item_id,)).fetchone())

    def list(self):
        with self.connect() as db:
            return [self.decode(r) for r in db.execute('SELECT * FROM items ORDER BY created DESC')]

    def settings(self):
        with self.connect() as db:
            stored = {r['key']: json.loads(r['value']) for r in db.execute('SELECT * FROM settings')}
        return {'paused': True, 'watch_enabled': False, 'watch_since': None, **stored}

    def configure(self, patch):
        with self.connect() as db:
            for k, v in patch.items():
                db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', (k, json.dumps(v)))
        return self.settings()

    def add(self, data):
        item_id = uuid.uuid4().hex
        payload = {**data, 'error': None, 'bytes_sent': 0, 'session_url': None, 'video_id': None}
        with self.connect() as db:
            db.execute('INSERT OR IGNORE INTO items(id,clip_key,channel_id,digest,status,revision,payload,created) VALUES(?,?,?,?,?,?,?,?)',
                       (item_id, data['clip_key'], data['channel_id'], data['digest'], 'draft', 1, json.dumps(payload), time.time()))
            row = db.execute('SELECT * FROM items WHERE clip_key=? AND channel_id=? AND digest=?',
                             (data['clip_key'], data['channel_id'], data['digest'])).fetchone()
            return self.decode(row)

    def edit(self, item_id, revision, allowed, patch):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM items WHERE id=?', (item_id,)).fetchone()
            item = self.decode(row)
            if item['revision'] != revision or item['status'] not in allowed or row['lease_until'] > time.time():
                raise Conflict('This item changed or is already running. Refresh and try again.')
            item.update(patch)
            db.execute('UPDATE items SET payload=?,status=?,revision=revision+1,next_check=0 WHERE id=?',
                       (json.dumps(item), item['status'], item_id))
        return self.get(item_id)

    def claim(self):
        now = time.time()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if db.execute('SELECT 1 FROM items WHERE lease_until>?', (now,)).fetchone():
                return None
            paused_row = db.execute("SELECT value FROM settings WHERE key='paused'").fetchone()
            paused = json.loads(paused_row[0]) if paused_row else True
            states = ('processing', 'scheduled') if paused else ('processing', 'scheduled', 'queued', 'uploading')
            row = db.execute(f"SELECT * FROM items WHERE status IN ({','.join('?' for _ in states)}) AND next_check<=? ORDER BY next_check,created LIMIT 1", (*states, now)).fetchone()
            if not row:
                return None
            token = uuid.uuid4().hex
            status = 'uploading' if row['status'] in ('queued', 'uploading') else row['status']
            db.execute('UPDATE items SET status=?,lease=?,lease_until=?,revision=revision+1 WHERE id=?',
                       (status, token, now + 120, row['id']))
        return self.get(row['id']), token

    def renew(self, item_id, token):
        with self.connect() as db:
            return db.execute('UPDATE items SET lease_until=? WHERE id=? AND lease=?',
                              (time.time() + 120, item_id, token)).rowcount == 1

    def progress(self, item_id, token, patch, done=False):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM items WHERE id=? AND lease=?', (item_id, token)).fetchone()
            if not row:
                raise Conflict('Upload lease was lost; stopped to avoid duplicate work.')
            item = self.decode(row)
            item.update(patch)
            db.execute('UPDATE items SET payload=?,status=?,revision=revision+1,lease=?,lease_until=?,next_check=? WHERE id=?',
                       (json.dumps(item), item['status'], None if done else token,
                        0 if done else time.time() + 120, time.time() + 60 if done else 0, item_id))
        return self.get(item_id)

    def claim_source(self, key):
        with self.connect() as db:
            return db.execute('INSERT OR IGNORE INTO sources VALUES(?,?,?,?)',
                              (key, 'submitting', None, time.time())).rowcount == 1

    def finish_source(self, key, state, job_id=None):
        with self.connect() as db:
            db.execute('UPDATE sources SET state=?,job_id=? WHERE source_key=?', (state, job_id, key))

    def sources(self):
        with self.connect() as db:
            return [dict(r) for r in db.execute('SELECT * FROM sources ORDER BY created DESC LIMIT 20')]
