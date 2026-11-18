"""FastAPI routes for Live Clipper (Section 7.7 of LIVE_CLIPPER_SPEC)."""
import asyncio
from dataclasses import asdict
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from .watchlist import watchlist
from .models import LiveConfig, LiveSession
from .session import session_manager, clean_channel_slug, is_valid_uuid, resolve_session_path
from .probe_webhook import verify_kick_signature
from .queue import global_queue
from .handoff import global_handoff
from .review import review_session, cut_review_clip, inspect_session_recording

router = APIRouter(prefix="/api/liveclipper", tags=["liveclipper"])


class CreateSessionRequest(BaseModel):
    channel: str
    permission_ack: bool
    platform: str = "kick"
    recording_mode: str = "rolling"
    buffer_minutes: int = 8
    confirm_delay_sec: float = 8.0
    cooldown_sec: float = 90.0
    max_clips_per_hour: int = 12
    max_pending: int = 30
    sync_offset_sec: float = 0.0
    max_session_hours: float = 12.0
    max_disk_gb: float = 20.0
    hook_mode: str = "auto"
    audio_peaks_enabled: bool = True
    heatmap_enabled: bool = True
    auto_process: bool = False
    wait_for_live: bool = False
    detector: Optional[Dict[str, Any]] = None
    credit_text: Optional[str] = None
    mirror_video: bool = False
    webcam_mode: str = "auto"
    webcam_box: Optional[Dict[str, float]] = None


class WatchCreatorRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    channels: Dict[str, str]
    permission_ack: bool


class WatchEnabledRequest(BaseModel):
    enabled: bool


@router.get("/watchlist")
async def list_watches():
    return [dict(row, **watchlist.status.get(row["id"], {})) for row in watchlist.entries()]


@router.post("/watchlist", status_code=201)
async def add_watch(req: WatchCreatorRequest):
    try:
        watchlist.add(req.name, req.channels, req.permission_ack)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    return await list_watches()


@router.patch("/watchlist/{key}")
async def toggle_watch(key: str, req: WatchEnabledRequest):
    rows = watchlist.entries()
    for row in rows:
        if row["id"] == key:
            row["enabled"] = req.enabled
            watchlist.status.pop(key, None)
            watchlist.save(rows)
            return await list_watches()
    raise HTTPException(404, "Unknown creator")


@router.delete("/watchlist/{key}")
async def remove_watch(key: str):
    watchlist.save([row for row in watchlist.entries() if row["id"] != key])
    watchlist.status.pop(key, None)
    return await list_watches()


class StopSessionRequest(BaseModel):
    keep_buffer: bool = False


@router.get("/health")
async def get_health() -> Dict[str, Any]:
    """Health check for Live Clipper dependencies, recording tool, and disk space."""
    data_dir = session_manager.data_dir
    os.makedirs(data_dir, exist_ok=True)

    disk_free_gb = 0.0
    try:
        usage = shutil.disk_usage(data_dir)
        disk_free_gb = round(usage.free / (1024.0 ** 3), 1)
    except Exception:
        pass

    # Check ffmpeg and recorder
    ffmpeg_available = bool(shutil.which("ffmpeg") or os.environ.get("FFMPEG_PATH"))
    recorder_available = bool(shutil.which("streamlink") or os.environ.get("STREAM_RECORDER_PATH"))

    return {
        "recorder": "streamlink" if recorder_available else "fake",
        "ffmpeg": "available" if ffmpeg_available else "missing",
        "chat_access_checked": True,
        "data_dir_ok": os.path.isdir(data_dir),
        "disk_free_gb": disk_free_gb,
    }


@router.post("/sessions", status_code=status.HTTP_201_CREATED)
async def create_session(req: CreateSessionRequest) -> Dict[str, str]:
    """Start a new Live Clipper session (enforces permission and single active session)."""
    # 1. Permission check
    if not req.permission_ack:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Permission acknowledgment (permission_ack) is required and must be accepted.",
        )

    # 2. Channel input validation
    try:
        clean_slug = clean_channel_slug(req.channel, platform=req.platform)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # 3. Build validated LiveConfig
    try:
        req_data = req.model_dump() if hasattr(req, "model_dump") else req.dict()
        config = LiveConfig.from_dict({**req_data, "channel": clean_slug})
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # 4. Enforce single active session
    if session_manager.get_active_session() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A Live Clipper session is already active. Only one active session is permitted.",
        )

    try:
        session = await session_manager.start_session(config)
        return {"id": session.session_id}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to start session: {e}")


