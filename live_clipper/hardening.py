"""Hardening, session retention cleanup, and startup self-check (Phase 5, Task 4)."""
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import shutil
import time
from typing import Any, Dict, List, Optional

from jsonfile import write_json_atomic

logger = logging.getLogger("live_clipper.hardening")


def is_session_protected(session_dir: Path) -> bool:
    """Check if a session contains clips marked keep_forever=True."""
    q_json = session_dir / "queue.json"
    if not q_json.exists():
        return False
    try:
        with open(q_json, "r", encoding="utf-8") as f:
            items = json.load(f)
        if isinstance(items, list):
            for item in items:
                if item.get("keep_forever") is True:
                    return True
    except Exception:
        pass
    return False


def cleanup_old_sessions(data_dir: str = "live_sessions", retention_days: int = 7) -> int:
    """Clean up sessions older than retention_days.

    If a session has protected clips (keep_forever=True), its raw buffer and
    recording video files are purged to save disk space while preserving its
    clips/ folder, session.json, and queue.json.
    If no protected clips exist, the entire session folder is deleted.

    Returns:
        Number of sessions purged or pruned.
    """
    base = Path(data_dir)
    if not base.exists():
        return 0

    now_ts = time.time()
    retention_sec = max(1, retention_days) * 86400.0
    cleaned = 0

    for item in base.iterdir():
        if not item.is_dir():
            continue

        s_json = item / "session.json"
        created_ts = None
        if s_json.exists():
            try:
                with open(s_json, "r", encoding="utf-8") as f:
                    data = json.load(f)
                created_str = data.get("created_at")
                if created_str:
                    # Parse ISO timestamp
                    dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                    created_ts = dt.timestamp()
                # Do not delete currently active sessions
                if data.get("state") in ("connecting", "recording", "waiting_for_live"):
                    continue
            except Exception:
                pass

        if created_ts is None:
            try:
                created_ts = item.stat().st_mtime
            except OSError:
                continue

        if (now_ts - created_ts) > retention_sec:
            protected = is_session_protected(item)
            if protected:
                # Prune heavy video buffers, keep clips and metadata
                logger.info(f"Pruning recording buffers for protected session {item.name}")
                for folder in ("buffer", "recording"):
                    b_path = item / folder
                    if b_path.exists():
                        shutil.rmtree(str(b_path), ignore_errors=True)
                for cand in ("continuous.mp4", "recording.mp4"):
                    f_path = item / cand
                    if f_path.exists():
                        try:
                            f_path.unlink()
                        except OSError:
                            pass
                cleaned += 1
            else:
                logger.info(f"Deleting expired session {item.name} (> {retention_days} days old)")
                shutil.rmtree(str(item), ignore_errors=True)
                cleaned += 1

    return cleaned


def cleanup_orphaned_temp_files(data_dir: str = "live_sessions") -> int:
    """Remove orphaned .concat.txt files and incomplete scratch files across sessions."""
    base = Path(data_dir)
    if not base.exists():
        return 0

    removed = 0
    for p in base.rglob("*.concat.txt"):
        try:
            p.unlink()
            removed += 1
        except OSError:
            pass

    for p in base.rglob("*.tmp"):
        try:
            p.unlink()
            removed += 1
        except OSError:
            pass

    return removed


def startup_maintenance(data_dir: str = "live_sessions", retention_days: int = 7) -> Dict[str, Any]:
    """Execute startup self-check and maintenance routine.

    1. Marks any interrupted sessions (left running on crash/restart) as failed.
    2. Cleans orphaned temp files (.concat.txt, .tmp).
    3. Runs session retention policy.
    """
    logger.info("Running Live Clipper startup self-check and maintenance...")
    base = Path(data_dir)
    base.mkdir(parents=True, exist_ok=True)

    recovered = 0
    for item in base.iterdir():
        if item.is_dir():
            s_json = item / "session.json"
            if s_json.exists():
                try:
                    with open(s_json, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    state = data.get("state")
                    if state in ("connecting", "recording", "stopping", "waiting_for_live"):
                        data["state"] = "failed"
                        data["chat_state"] = "disconnected"
                        data["recorder_state"] = "stopped"
                        data["error"] = "interrupted by restart"
                        data["updated_at"] = datetime.now(timezone.utc).isoformat()
                        write_json_atomic(str(s_json), data)
                        recovered += 1
                except Exception as e:
                    logger.warning(f"Failed to inspect session {item.name}: {e}")

    temp_files = cleanup_orphaned_temp_files(data_dir)
    cleaned_sessions = cleanup_old_sessions(data_dir, retention_days=retention_days)

    summary = {
        "recovered_interrupted_sessions": recovered,
        "orphaned_temp_files_removed": temp_files,
        "retention_cleaned_sessions": cleaned_sessions,
    }
    logger.info(f"Startup maintenance completed: {summary}")
    return summary
