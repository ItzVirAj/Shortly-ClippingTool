"""Unit and integration tests for Review Queue and Pipeline Handoff (Section 7.6, 7.7, Phase 3)."""
import asyncio
import os
from pathlib import Path
import subprocess
from typing import Optional
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from live_clipper.chat_source import FakeChatSource
from live_clipper.cutter import probe_duration
from live_clipper.handoff import HandoffWorker
from live_clipper.models import LiveConfig, QueueItem
from live_clipper.queue import ReviewQueue, global_queue
from live_clipper.recorder import FakeRecorder
from live_clipper.routes import router
from live_clipper.session import LiveClipperSession
from spike_core.models import ChatEvent, DetectorConfig


@pytest.fixture
def temp_queue_dir(tmp_path: Path) -> Path:
    return tmp_path


def make_queue_item(
    item_id: str = "item-1111-2222-3333-444444444444",
    session_id: str = "sess-1111-2222-3333-444444444444",
    clip_path: str = "/tmp/clip1.mp4",
    status: str = "pending_review",
) -> QueueItem:
    return QueueItem(
        id=item_id,
        session_id=session_id,
        spike_id="spk-1",
        clip_path=clip_path,
        status=status,
        duration=30.0,
        score=75.0,
    )


def test_queue_state_transitions():
    """Verify legal and illegal queue item transitions."""
    item = make_queue_item()

    # pending_review -> approved
    item.transition_to("approved")
    assert item.status == "approved"

    # Idempotent re-approval (should be a no-op without ValueError)
    item.transition_to("approved")
    assert item.status == "approved"

    # approved -> processing
    item.transition_to("processing")
    assert item.status == "processing"

    # processing -> completed
    item.transition_to("completed")
    assert item.status == "completed"

    # completed -> approved is illegal
    with pytest.raises(ValueError):
        item.transition_to("approved")

    # Retry flow: failed -> approved
    failed_item = make_queue_item(status="processing")
    failed_item.transition_to("failed")
    assert failed_item.status == "failed"

    failed_item.transition_to("approved")
    assert failed_item.status == "approved"


def test_reject_deletes_raw_clip(temp_queue_dir: Path):
    """Verify rejecting a clip deletes the file from disk and updates state."""
    clip_file = temp_queue_dir / "raw_clip_to_delete.mp4"
    clip_file.write_bytes(b"TEST_RAW_VIDEO_BYTES")
    assert clip_file.exists()

    queue = ReviewQueue(data_root=temp_queue_dir)
    item = make_queue_item(
        item_id="rej-item-1",
        session_id="sess-1",
        clip_path=str(clip_file.resolve()),
    )
    queue.add_item(item, session_dir=temp_queue_dir)

    rej = queue.reject(item.id, session_dir=temp_queue_dir)
    assert rej.status == "rejected"
    assert not clip_file.exists()


def test_pause_and_fifo_order(temp_queue_dir: Path):
    """Verify pause flag prevents retrieval, and unpause returns oldest approved first."""
    queue = ReviewQueue(data_root=temp_queue_dir)

    item1 = make_queue_item(item_id="it-1", session_id="s1")
    item2 = make_queue_item(item_id="it-2", session_id="s1")

    queue.add_item(item1)
    queue.add_item(item2)

    # Approve item 1 then item 2
    queue.approve("it-1")
    queue.approve("it-2")

    # When paused -> None
    queue.set_paused(True)
    assert queue.is_paused is True
    assert queue.get_next_approved() is None

    # When unpaused -> item 1 (oldest approved first)
    queue.set_paused(False)
    next_item = queue.get_next_approved()
    assert next_item is not None
    assert next_item.id == "it-1"