@router.get("/active")
async def active_session():
    session = session_manager.get_active_session()
    return {"id": session.id if session else None}


@router.get("/sessions")
async def list_sessions() -> List[Dict[str, Any]]:
    """List all sessions on disk, newest first."""
    return session_manager.list_sessions()


@router.get("/sessions/{session_id}")
async def get_session(session_id: str) -> Dict[str, Any]:
    """Get full details of a specific session."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")

    session_data = session_manager.get_session(session_id)
    if not session_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session {session_id} not found.")
    return session_data


@router.get("/sessions/{session_id}/series")
async def get_session_series(
    session_id: str,
    since: Optional[float] = Query(None, description="Return points since this session-clock timestamp"),
) -> Dict[str, Any]:
    """Incremental polling for the live chat graph."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")

    active = session_manager.get_active_session()
    if active and active.session_id == session_id:
        points = active.detector.series(since=since)
        spikes = [asdict(s) for s in active._spikes]
        # Always return latest recent messages directly from ring buffer to eliminate latency
        messages = active.get_recent_messages(limit=100)
        detector_info = {
            "ratio_threshold": active.detector.config.ratio_threshold,
            "min_count": active.detector.config.min_count,
            "cooldown_sec": active.detector.cooldown_sec,
        }
        stats_info = {
            "chat_transport": getattr(active.chat_source, "transport", None),
            "msgs_per_sec": active.session_data.stats.msgs_per_sec_now,
            "msgs_per_min": active.session_data.stats.msgs_per_min_now,
            "events_total": active.session_data.stats.events_total,
        }
        audio_energy = active.audio_analyzer.get_series(since=since) if active.audio_analyzer else []
        audio_peaks = [asdict(p) for p in active.audio_peaks]
        yt_meta = active.youtube_metadata or {}
        return {
            "points": points,
            "spikes": spikes,
            "messages": messages,
            "detector": detector_info,
            "stats": stats_info,
            "audio_energy": audio_energy,
            "audio_peaks": audio_peaks,
            "heatmap": yt_meta.get("heatmap", []),
            "heatmap_peaks": yt_meta.get("heatmap_peaks", []),
            "manual_cuts": active.get_manual_cuts(),
        }

    # If stopped or from disk, compute from detector or persisted spikes
    session_data = session_manager.get_session(session_id)
    if not session_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session {session_id} not found.")

    det_cfg = session_data.get("config", {}).get("detector", {})
    return {"points": [], "spikes": [], "messages": [], "detector": det_cfg}


@router.get("/sessions/{session_id}/messages")
async def get_session_messages(
    session_id: str,
    since: Optional[float] = Query(None, description="Return messages since this session-clock timestamp"),
    limit: int = Query(50, le=200),
) -> Dict[str, Any]:
    """Fetch live chat messages recorded for this session."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")

    active = session_manager.get_active_session()
    if active and active.session_id == session_id:
        return {"messages": active.get_recent_messages(since_t=since, limit=limit)}

    return {"messages": []}


@router.post("/sessions/{session_id}/stop")
async def stop_session(session_id: str, req: StopSessionRequest = StopSessionRequest()) -> Dict[str, bool]:
    """Stop an active session."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")

    try:
        await session_manager.stop_session(session_id, keep_buffer=req.keep_buffer)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to stop session: {e}")


class UpdateDetectorRequest(BaseModel):
    ratio_threshold: Optional[float] = None
    min_count: Optional[int] = None
    cooldown_sec: Optional[float] = None
    confirm_delay_sec: Optional[float] = None
    mirror_video: Optional[bool] = None
    webcam_mode: Optional[str] = None
    webcam_box: Optional[Dict[str, float]] = None


