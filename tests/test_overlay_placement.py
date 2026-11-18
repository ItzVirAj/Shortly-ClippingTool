import os
import re
from unittest.mock import patch

import hooks
import main
import subtitles


def test_hook_overlay_y_presets_and_custom_ratio():
    # 1920px tall vertical frame, 120px tall hook box
    very_top_y = hooks.compute_hook_overlay_y(1920, 120, position="very_top")
    top_y = hooks.compute_hook_overlay_y(1920, 120, position="top")
    center_y = hooks.compute_hook_overlay_y(1920, 120, position="center")
    bottom_y = hooks.compute_hook_overlay_y(1920, 120, position="bottom")

    assert 12 <= very_top_y < 100
    assert very_top_y < top_y < center_y < bottom_y
    assert center_y == (1920 - 120) // 2

    # Explicit dragged y_ratio centers the box around y_ratio * video_height
    custom_mid = hooks.compute_hook_overlay_y(1920, 120, position="custom", y_ratio=0.30)
    assert custom_mid == round(1920 * 0.30 - 60)

    # Extreme values clamp safely inside [0, video_height - box_h]
    assert hooks.compute_hook_overlay_y(1920, 120, y_ratio=0.0) == 0
    assert hooks.compute_hook_overlay_y(1920, 120, y_ratio=1.0) == 1920 - 120


def test_subtitle_vertical_placement_and_ass_generation(tmp_path):
    transcript = {
        "segments": [
            {
                "start": 0.0,
                "end": 1.5,
                "words": [
                    {"word": "WAIT", "start": 0.0, "end": 0.5},
                    {"word": "WHAT", "start": 0.5, "end": 1.0},
                    {"word": "HAPPENED", "start": 1.0, "end": 1.5},
                ],
            }
        ]
    }

    # Dragged near top (y_ratio=0.15) should use alignment=8 and ignore split_ranges seam override
    top_ass = tmp_path / "top.ass"
    assert subtitles.generate_ass(
        transcript,
        0.0,
        2.0,
        str(top_ass),
        fontsize=60,
        split_ranges=[(0.0, 2.0)],
        y_ratio=0.15,
    )
    content = top_ass.read_text(encoding="utf-8-sig")
    m = re.search(r"Style: Default,[^,]+,(\d+),.*,(\d+),10,10,(\d+),1", content)
    assert m, f"Default style line missing in:\n{content}"
    fontsize, alignment, margin_v = map(int, m.groups())
    assert fontsize == int(60 * 0.85)
    assert alignment == 8
    assert 4 <= margin_v < 50
    assert "{\\an5}" not in content

    # Dragged near bottom (y_ratio=0.80) should use alignment=2
    bot_ass = tmp_path / "bot.ass"
    assert subtitles.generate_ass(
        transcript,
        0.0,
        2.0,
        str(bot_ass),
        fontsize=44,
        y_ratio=0.80,
    )
    bot_content = bot_ass.read_text(encoding="utf-8-sig")
    m2 = re.search(r"Style: Default,[^,]+,(\d+),.*,(\d+),10,10,(\d+),1", bot_content)
    assert m2
    _, bot_align, bot_mv = map(int, m2.groups())
    assert bot_align == 2
    assert 25 <= bot_mv <= 55