def test_handoff_worker_processing_and_fault_tolerance(temp_queue_dir: Path):
    """Verify HandoffWorker processes approved items FIFO, handles pipeline failure without stopping queue."""
    async def _run():
        queue = ReviewQueue(data_root=temp_queue_dir)

        item_fail = make_queue_item(item_id="it-fail", session_id="s1", clip_path="/tmp/fail.mp4", status="approved")
        item_ok = make_queue_item(item_id="it-ok", session_id="s1", clip_path="/tmp/ok.mp4", status="approved")

        queue.add_item(item_fail)
        queue.add_item(item_ok)

        # Simulated pipeline status store
        mock_jobs = {
            "job-fail": {"status": "failed", "error": "Simulated render crash"},
            "job-ok": {"status": "completed"},
        }

        def mock_submit(clip_path: str, hook_mode: str, credit: Optional[str]) -> str:
            if "it-fail" in clip_path or clip_path == item_fail.clip_path:
                return "job-fail"
            return "job-ok"

        def mock_status(job_id: str) -> Optional[dict]:
            return mock_jobs.get(job_id)

        worker = HandoffWorker(
            queue=queue,
            submit_fn=mock_submit,
            status_fn=mock_status,
            poll_interval=0.05,
        )

        await worker.start()
        # Wait for both items to be processed
        for _ in range(50):
            if item_fail.status == "failed" and item_ok.status == "completed":
                break
            await asyncio.sleep(0.05)

        await worker.stop()

        assert item_fail.status == "failed"
        assert "Simulated render crash" in (item_fail.error or "")
        assert item_fail.pipeline_job_id == "job-fail"

        assert item_ok.status == "completed"
        assert item_ok.pipeline_job_id == "job-ok"

    asyncio.run(_run())



def test_api_queue_routes_and_preview_range(temp_queue_dir: Path):
    """Verify queue API routes and HTTP 206 Partial Content video streaming."""
    test_app = FastAPI()
    test_app.include_router(router)
    client = TestClient(test_app)

    # Prepare clip file
    clip_file = temp_queue_dir / "preview_test.mp4"
    clip_content = b"0123456789" * 100  # 1000 bytes
    clip_file.write_bytes(clip_content)

    valid_uuid_session = "11111111-2222-3333-4444-555555555555"
    valid_uuid_item = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    item = make_queue_item(
        item_id=valid_uuid_item,
        session_id=valid_uuid_session,
        clip_path=str(clip_file.resolve()),
    )
    global_queue.add_item(item)

    # 1. List session queue
    res_list = client.get(f"/api/liveclipper/sessions/{valid_uuid_session}/queue")
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    assert any(it["id"] == valid_uuid_item for it in items)

    # 2. Preview video with Range header (HTTP 206 Partial Content)
    res_stream = client.get(
        f"/api/liveclipper/queue/{valid_uuid_item}/preview",
        headers={"Range": "bytes=0-99"},
    )
    assert res_stream.status_code == 206
    assert res_stream.headers.get("accept-ranges") == "bytes"
    assert "bytes 0-99/" in res_stream.headers.get("content-range", "")
    assert len(res_stream.content) == 100
    assert res_stream.content == clip_content[0:100]

    # 3. Pause toggle
    res_pause = client.post("/api/liveclipper/processing/pause", json={"paused": True})
    assert res_pause.status_code == 200
    assert res_pause.json()["paused"] is True
    assert global_queue.is_paused is True

    res_unpause = client.post("/api/liveclipper/processing/pause", json={"paused": False})
    assert res_unpause.status_code == 200
    assert res_unpause.json()["paused"] is False

    # 4. Approve item
    res_app = client.post(f"/api/liveclipper/queue/{valid_uuid_item}/approve")
    assert res_app.status_code == 200
    assert res_app.json()["item"]["status"] == "approved"

    # 5. Reject item (deletes file)
    res_rej = client.post(f"/api/liveclipper/queue/{valid_uuid_item}/reject")
    assert res_rej.status_code == 200
    assert res_rej.json()["item"]["status"] == "rejected"
    assert not clip_file.exists()