@router.patch("/sessions/{session_id}/detector")
async def update_session_detector(session_id: str, req: UpdateDetectorRequest) -> Dict[str, Any]:
    """Dynamically adjust spike detection sensitivity on an active session in real-time."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")

    active = session_manager.get_active_session()
    if not active or active.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active session not found or already stopped.")

    updated = active.update_detector_config(
        ratio_threshold=req.ratio_threshold,
        min_count=req.min_count,
        cooldown_sec=req.cooldown_sec,
        confirm_delay_sec=req.confirm_delay_sec,
        mirror_video=req.mirror_video,
        webcam_mode=req.webcam_mode,
        webcam_box=req.webcam_box,
    )
    return {"ok": True, "detector": updated}


def _grab_jpeg_frame(media_path: Path) -> bytes:
    """Extract a single JPEG frame from a media file using ffmpeg."""
    ffmpeg = os.environ.get("FFMPEG_PATH") or "ffmpeg"
    res = subprocess.run(
        [
            ffmpeg, "-nostdin", "-loglevel", "error",
            "-i", str(media_path),
            "-vframes", "1", "-q:v", "4", "-vf", "scale='min(960,iw)':-2",
            "-f", "image2pipe", "-vcodec", "mjpeg", "pipe:1",
        ],
        capture_output=True,
        timeout=10.0,
    )
    if res.returncode != 0 or not res.stdout:
        raise RuntimeError(res.stderr.decode("utf-8", errors="replace")[-200:] or "ffmpeg produced no frame")
    return res.stdout


@router.get("/snapshot")
async def get_latest_snapshot():
    """Return a single JPEG frame from the active live stream buffer or latest captured clip."""
    media: Optional[Path] = None
    active = session_manager.get_active_session()
    if active:
        media = active.latest_media_path()
    if media is None:
        for item in global_queue.list_items():
            if item.clip_path and Path(item.clip_path).is_file():
                media = Path(item.clip_path)
                break
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No live buffer or clip available for snapshot.")
    try:
        jpeg = await asyncio.to_thread(_grab_jpeg_frame, media)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Snapshot extraction failed: {exc}")
    return Response(content=jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@router.get("/sessions/{session_id}/snapshot")
async def get_session_snapshot(session_id: str):
    """Return a single live JPEG frame from a specific active session's buffer."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")
    active = session_manager.get_active_session()
    media: Optional[Path] = active.latest_media_path() if (active and active.session_id == session_id) else None
    if media is None:
        for item in global_queue.list_items(session_id=session_id):
            if item.clip_path and Path(item.clip_path).is_file():
                media = Path(item.clip_path)
                break
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No frame available yet for this session.")
    try:
        jpeg = await asyncio.to_thread(_grab_jpeg_frame, media)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"Snapshot extraction failed: {exc}")
    return Response(content=jpeg, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


class ManualCutRequest(BaseModel):
    before_sec: float = Field(default=30.0, ge=0.0, le=600.0)
    after_sec: float = Field(default=10.0, ge=0.0, le=600.0)
    send_to_skipper: bool = True
    prune_buffer_before: bool = False


class PruneBufferRequest(BaseModel):
    keep_last_sec: float = Field(default=0.0, ge=0.0, le=3600.0)


@router.post("/sessions/{session_id}/manual-cut")
async def manual_cut_session_clip(session_id: str, req: ManualCutRequest) -> Dict[str, Any]:
    """Manually cut a highlight clip around the current live moment (X before, Y after)."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")

    total = req.before_sec + req.after_sec
    if total < 2.0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Total clip length (before + after) must be at least 2 seconds.",
        )
    if total > 600.0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Total clip length cannot exceed 10 minutes (600 seconds).",
        )

    active = session_manager.get_active_session()
    if not active or active.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active session not found or already stopped.")

    if active.session_data.state not in ("recording", "connecting"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot cut a clip while session is '{active.session_data.state}'. Wait until recording begins.",
        )

    record = active.schedule_manual_cut(
        before_sec=req.before_sec,
        after_sec=req.after_sec,
        send_to_skipper=req.send_to_skipper,
        prune_buffer_before=req.prune_buffer_before,
    )
    return {"ok": True, "cut": record}


@router.post("/sessions/{session_id}/buffer/prune")
async def prune_session_buffer(session_id: str, req: PruneBufferRequest = PruneBufferRequest()) -> Dict[str, Any]:
    """Delete completed buffer segments older than (now - keep_last_sec) on an active session."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")

    active = session_manager.get_active_session()
    if not active or active.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active session not found or already stopped.")

    cutoff_t = max(0.0, active.session_clock - req.keep_last_sec)
    result = await asyncio.to_thread(active.prune_buffer_before, cutoff_t)
    return {"ok": True, **result}


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str) -> Dict[str, bool]:
    """Delete session files from disk (refused while active)."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")

    active = session_manager.get_active_session()
    if active and active.session_id == session_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete an active session. Stop it first.",
        )

    try:
        session_manager.delete_session(session_id)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/webhooks/kick")
async def kick_webhook_receiver(
    request: Request,
    kick_signature: Optional[str] = Header(None, alias="Kick-Event-Signature"),
    x_kick_signature: Optional[str] = Header(None, alias="X-Kick-Signature"),
) -> Dict[str, Any]:
    """Verified webhook receiver for Kick chat events."""
    raw_body = await request.body()
    secret = os.environ.get("KICK_WEBHOOK_SECRET", "")
    sig_header = kick_signature or x_kick_signature or request.headers.get("Kick-Signature")

    if not verify_kick_signature(raw_body, sig_header, secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON payload")

    active = session_manager.get_active_session()
    if active and hasattr(active.chat_source, "dispatch_raw_webhook"):
        accepted = active.chat_source.dispatch_raw_webhook(payload)
        return {"status": "ok", "accepted": accepted}

    return {"status": "ignored", "reason": "no_active_session"}


class PauseRequest(BaseModel):
    paused: bool = True


# ---------------------------------------------------------------------------
# Phase 3 Queue Routes (Section 7.7)
# ---------------------------------------------------------------------------

@router.get("/sessions/{session_id}/queue")
async def list_session_queue(session_id: str) -> Dict[str, Any]:
    """List queue items for a specific session."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format")
    items = global_queue.list_items(session_id=session_id)
    return {"items": [it.to_dict() for it in items]}


