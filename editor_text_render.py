"""Text and shape clip rendering to transparent PNGs with Pillow."""
import os
import re
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

try:
    from hooks import _load_emoji_font, _split_emoji_runs, _draw_mixed, _measure_width
except ImportError:
    _load_emoji_font = None
    _split_emoji_runs = None
    _draw_mixed = None
    _measure_width = None

FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
AVAILABLE_FONTS = {
    "montserrat": os.path.join(FONTS_DIR, "Montserrat-ExtraBold.ttf"),
    "anton": os.path.join(FONTS_DIR, "Anton-Regular.ttf"),
    "noto serif": os.path.join(FONTS_DIR, "NotoSerif-Bold.ttf"),
}

def hex_to_rgba(hex_str, opacity_pct=100):
    hex_clean = str(hex_str or "#000000").lstrip("#")
    if len(hex_clean) == 3:
        hex_clean = "".join(c * 2 for c in hex_clean)
    if len(hex_clean) == 8:
        r, g, b, a = [int(hex_clean[i:i+2], 16) for i in (0, 2, 4, 6)]
        alpha = int(a * (max(0, min(100, opacity_pct)) / 100.0))
        return (r, g, b, alpha)
    if len(hex_clean) != 6:
        hex_clean = "000000"
    r = int(hex_clean[0:2], 16)
    g = int(hex_clean[2:4], 16)
    b = int(hex_clean[4:6], 16)
    alpha = int(255 * (max(0, min(100, opacity_pct)) / 100.0))
    return (r, g, b, alpha)

def resolve_font(font_family, size, is_italic, warnings):
    fam_key = str(font_family or "montserrat").strip().lower()
    path = AVAILABLE_FONTS.get(fam_key)
    if not path or not os.path.exists(path):
        warnings.append(f"Font '{font_family}' not found in fonts directory, mapped to Montserrat.")
        path = AVAILABLE_FONTS["montserrat"]
    if is_italic and fam_key in ("montserrat", "anton"):
        warnings.append(f"Italic variant for '{font_family}' not found on disk; rendered standard font.")
    try:
        return ImageFont.truetype(path, int(max(8, min(size, 500))))
    except Exception:
        return ImageFont.load_default()

def wrap_text_lines(text, font, max_width, emoji_font=None):
    lines = []
    dummy = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    for paragraph in text.split("\n"):
        words = paragraph.split(" ")
        curr = ""
        for word in words:
            test = f"{curr} {word}".strip()
            w = _measure_width(dummy, test, font, emoji_font) if _measure_width else dummy.textlength(test, font=font)
            if w <= max_width or not curr:
                curr = test
            else:
                lines.append(curr)
                curr = word
        if curr:
            lines.append(curr)
    return lines or [text]