def test_phase3_end_to_end_simulation(temp_queue_dir: Path):
    """End-to-end Phase 3 simulation (Task 6):

    1. Fake chat with 2 bursts + real synthetic video segments.
    2. Session detector confirms spikes and cutter extracts raw clips into queue items.
    3. Verify durations within 2s of target.
    4. Approve one clip -> pipeline handoff worker processes it to completed.
    5. Reject the other clip -> verified deleted from disk.
    """
    async def _run():
        session_id = "12345678-1234-1234-1234-123456789abc"
        session_dir = temp_queue_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        buffer_dir = session_dir / "buffer"
        buffer_dir.mkdir(parents=True, exist_ok=True)

        # 1. Generate 3 short real test segments covering 0s to 90s using FFmpeg testsrc
        segments = []
        for i in range(3):
            seg_file = buffer_dir / f"seg_{i:05d}.mp4"
            start_sec = i * 30.0
            cmd = [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"testsrc=duration=30:size=160x120:rate=10",
                "-c:v", "libx264", "-preset", "ultrafast",
                "-an",
                str(seg_file),
            ]
            subprocess.run(cmd, capture_output=True, check=True, timeout=20.0)
            segments.append({
                "path": str(seg_file.resolve()),
                "file": seg_file.name,
                "session_start": start_sec,
                "start_sec": start_sec,
                "duration": 30.0,
                "end_sec": start_sec + 30.0,
            })

        # Save buffer/index.json
        import json
        with open(buffer_dir / "index.json", "w", encoding="utf-8") as f:
            json.dump({"segments": segments}, f, indent=2)

        # 2. Build synthetic chat with 2 clear bursts (burst 1 at t=20s, burst 2 at t=65s)
        events = []
        # Steady baseline
        for t in range(0, 90, 2):
            events.append(ChatEvent(t=float(t), user=f"u_{t}", text="hello", emotes=0))
        # Burst 1: t=20 to t=24 (30 messages)
        for i in range(30):
            events.append(ChatEvent(t=20.0 + i * 0.1, user=f"burst1_{i}", text="POGGERS", emotes=2))
        # Burst 2: t=65 to t=69 (35 messages)
        for i in range(35):
            events.append(ChatEvent(t=65.0 + i * 0.1, user=f"burst2_{i}", text="KEKW", emotes=3))

        events.sort(key=lambda e: e.t)

        # 3. Create and run session with speedup
        chat_source = FakeChatSource(events=events, speed=50.0)
        recorder = FakeRecorder(write_mock_files=False)

        config = LiveConfig(
            channel="e2e_test_channel",
            permission_ack=True,
            confirm_delay_sec=2.0,
            cooldown_sec=10.0,
            detector=DetectorConfig(
                bin_sec=2.0,
                ratio_threshold=2.0,
                min_count=10,
                before_sec=5.0,
                after_sec=5.0,
                min_len=10.0,
                max_len=30.0,
                min_gap_sec=15.0,
            ),
        )

        session = LiveClipperSession(
            session_id=session_id,
            config=config,
            session_dir=session_dir,
            chat_source=chat_source,
            recorder=recorder,
        )


        await session.start()

        # Let session run through all chat events and clock advances
        for _ in range(60):
            if chat_source.state == "disconnected":
                break
            await asyncio.sleep(0.05)

        # 4. Wait for Queue items to be cut
        items = []
        for _ in range(100):
            session.detector.advance(100.0)
            items = global_queue.list_items(session_id=session_id)
            if len(items) >= 2:
                break
            await asyncio.sleep(0.1)

        await session.stop(keep_buffer=True)

        assert len(items) >= 2, f"Expected at least 2 queue items, got {len(items)}"


        item1 = items[0]  # newest or oldest depending on list_items reverse=True
        item2 = items[1]

        # Verify raw clip files exist and durations are within 2s of requested
        for it in (item1, item2):
            p = Path(it.clip_path)
            assert p.exists()
            measured = probe_duration(p)
            assert measured is not None
            assert abs(measured - it.duration) <= 2.0

        # 5. Approve item 1 and Reject item 2
        global_queue.approve(item1.id)
        assert item1.status == "approved"

        item2_path = Path(item2.clip_path)
        global_queue.reject(item2.id)
        assert item2.status == "rejected"
        assert not item2_path.exists(), "Rejected clip file should be deleted from disk"

        # 6. Pipeline handoff processing
        mock_pipeline_jobs = {}

        def mock_submit(clip_path: str, hook_mode: str, credit: Optional[str]) -> str:
            job_id = "pipe-job-e2e"
            mock_pipeline_jobs[job_id] = {"status": "completed"}
            return job_id

        def mock_status(job_id: str) -> Optional[dict]:
            return mock_pipeline_jobs.get(job_id)

        worker = HandoffWorker(
            queue=global_queue,
            submit_fn=mock_submit,
            status_fn=mock_status,
            poll_interval=0.05,
        )

        await worker.start()
        for _ in range(30):
            if item1.status == "completed":
                break
            await asyncio.sleep(0.05)
        await worker.stop()

        assert item1.status == "completed"
        assert item1.pipeline_job_id == "pipe-job-e2e"

    asyncio.run(_run())