@router.get("/queue")
async def list_all_queue() -> Dict[str, Any]:
    """List all review queue items across sessions, newest first."""
    items = global_queue.list_items()
    return {"items": [it.to_dict() for it in items]}


class ApproveClipRequest(BaseModel):
    mirror_video: Optional[bool] = None
    webcam_mode: Optional[str] = None
    webcam_box: Optional[Dict[str, float]] = None


@router.post("/queue/{item_id}/approve")
async def approve_clip(item_id: str, req: Optional[ApproveClipRequest] = None) -> Dict[str, Any]:
    """Approve a clip in the queue for rendering through the Shortly pipeline."""
    if not is_valid_uuid(item_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item ID format")
    try:
        mirror_override = req.mirror_video if req is not None else None
        wc_mode_override = req.webcam_mode if req is not None else None
        wc_box_override = req.webcam_box if req is not None else None
        item = global_queue.approve(
            item_id,
            mirror_video=mirror_override,
            webcam_mode=wc_mode_override,
            webcam_box=wc_box_override,
        )
        return {"ok": True, "item": item.to_dict()}
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Queue item {item_id} not found")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))


@router.post("/queue/{item_id}/reject")
async def reject_clip(item_id: str) -> Dict[str, Any]:
    """Reject a clip in the queue and delete its raw file from disk."""
    if not is_valid_uuid(item_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item ID format")
    try:
        item = global_queue.reject(item_id)
        return {"ok": True, "item": item.to_dict()}
    except KeyError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Queue item {item_id} not found")
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))


