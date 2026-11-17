import os
import subprocess
import pytest
from PIL import Image
import numpy as np

from main import kick_watermark_path, kick_frame_filter, apply_kick_frame


def test_kick_watermark_asset_exists():
    path = kick_watermark_path()
    assert os.path.exists(path), f"Kick watermark asset not found: {path}"
    with Image.open(path) as img:
        assert img.size == (1080, 1080)
        assert img.mode == "RGBA"
        bbox = img.getbbox()
        # Verify the banner sits in the bottom area
        assert bbox[1] >= 900
        assert bbox[2] == 1080
        assert bbox[3] == 1080


def test_kick_frame_filter_syntax():
    f = kick_frame_filter(1080, 1920)
    assert "[1:v]crop=1080:101:0:979,scale=1080:-1,format=rgba[wm]" in f
    assert "[0:v][wm]overlay=x=0:y=main_h-overlay_h" in f


def test_apply_kick_frame_on_synthetic_video(tmp_path):
    # 1. Create a 1-second 1080x1920 synthetic test video
    input_vid = str(tmp_path / "test_input.mp4")
    output_vid = str(tmp_path / "test_output.mp4")

    cmd_make = [
        "ffmpeg", "-y", "-f", "lavfi",
        "-i", "color=c=navy:s=1080x1920:d=1",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        input_vid
    ]
    subprocess.run(cmd_make, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert os.path.exists(input_vid)

    # 2. Apply Kick frame
    ok = apply_kick_frame(input_vid, output_vid)
    assert ok is True
    assert os.path.exists(output_vid)
    assert os.path.getsize(output_vid) > 0

    # 3. Extract a frame and inspect the bottom 100 pixels
    frame_path = str(tmp_path / "frame.png")
    cmd_extract = ["ffmpeg", "-y", "-i", output_vid, "-vframes", "1", frame_path]
    subprocess.run(cmd_extract, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    assert os.path.exists(frame_path)

    with Image.open(frame_path) as im:
        assert im.size == (1080, 1920)
        # Check bottom banner area
        bottom_crop = im.crop((0, 1920 - 100, 1080, 1920))
        arr = np.array(bottom_crop)
        # Check for non-navy pixels in bottom banner (Kick logo has green/white)
        # Navy background is approximately [0, 0, 128]
        non_navy = (arr[:, :, 0] > 10) | (arr[:, :, 1] > 10)
        assert np.count_nonzero(non_navy) > 1000, "Kick banner was not visible on the composite!"
