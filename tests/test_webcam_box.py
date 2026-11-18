"""Tests for Webcam Tracing Box, 4-Corner Auto Check, and Skipper/Clip Studio wiring."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

import camera_inset
import publishing_routes


def test_custom_box_skips_ml_and_converts_pixels(monkeypatch):
    # Ensure VideoCapture is NEVER called when webcam_mode == 'custom' with a valid box
    import cv2

    def boom(*args, **kwargs):
        raise AssertionError("VideoCapture should not be invoked for custom tracing box")

    monkeypatch.setattr(cv2, "VideoCapture", boom)

    px = camera_inset.resolve_webcam_box(
        "nonexistent.mp4",
        1920,
        1080,
        webcam_mode="custom",
        webcam_box={"x": 0.70, "y": 0.65, "w": 0.25, "h": 0.30},
    )
    assert px == (1344, 702, 480, 324)


def test_none_mode_returns_none_without_opening_video(monkeypatch):
    import cv2

    def boom(*args, **kwargs):
        raise AssertionError("VideoCapture should not be invoked for webcam_mode='none'")

    monkeypatch.setattr(cv2, "VideoCapture", boom)
    assert camera_inset.resolve_webcam_box("nonexistent.mp4", 1920, 1080, webcam_mode="none") is None


def test_mirror_webcam_config_flips_corners_and_custom_box():
    m_mode, m_box = camera_inset.mirror_webcam_config("top_left", None)
    assert m_mode == "top_right"
    assert m_box is None

    m_mode2, m_box2 = camera_inset.mirror_webcam_config("bottom_right", None)
    assert m_mode2 == "bottom_left"
    assert m_box2 is None

    c_mode, c_box = camera_inset.mirror_webcam_config(
        "custom", {"x": 0.70, "y": 0.65, "w": 0.25, "h": 0.30}
    )
    assert c_mode == "custom"
    assert c_box == {"x": 0.05, "y": 0.65, "w": 0.25, "h": 0.30}


def test_corner_rois_exclude_center_gameplay_character():
    # Center gameplay character at (0.45..0.55, 0.45..0.55) must not overlap any of the 4 corner ROIs
    cx, cy = 0.50, 0.50
    for name, (xf, yf, wf, hf) in camera_inset.CORNER_ROIS.items():
        inside_x = xf <= cx <= xf + wf
        inside_y = yf <= cy <= yf + hf
        assert not (inside_x and inside_y), f"Corner ROI {name} overlaps screen center!"


def test_pinned_corner_fallback_when_video_cannot_open():
    tl = camera_inset.resolve_webcam_box("does_not_exist.mp4", 1920, 1080, webcam_mode="top_left")
    assert tl[0] == 0 and tl[1] == 0 and tl[2] > 0 and tl[3] > 0

    br = camera_inset.resolve_webcam_box("does_not_exist.mp4", 1920, 1080, webcam_mode="bottom_right")
    assert br[0] + br[2] == 1920 and br[1] + br[3] == 1080


def test_skipper_api_persists_webcam_mode_and_custom_box(tmp_path):
    app = FastAPI()
    publishing_routes.install(app, str(tmp_path), lambda: [])
    client = TestClient(app)

    r0 = client.get("/api/publishing/skipper")
    assert r0.status_code == 200
    assert r0.json()["settings"]["skipper_webcam_mode"] == "auto"
    assert r0.json()["settings"]["skipper_webcam_box"] is None

    box = {"x": 0.02, "y": 0.65, "w": 0.28, "h": 0.32}
    r1 = client.put("/api/publishing/skipper", json={"webcam_mode": "custom", "webcam_box": box})
    assert r1.status_code == 200
    assert r1.json()["skipper_webcam_mode"] == "custom"
    assert r1.json()["skipper_webcam_box"] == box

    r2 = client.get("/api/publishing/skipper")
    assert r2.status_code == 200
    assert r2.json()["settings"]["skipper_webcam_mode"] == "custom"
    assert r2.json()["settings"]["skipper_webcam_box"] == box

    r3 = client.put("/api/publishing/skipper", json={"webcam_mode": "top_left", "webcam_box": None})
    assert r3.status_code == 200
    assert r3.json()["skipper_webcam_mode"] == "top_left"
    assert r3.json()["skipper_webcam_box"] is None