def render_text_clip_to_png(clip, out_path, stage_w, stage_h, warnings):
    props = clip.get("props", {})
    style = props.get("style", {})
    bg = props.get("bg", {})
    stroke = props.get("stroke", {})
    shadow = props.get("shadow", {})

    raw_text = str(props.get("text", "Your text here"))
    if style.get("uppercase"):
        raw_text = raw_text.upper()

    font_size = int(style.get("fontSize", 72) * (stage_w / 1080.0))
    font = resolve_font(style.get("fontFamily"), font_size, style.get("italic"), warnings)
    emoji_font = _load_emoji_font(font_size) if _load_emoji_font else None

    box_w = int(style.get("boxWidth", 900) * (stage_w / 1080.0))
    bg_padding = int(bg.get("padding", 24) * (stage_w / 1080.0)) if bg.get("enabled") else 0
    max_text_w = max(50, box_w - 2 * bg_padding)
    lines = wrap_text_lines(raw_text, font, max_text_w, emoji_font)

    line_h = font_size * float(style.get("lineHeight", 1.2))
    total_text_h = len(lines) * line_h
    total_box_h = total_text_h + 2 * bg_padding

    img = Image.new("RGBA", (stage_w, stage_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = stage_w // 2, stage_h // 2
    box_left = cx - (box_w // 2)
    box_top = cy - int(total_box_h // 2)

    if bg.get("enabled"):
        bg_col = hex_to_rgba(bg.get("color", "#000000"), bg.get("opacity", 100))
        bg_rad = int(bg.get("radius", 24) * (stage_w / 1080.0))
        draw.rounded_rectangle([box_left, box_top, box_left + box_w, box_top + total_box_h],
                               radius=bg_rad, fill=bg_col)

    text_color = hex_to_rgba(style.get("color", "#FFFFFF"), 100)
    stroke_w = int(stroke.get("width", 0) * (stage_w / 1080.0)) if stroke.get("enabled") else 0
    stroke_col = hex_to_rgba(stroke.get("color", "#000000"), 100) if stroke_w else None
    align = style.get("align", "center")

    if shadow.get("enabled"):
        s_blur = max(1, int(shadow.get("blur", 8) * (stage_w / 1080.0)))
        s_ox = int(shadow.get("offsetX", 0) * (stage_w / 1080.0))
        s_oy = int(shadow.get("offsetY", 4) * (stage_w / 1080.0))
        s_col = hex_to_rgba(shadow.get("color", "#000000"), 100)
        s_img = Image.new("RGBA", (stage_w, stage_h), (0, 0, 0, 0))
        s_draw = ImageDraw.Draw(s_img)
        for i, line in enumerate(lines):
            lw = _measure_width(s_draw, line, font, emoji_font) if _measure_width else s_draw.textlength(line, font=font)
            lx = box_left + bg_padding if align == "left" else (box_left + box_w - bg_padding - lw if align == "right" else cx - (lw / 2))
            ly = box_top + bg_padding + (i * line_h)
            s_draw.text((lx + s_ox, ly + s_oy), line, font=font, fill=s_col)
        img.alpha_composite(s_img.filter(ImageFilter.GaussianBlur(s_blur / 2.0)))

    for i, line in enumerate(lines):
        lw = _measure_width(draw, line, font, emoji_font) if _measure_width else draw.textlength(line, font=font)
        lx = box_left + bg_padding if align == "left" else (box_left + box_w - bg_padding - lw if align == "right" else cx - (lw / 2))
        ly = box_top + bg_padding + (i * line_h)
        outline_spec = (stroke_col, stroke_w) if stroke_w else None
        if _draw_mixed:
            _draw_mixed(img, draw, (lx, ly), line, font, emoji_font, text_color, outline=outline_spec)
        else:
            if stroke_w:
                draw.text((lx, ly), line, font=font, fill=text_color, stroke_width=stroke_w, stroke_fill=stroke_col)
            else:
                draw.text((lx, ly), line, font=font, fill=text_color)

    img.save(out_path, "PNG")

def render_shape_clip_to_png(clip, out_path, stage_w, stage_h, warnings, fill_only=False, track_only=False):
    shape = clip.get("props", {}).get("shape", {})
    kind = shape.get("kind", "rect")
    w = int(shape.get("width", 400) * (stage_w / 1080.0))
    default_h = 8 if kind == "line" else (12 if kind == "progress" else 400)
    h = int(shape.get("height", default_h) * (stage_w / 1080.0))
    cx, cy = stage_w // 2, stage_h // 2
    l, t = cx - (w // 2), cy - (h // 2)
    r, b = l + w, t + h

    img = Image.new("RGBA", (stage_w, stage_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    stroke = shape.get("stroke", {})
    sw = int(stroke.get("width", 0) * (stage_w / 1080.0)) if stroke.get("enabled") else 0
    scol = hex_to_rgba(stroke.get("color", "#000000"), 100) if sw else None
    fcol = hex_to_rgba(shape.get("fill", "#FFFFFF"), shape.get("fillOpacity", 100))

    if kind == "progress":
        if track_only:
            tcol = hex_to_rgba(shape.get("trackColor", "#FFFFFF4D"), 100)
            draw.rectangle([l, t, r, b], fill=tcol, outline=scol, width=sw)
        else:
            draw.rectangle([l, t, r, b], fill=fcol)
    elif kind == "circle":
        draw.ellipse([l, t, r, b], fill=fcol, outline=scol, width=sw)
    elif kind == "line":
        draw.rectangle([l, t, r, b], fill=fcol, outline=scol, width=sw)
    else:  # rect
        rad = int(shape.get("radius", 0) * (stage_w / 1080.0))
        draw.rounded_rectangle([l, t, r, b], radius=rad, fill=fcol, outline=scol, width=sw)

    img.save(out_path, "PNG")