def test_auto_caption_clip_respects_env_placement_and_scale(tmp_path, monkeypatch):
    clip_path = tmp_path / "clip.mp4"
    clip_path.write_bytes(b"")
    transcript = {
        "segments": [
            {
                "start": 0.0,
                "end": 1.2,
                "words": [
                    {"word": "BRO", "start": 0.0, "end": 0.6},
                    {"word": "NO", "start": 0.6, "end": 1.2},
                ],
            }
        ]
    }
    monkeypatch.setenv("SUBTITLE_POSITION", "custom")
    monkeypatch.setenv("SUBTITLE_Y", "0.22")
    monkeypatch.setenv("SUBTITLE_SCALE", "1.4")
    monkeypatch.setenv("SUBTITLE_COLOR", "#FFFFFF")
    monkeypatch.setenv("SUBTITLE_HIGHLIGHT_COLOR", "#E31084")

    res = main.auto_caption_clip(str(clip_path), transcript, 0.0, 2.0, plan_only=True, split_ranges=[(0.0, 2.0)])
    assert res is not None
    ass_files = list(tmp_path.glob("autosubs_*.ass"))
    assert len(ass_files) == 1
    content = ass_files[0].read_text(encoding="utf-8-sig")
    m = re.search(r"Style: Default,[^,]+,(\d+),.*,(\d+),10,10,(\d+),1", content)
    assert m
    fontsize, alignment, _ = map(int, m.groups())
    expected_scaled = int(round(subtitles.AUTO_CAPTION_STYLE["font_size"] * 1.4))
    assert fontsize == int(expected_scaled * 0.85)
    assert alignment == 8
    assert "{\\an5}" not in content
    # #E31084 in ASS BBGGRR format is &H8410E3&
    assert "&H8410E3&" in content


def test_auto_hook_clip_forwards_position_y_and_scale(tmp_path, monkeypatch):
    clip_path = tmp_path / "clip.mp4"
    clip_path.write_bytes(b"")
    monkeypatch.setenv("AUTO_HOOK_STYLE", "pill")
    monkeypatch.setenv("AUTO_HOOK_POSITION", "custom")
    monkeypatch.setenv("AUTO_HOOK_Y", "0.08")
    monkeypatch.setenv("AUTO_HOOK_SCALE", "1.35")

    captured = {}

    def fake_add_hook(video_path, text, output_path, **kwargs):
        captured["text"] = text
        captured.update(kwargs)
        return True

    with patch("hooks.add_hook_to_video", side_effect=fake_add_hook):
        res = main.auto_hook_clip(str(clip_path), {"viral_hook_text": "KRYO broke GTA 😱"})

    assert res is not None
    _, cfg = res
    assert captured["position"] == "custom"
    assert abs(captured["y_ratio"] - 0.08) < 1e-6
    assert abs(captured["font_scale"] - 1.35) < 1e-6
    assert cfg["position"] == "custom"
    assert abs(cfg["y"] - 0.08) < 1e-6
    assert abs(cfg["font_scale"] - 1.35) < 1e-6


def test_brand_frame_handle_cleaning_and_compositing(tmp_path):
    assert main.clean_frame_handle("") == ""
    assert main.clean_frame_handle("https://kick.com/kryoplays") == "KRYOPLAYS"
    assert main.clean_frame_handle("twitch.tv/xqc") == "XQC"
    assert main.clean_frame_handle("/@streamername") == "@STREAMERNAME"

    # Empty handle returns the original asset with is_temp=False
    orig_path, is_temp = main.render_brand_frame_image("kick", "")
    assert orig_path and os.path.exists(orig_path)
    assert is_temp is False

    # Non-empty handle composites crisp white text into the black bar on all 4 frames
    from PIL import Image
    for ft in ("kick", "youtube", "twitch", "instagram"):
        out_png = tmp_path / f"framed_{ft}.png"
        rendered_path, temp_flag = main.render_brand_frame_image(ft, "KRYOPLAYS", output_path=str(out_png))
        assert rendered_path == str(out_png)
        assert temp_flag is False
        assert out_png.exists()

        im = Image.open(out_png).convert("RGBA")
        w, h = im.size
        x_start_r, y_top_r, y_bot_r, x_max_r = main.FRAME_ASSETS[ft]["text_box"]
        px = im.load()
        white_pixels = 0
        for x in range(int(w * x_start_r), int(w * x_max_r)):
            for y in range(int(h * y_top_r), int(h * y_bot_r)):
                r, g, b, a = px[x, y]
                if r > 220 and g > 220 and b > 220 and a > 220:
                    white_pixels += 1
        assert white_pixels > 50, f"Expected handle text pixels in {ft} frame bar"

