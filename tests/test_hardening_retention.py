"""Tests for session retention cleanup and startup self-check (Phase 5, Task 4)."""
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import unittest

from live_clipper.hardening import (
    cleanup_old_sessions,
    cleanup_orphaned_temp_files,
    is_session_protected,
    startup_maintenance,
)


class TestHardeningRetention(unittest.TestCase):
    """Test session pruning, protection rules, and startup maintenance."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp(prefix="shortly_retention_test_")
        self.data_dir = Path(self.tmp_dir) / "live_sessions"
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def _create_mock_session(
        self,
        session_id: str,
        days_old: float,
        state: str = "stopped",
        has_protected_clips: bool = False,
    ) -> Path:
        """Create a mock session directory on disk."""
        s_dir = self.data_dir / session_id
        s_dir.mkdir(parents=True, exist_ok=True)

        created_dt = datetime.now(timezone.utc) - timedelta(days=days_old)
        s_data = {
            "id": session_id,
            "created_at": created_dt.isoformat(),
            "updated_at": created_dt.isoformat(),
            "state": state,
            "chat_state": "disconnected",
            "recorder_state": "stopped",
            "config": {"channel": "test", "recording_mode": "rolling"},
        }
        with open(s_dir / "session.json", "w", encoding="utf-8") as f:
            json.dump(s_data, f)

        # Create buffers and mock clips
        buf_dir = s_dir / "buffer"
        buf_dir.mkdir(exist_ok=True)
        (buf_dir / "seg_00001.mp4").write_text("dummy video content")

        clips_dir = s_dir / "clips"
        clips_dir.mkdir(exist_ok=True)
        (clips_dir / "clip_1.mp4").write_text("clip content")

        queue_items = [{
            "id": "item-1",
            "session_id": session_id,
            "clip_path": str(clips_dir / "clip_1.mp4"),
            "status": "approved",
            "keep_forever": has_protected_clips,
        }]
        with open(s_dir / "queue.json", "w", encoding="utf-8") as f:
            json.dump(queue_items, f)

        # Set mtime backwards on directory
        ts = time.time() - (days_old * 86400.0)
        os.utime(str(s_dir), (ts, ts))

        return s_dir

    def test_cleanup_deletes_expired_unprotected_session(self):
        """Sessions older than 7 days without protected clips are completely removed."""
        s_id = "old-session-unprotected"
        s_dir = self._create_mock_session(s_id, days_old=10.0, has_protected_clips=False)
        self.assertTrue(s_dir.exists())

        cleaned = cleanup_old_sessions(str(self.data_dir), retention_days=7)
        self.assertEqual(cleaned, 1)
        self.assertFalse(s_dir.exists())

    def test_cleanup_preserves_recent_session(self):
        """Sessions newer than 7 days are untouched."""
        s_id = "recent-session"
        s_dir = self._create_mock_session(s_id, days_old=2.0, has_protected_clips=False)
        self.assertTrue(s_dir.exists())

        cleaned = cleanup_old_sessions(str(self.data_dir), retention_days=7)
        self.assertEqual(cleaned, 0)
        self.assertTrue(s_dir.exists())

    def test_cleanup_prunes_buffers_on_protected_session(self):
        """Expired sessions with keep_forever clips prune video buffers but keep clips and metadata."""
        s_id = "old-session-protected"
        s_dir = self._create_mock_session(s_id, days_old=12.0, has_protected_clips=True)

        self.assertTrue(is_session_protected(s_dir))

        cleaned = cleanup_old_sessions(str(self.data_dir), retention_days=7)
        self.assertEqual(cleaned, 1)

        # Session folder and clips still exist
        self.assertTrue(s_dir.exists())
        self.assertTrue((s_dir / "session.json").exists())
        self.assertTrue((s_dir / "queue.json").exists())
        self.assertTrue((s_dir / "clips" / "clip_1.mp4").exists())

        # Heavy buffer directory was pruned
        self.assertFalse((s_dir / "buffer").exists())

    def test_cleanup_orphaned_temp_files(self):
        """Orphaned concat text and tmp files are cleaned up."""
        orphan_concat = self.data_dir / "temp1.concat.txt"
        orphan_tmp = self.data_dir / "test.tmp"
        orphan_concat.write_text("file 'foo'")
        orphan_tmp.write_text("temp data")

        self.assertTrue(orphan_concat.exists())
        self.assertTrue(orphan_tmp.exists())

        removed = cleanup_orphaned_temp_files(str(self.data_dir))
        self.assertEqual(removed, 2)
        self.assertFalse(orphan_concat.exists())
        self.assertFalse(orphan_tmp.exists())

    def test_startup_maintenance_recovers_interrupted(self):
        """Startup maintenance marks crashed sessions failed and cleans temps."""
        s_id = "interrupted-session"
        s_dir = self._create_mock_session(s_id, days_old=0.1, state="recording")

        # Create an orphan concat file
        (s_dir / "stray.concat.txt").write_text("file 'x'")

        summary = startup_maintenance(str(self.data_dir), retention_days=7)

        self.assertEqual(summary["recovered_interrupted_sessions"], 1)
        self.assertGreaterEqual(summary["orphaned_temp_files_removed"], 1)

        with open(s_dir / "session.json", "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["state"], "failed")
        self.assertEqual(data["error"], "interrupted by restart")


if __name__ == "__main__":
    unittest.main()