@router.get("/queue/{item_id}/preview")
async def preview_clip(item_id: str):
    """Stream raw clip video with HTTP 206 Partial Content (Range) support."""
    if not is_valid_uuid(item_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item ID format")
    item = global_queue.get_item(item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Queue item {item_id} not found")
    if not item.clip_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip path not configured for item")

    clip_file = Path(item.clip_path)
    if not clip_file.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip video file missing from disk")

    return FileResponse(path=str(clip_file.resolve()), media_type="video/mp4")


@router.post("/processing/pause")
async def pause_processing(req: Optional[PauseRequest] = None) -> Dict[str, Any]:
    """Toggle or set the global FIFO processing pause flag."""
    paused = True if req is None else req.paused
    new_state = global_queue.set_paused(paused)
    return {"paused": new_state}


@router.get("/youtube/signals")
async def get_youtube_signals(url: str = Query(..., description="YouTube video or stream URL")) -> Dict[str, Any]:
    """Fetch metadata and 'Most replayed' retention heatmap for any YouTube stream or video."""
    from .youtube_signals import async_fetch_youtube_signals
    try:
        data = await async_fetch_youtube_signals(url)
        return data
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# ---------------------------------------------------------------------------
# Phase 5 After-Stream Review & Hardening Routes
# ---------------------------------------------------------------------------

class ReviewSessionRequest(BaseModel):
    z_threshold: Optional[float] = None
    ratio_threshold: Optional[float] = None
    min_spike_score: Optional[float] = None
    bin_sec: Optional[float] = None
    baseline_sec: Optional[float] = None
    min_count: Optional[int] = None
    confirm_delay_sec: Optional[float] = None
    cooldown_sec: Optional[float] = None


class CutRangeRequest(BaseModel):
    start_sec: float
    end_sec: float
    title: Optional[str] = None
    spike: Optional[Dict[str, Any]] = None


class ProtectItemRequest(BaseModel):
    keep_forever: Optional[bool] = None


@router.post("/sessions/{session_id}/review")
async def get_session_review(
    session_id: str,
    req: ReviewSessionRequest = ReviewSessionRequest(),
) -> Dict[str, Any]:
    """Execute after-stream review using spike_core's batch detector on saved events.jsonl."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")

    try:
        session_dir = resolve_session_path(session_manager.data_dir, session_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not session_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session {session_id} not found.")

    params = req.model_dump(exclude_unset=True) if hasattr(req, "model_dump") else req.dict(exclude_unset=True)
    return review_session(session_dir, params=params)


@router.post("/sessions/{session_id}/cut")
async def cut_session_clip(
    session_id: str,
    req: CutRangeRequest,
) -> Dict[str, Any]:
    """Extract a custom or spike-selected time range from the session recording into the queue."""
    if not is_valid_uuid(session_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid session ID format.")

    try:
        session_dir = resolve_session_path(session_manager.data_dir, session_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not session_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session {session_id} not found.")

    s_json = session_dir / "session.json"
    if not s_json.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session metadata missing.")

    try:
        with open(s_json, "r", encoding="utf-8") as f:
            s_data = json.load(f)
        session_obj = LiveSession.from_dict(s_data)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Corrupt session metadata: {e}")

    item, err = cut_review_clip(
        session_dir=session_dir,
        session=session_obj,
        start_sec=req.start_sec,
        end_sec=req.end_sec,
        title=req.title,
        spike_dict=req.spike,
    )
    if err or not item:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err or "Failed to cut review clip")

    return {"ok": True, "item": item.to_dict()}


@router.patch("/queue/{item_id}/protect")
async def toggle_item_protection(
    item_id: str,
    req: Optional[ProtectItemRequest] = None,
) -> Dict[str, Any]:
    """Toggle or set keep_forever protection to prevent automatic session retention pruning."""
    if not is_valid_uuid(item_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item ID format")

    item = global_queue.get_item(item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Queue item {item_id} not found")

    new_val = not item.keep_forever if (req is None or req.keep_forever is None) else req.keep_forever
    item.keep_forever = new_val

    # Persist updated queue item to session directory
    try:
        session_dir = resolve_session_path(session_manager.data_dir, item.session_id)
        global_queue._save_session_queue(item.session_id, session_dir)
    except Exception:
        pass

    return {"ok": True, "item_id": item_id, "keep_forever": item.keep_forever}


@router.get("/queue/{item_id}/thumbnail")
async def get_clip_thumbnail(item_id: str):
    """Serve generated thumbnail for a queue clip if available."""
    if not is_valid_uuid(item_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid item ID format")

    item = global_queue.get_item(item_id)
    if not item or not item.clip_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item or clip path not found")

    thumb_path = Path(item.clip_path).with_suffix(".jpg")
    if not thumb_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail not generated")

    return FileResponse(path=str(thumb_path.resolve()), media_type="image/jpeg")


@router.post("/maintenance")
async def run_system_maintenance(retention_days: int = 7) -> Dict[str, Any]:
    """Manually trigger startup self-check, retention pruning, and temp file cleanup."""
    summary = session_manager.run_maintenance(retention_days=retention_days)
    return {"ok": True, "maintenance": summary}

