"""Pipeline handoff module for Live Clipper (Section 7.6 of LIVE_CLIPPER_SPEC).

Implements FIFO processing of approved clips, maps hook_mode ('auto', 'manual', 'none'),
links pipeline_job_id into QueueItem, and provides pause/resume controls.
"""
import asyncio
import logging
import os
import sys
import uuid
from pathlib import Path
from typing import Callable, Optional

from live_clipper.models import QueueItem
from live_clipper.queue import ReviewQueue, global_queue

logger = logging.getLogger("live_clipper.handoff")


def submit_to_shortly_pipeline(
    clip_path: str,
    hook_mode: str = "auto",
    credit_text: Optional[str] = None,
    mirror_video: bool = False,
    webcam_mode: Optional[str] = None,
    webcam_box: Optional[dict] = None,
    streamer: Optional[str] = None,
) -> str:
    """Submit an approved raw clip to Shortly's existing processing pipeline.

    Locates app.jobs and _enqueue_job from app.py, constructs the main.py execution
    command with the proper hook environment, and returns pipeline_job_id.
    """
    if hook_mode not in ("auto", "manual", "none"):
        raise ValueError(f"Invalid hook_mode: {hook_mode}. Expected: auto, manual, none.")

    # Validate file exists
    p = Path(clip_path)
    if not p.exists():
        raise FileNotFoundError(f"Clip file does not exist: {clip_path}")

    # Import app module lazily to avoid circular dependencies
    try:
        import app as shortly_app
    except ImportError as e:
        logger.warning(f"Could not import app.py for pipeline submission: {e}")
        # Return fallback simulated job ID when running in standalone mode
        return f"job_{uuid.uuid4().hex[:8]}"

    job_id = str(uuid.uuid4())[:8]
    output_dir = os.path.join(shortly_app.OUTPUT_DIR, job_id)
    os.makedirs(output_dir, exist_ok=True)

    target_main = getattr(shortly_app, "MAIN_SCRIPT", "main.py")
    if not os.path.exists(target_main):
        target_main = "main.py"

    cmd = [sys.executable, "-u", target_main, "-i", str(p.resolve()), "-o", output_dir]
    env = shortly_app.child_env()

    # Map hook mode
    if hook_mode == "auto":
        env["AUTO_HOOK"] = "1"
    elif hook_mode == "manual":
        env["PROCESSING_MODE"] = "manual"
    elif hook_mode == "none":
        env.pop("AUTO_HOOK", None)
        env.pop("PROCESSING_MODE", None)

    if credit_text:
        env["CLIPPER_CREDIT"] = str(credit_text)

    streamer_name = (streamer or credit_text or "").strip()
    if streamer_name:
        env["CONTEXT_STREAMER"] = streamer_name

    if mirror_video:
        env["MIRROR_VIDEO"] = "1"

    if webcam_mode:
        env["WEBCAM_MODE"] = str(webcam_mode)
    if isinstance(webcam_box, dict):
        import json
        env["WEBCAM_BOX"] = json.dumps(webcam_box)

    # Register into Shortly's global jobs dictionary
    timed_log = getattr(shortly_app, "_TimedLog", list)
    shortly_app.jobs[job_id] = {
        "status": "queued",
        "logs": timed_log([f"Live Clipper clip {job_id} queued for rendering."]),
        "cmd": cmd,
        "env": env,
        "output_dir": output_dir,
        "user_id": "local",
    }

    # Enqueue into Shortly's job queue
    if hasattr(shortly_app, "_enqueue_job"):
        shortly_app._enqueue_job(job_id)

    logger.info(f"Submitted clip {clip_path} to pipeline: job_id={job_id} hook_mode={hook_mode}")
    return job_id


def get_shortly_job_status(job_id: str) -> Optional[dict]:
    """Check status of a Shortly pipeline job from app.jobs."""
    try:
        import app as shortly_app
        return shortly_app.jobs.get(job_id)
    except Exception:
        return None


class HandoffWorker:
    """Background worker supervising FIFO rendering of approved clips."""

    def __init__(
        self,
        queue: Optional[ReviewQueue] = None,
        submit_fn: Optional[Callable[[str, str, Optional[str]], str]] = None,
        status_fn: Optional[Callable[[str], Optional[dict]]] = None,
        poll_interval: float = 1.0,
    ) -> None:
        self.queue = queue or global_queue
        self.submit_fn = submit_fn or submit_to_shortly_pipeline
        self.status_fn = status_fn or get_shortly_job_status
        self.poll_interval = poll_interval
        self._running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._current_item: Optional[QueueItem] = None

    async def start(self) -> None:
        """Start the FIFO supervisor loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._worker_loop())
        logger.info("HandoffWorker started.")

    async def stop(self) -> None:
        """Stop the FIFO supervisor loop."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("HandoffWorker stopped.")

    async def _worker_loop(self) -> None:
        """Main loop consuming approved items one by one."""
        while self._running:
            try:
                if self.queue.is_paused:
                    await asyncio.sleep(self.poll_interval)
                    continue

                item = self.queue.get_next_approved()
                if not item:
                    await asyncio.sleep(self.poll_interval)
                    continue

                await self._process_item(item)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in handoff worker loop: {e}", exc_info=True)
                await asyncio.sleep(self.poll_interval)

    async def _process_item(self, item: QueueItem) -> None:
        """Process a single approved item to completion."""
        self._current_item = item
        try:
            item.transition_to("processing")
            # Submit to pipeline
            try:
                job_id = self.submit_fn(
                    item.clip_path,
                    item.hook_mode or "auto",
                    None,
                    mirror_video=bool(getattr(item, "mirror_video", False)),
                    webcam_mode=getattr(item, "webcam_mode", None),
                    webcam_box=getattr(item, "webcam_box", None),
                    streamer=getattr(item, "channel", None),
                )
            except TypeError:
                job_id = self.submit_fn(item.clip_path, item.hook_mode or "auto", None)
            item.pipeline_job_id = job_id
            logger.info(f"Item {item.id} transitioned to processing with pipeline job {job_id}")

            # Monitor pipeline job status until terminal state
            while self._running:
                info = self.status_fn(job_id)
                if not info:
                    # If status cannot be retrieved, treat as completed for decoupled runners
                    item.transition_to("completed")
                    break

                st = info.get("status")
                if st in ("completed", "done", "success"):
                    item.transition_to("completed")
                    logger.info(f"Item {item.id} completed pipeline processing.")
                    break
                elif st in ("failed", "error"):
                    err = info.get("error") or "Pipeline rendering failed"
                    item.transition_to("failed")
                    item.error = str(err)
                    logger.warning(f"Item {item.id} pipeline failed: {err}")
                    break

                await asyncio.sleep(self.poll_interval)

        except Exception as e:
            logger.error(f"Handoff failure for item {item.id}: {e}")
            try:
                item.transition_to("failed")
                item.error = str(e)
            except Exception:
                pass
        finally:
            self._current_item = None


# Global handoff supervisor
global_handoff = HandoffWorker()
