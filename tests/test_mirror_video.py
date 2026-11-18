"""Tests for Mirror Video option across Clip Studio, Live Clipper, and Skipper."""
from pathlib import Path
from unittest.mock import MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

import ffmpeg_utils
from live_clipper import skipper
from live_clipper.models import LiveConfig, QueueItem
from live_clipper.queue import ReviewQueue
import publishing_routes


def test_cut_clip_applies_hflip_only_when_mirror_true(monkeypatch, tmp_path):
    recorded_cmds = []

    def fake_run(cmd, **kwargs):
        recorded_cmds.append(list(cmd))
        out_path = Path(cmd[-1])
        out_path.write_bytes(b"0" * (ffmpeg_utils.MIN_CUT_BYTES + 16))
        res = MagicMock()
        res.returncode = 0
        res.stderr = ""
        return res

    monkeypatch.setattr(ffmpeg_utils.subprocess, "run", fake_run)
    monkeypatch.setattr(ffmpeg_utils, "_gpu_cut_ok", lambda _src: False)

    out_plain = tmp_path / "plain.mp4"
    ffmpeg_utils.cut_clip("input.mp4", str(out_plain), 0, 10, 1, mirror=False)
    assert "-vf" not in recorded_cmds[-1]

    out_mirror = tmp_path / "mirrored.mp4"
    ffmpeg_utils.cut_clip("input.mp4", str(out_mirror), 0, 10, 1, mirror=True)
    cmd = recorded_cmds[-1]
    assert "-vf" in cmd
    assert cmd[cmd.index("-vf") + 1] == "hflip"


def test_skipper_build_vertical_filter_mirror_all_layouts():
    # streamer_bottom (landscape)
    flag_plain, expr_plain, _ = skipper.build_vertical_filter(1920, 1080, layout="streamer_bottom", mirror=False)
    flag_mir, expr_mir, _ = skipper.build_vertical_filter(1920, 1080, layout="streamer_bottom", mirror=True)
    assert flag_plain == "-filter_complex"
    assert "hflip" not in expr_plain
    assert flag_mir == "-filter_complex"
    assert expr_mir.endswith(",hflip[v]")

    # blurred_center (landscape)
    flag_bc, expr_bc, _ = skipper.build_vertical_filter(1920, 1080, layout="blurred_center", mirror=True)
    assert flag_bc == "-filter_complex"
    assert expr_bc.endswith(",hflip[v]")

    # portrait fallback
    flag_p, expr_p, _ = skipper.build_vertical_filter(1080, 1920, layout="streamer_bottom", mirror=True)
    assert flag_p == "-vf"
    assert expr_p.endswith(",hflip")


def test_live_config_and_queue_mirror_roundtrip(tmp_path):
    cfg = LiveConfig.from_dict({
        "channel": "testchan",
        "permission_ack": True,
        "mirror_video": True,
    })
    assert cfg.mirror_video is True
    assert cfg.to_dict()["mirror_video"] is True

    item = QueueItem(
        id="item-1",
        session_id="sess-1",
        spike_id="sp-1",
        clip_path=str(tmp_path / "clip.mp4"),
        mirror_video=False,
    )
    Path(item.clip_path).write_bytes(b"fake")
    q = ReviewQueue(data_root=tmp_path)
    q.add_item(item, tmp_path / "sess-1")
    approved = q.approve("item-1", session_dir=tmp_path / "sess-1", mirror_video=True)
    assert approved.mirror_video is True

    reloaded = QueueItem.from_dict(approved.to_dict())
    assert reloaded.mirror_video is True


def test_skipper_api_mirror_setting_toggle(tmp_path):
    app = FastAPI()
    publishing_routes.install(app, str(tmp_path), lambda: [])
    client = TestClient(app)

    r0 = client.get("/api/publishing/skipper")
    assert r0.status_code == 200
    assert r0.json()["settings"]["skipper_mirror"] is False

    r1 = client.put("/api/publishing/skipper", json={"mirror": True})
    assert r1.status_code == 200
    assert r1.json()["skipper_mirror"] is True

    r2 = client.get("/api/publishing/skipper")
    assert r2.status_code == 200
    assert r2.json()["settings"]["skipper_mirror"] is True
