"""Portable text overlay rendering, independent of ML model imports."""
import os
import subprocess
import tempfile
import gpu_decode
from ffmpeg_utils import video_encode_args, QUALITY, METADATA_SCRUB

# Map font IDs (sent from the browser) to Windows system font paths.
# Legacy system fonts fall back to the bundled Anton face on other platforms.
_FONT_PATHS = {
    "impact":   r"C:\Windows\Fonts\impact.ttf",
    "arial":    r"C:\Windows\Fonts\arial.ttf",
    "arialbd":  r"C:\Windows\Fonts\arialbd.ttf",
    "ariblk":   r"C:\Windows\Fonts\ariblk.ttf",
    "calibri":  r"C:\Windows\Fonts\calibri.ttf",
    "bahnschrift": r"C:\Windows\Fonts\bahnschrift.ttf",
    "comic":    r"C:\Windows\Fonts\comic.ttf",
    "consola":  r"C:\Windows\Fonts\consola.ttf",
    "candara":  r"C:\Windows\Fonts\Candara.ttf",
}
_FONT_FALLBACK = os.path.join(os.path.dirname(__file__), "fonts", "Anton-Regular.ttf")
_FONT_PATHS.update({name: os.path.join(os.path.dirname(__file__), "fonts", file) for name, file in {
    "anton": "Anton-Regular.ttf", "montserrat": "Montserrat-ExtraBold.ttf", "inter": "InterDisplay-Medium.otf",
}.items()})


def _resolve_font(font_id: str) -> str:
    path = _FONT_PATHS.get((font_id or "arial").lower(), _FONT_FALLBACK)
    return path if os.path.exists(path) else _FONT_FALLBACK


def apply_text_overlays(video_path: str, output_path: str, overlays: list) -> bool:
    with tempfile.TemporaryDirectory(prefix="shortly-text-") as text_dir:
        return _apply_text_overlays(video_path, output_path, overlays, text_dir)


def _apply_text_overlays(video_path: str, output_path: str, overlays: list, text_dir: str) -> bool:
    """Burn text overlays into a video clip via FFmpeg drawtext filter.

    Each overlay dict:
        text, x_pct, y_pct, font_size (px at 1080-width equiv),
        font_id, color (#rrggbb), bold (bool), italic (bool),
        bg_color (optional, e.g. '#000000'), bg_opacity (0–1)
    """
    if not overlays:
        return False
    try:
        probe = subprocess.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", video_path],
            stderr=subprocess.STDOUT, timeout=60,
        ).decode().strip().split("x")
        vw, vh = int(probe[0]), int(probe[1])
    except Exception as e:
        print(f"   ⚠️ Could not probe clip for text overlays ({e})")
        return False

    # Build a chain of drawtext filters
    dt_parts = []
    for ov in overlays:
        raw_text = ov.get("text", "").strip()
        if not raw_text:
            continue
        # A text file avoids filtergraph parsing of quotes, commas and newlines.
        text_file = os.path.join(text_dir, f"{len(dt_parts)}.txt")
        with open(text_file, "w", encoding="utf-8") as handle:
            handle.write(raw_text)
        escaped_path = text_file.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
        x_pct = float(ov.get("x_pct", 0.5))
        y_pct = float(ov.get("y_pct", 0.1))
        # font_size is specified relative to 1080px width; scale to actual vw
        base_size = int(ov.get("font_size", 60))
        px_size = max(1, int(base_size * vw / 1080))

        hex_color = (ov.get("color") or "#ffffff").lstrip("#")
        if len(hex_color) == 3:
            hex_color = "".join(c * 2 for c in hex_color)
        ff_color = f"0x{hex_color}FF"

        # Bold → try bold variant font if font_id is base name
        font_id = ov.get("font_id", "arial")
        if ov.get("bold") and font_id == "arial":
            font_id = "arialbd"
        elif ov.get("bold") and font_id == "ariblk":
            font_id = "ariblk"  # already black
        font_path = _resolve_font(font_id).replace("\\", "/").replace(":", "\\:")

        # x/y: percentage of video dimension, with text centered at that point
        x_expr = f"(w*{x_pct:.4f}-text_w/2)"
        y_expr = f"(h*{y_pct:.4f}-text_h/2)"
        # Clamp to stay inside frame
        x_expr = f"max(4,min(w-text_w-4,{x_expr}))"
        y_expr = f"max(4,min(h-text_h-4,{y_expr}))"

        dt = (
            f"drawtext=fontfile='{font_path}'"
            f":textfile='{escaped_path}':expansion=none"
            f":x='{x_expr}':y='{y_expr}'"
            f":fontsize={px_size}"
            f":fontcolor={ff_color}"
            f":shadowcolor=0x00000088:shadowx=2:shadowy=2"
        )
        bg_color = ov.get("bg_color")
        bg_opacity = float(ov.get("bg_opacity", 0.0))
        if bg_color and bg_opacity > 0.01:
            bg_hex = bg_color.lstrip("#")
            if len(bg_hex) == 3:
                bg_hex = "".join(c * 2 for c in bg_hex)
            alpha_int = int(bg_opacity * 255)
            dt += (
                f":box=1:boxcolor=0x{bg_hex}{alpha_int:02X}"
                f":boxborderw=8"
            )
        dt_parts.append(dt)

    if not dt_parts:
        return False

    vf = ",".join(dt_parts)
    tmp_path = output_path + ".txt.mp4"
    cmd = ["ffmpeg", "-y", "-i", video_path,
           "-vf", vf,
           *video_encode_args(QUALITY), "-c:a", "copy", *METADATA_SCRUB,
           "-movflags", "+faststart", tmp_path]
    result = gpu_decode.run(
        lambda on_gpu: gpu_decode.on_card(cmd, video_path) if on_gpu else cmd,
        lambda c: subprocess.run(c, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=1800),
        ok=lambda r: r.returncode == 0 and os.path.exists(tmp_path),
        path=video_path)
    if result.returncode == 0 and os.path.exists(tmp_path):
        os.replace(tmp_path, output_path)
        return True
    err = (result.stderr or b"").decode(errors="ignore")[-400:]
    print(f"   ⚠️ Text overlay pass failed: {err}")
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    return False

