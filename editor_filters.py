"""FFmpeg filter generation and capability detection for the video editor."""
import subprocess
import math

_REQUIRED_FILTERS = [
    'overlay', 'scale', 'rotate', 'eq', 'hue', 'colorchannelmixer',
    'boxblur', 'fade', 'afade', 'atempo', 'amix', 'adelay',
    'volume', 'trim', 'atrim', 'setpts', 'apad'
]

_FILTER_CACHE = None

def check_ffmpeg_filters():
    global _FILTER_CACHE
    if _FILTER_CACHE is not None:
        return _FILTER_CACHE
    try:
        proc = subprocess.run(['ffmpeg', '-filters'], capture_output=True, text=True, timeout=15)
        out = proc.stdout or ''
        missing = [f for f in _REQUIRED_FILTERS if f not in out]
        _FILTER_CACHE = (len(missing) == 0, missing)
    except Exception as e:
        _FILTER_CACHE = (False, _REQUIRED_FILTERS)
    return _FILTER_CACHE

def build_audio_chain(clip, in_label, out_label):
    start = max(0.0, float(clip.get("start", 0)))
    dur = max(0.1, float(clip.get("duration", 0)))
    in_pt = max(0.0, float(clip.get("inPoint", 0)))
    speed = max(0.25, min(4.0, float(clip.get("speed", 1.0))))
    vol = max(0.0, min(2.0, float(clip.get("volume", 1.0))))
    props = clip.get("props", {})
    fade_in = max(0.0, float(props.get("fadeIn", 0.0)))
    fade_out = max(0.0, float(props.get("fadeOut", 0.0)))

    src_len = dur * speed
    filters = [f"atrim=start={in_pt:.3f}:duration={src_len:.3f}", "asetpts=PTS-STARTPTS"]

    # Chain atempo (each stage must be between 0.5 and 2.0)
    rem_speed = speed
    while rem_speed > 2.0:
        filters.append("atempo=2.0")
        rem_speed /= 2.0
    while rem_speed < 0.5:
        filters.append("atempo=0.5")
        rem_speed /= 0.5
    if abs(rem_speed - 1.0) > 1e-3:
        filters.append(f"atempo={rem_speed:.3f}")

    if abs(vol - 1.0) > 1e-3:
        filters.append(f"volume={vol:.3f}")

    if fade_in > 0:
        fi = min(fade_in, dur)
        filters.append(f"afade=t=in:st=0:d={fi:.3f}")
    if fade_out > 0:
        fo = min(fade_out, dur)
        filters.append(f"afade=t=out:st={(dur - fo):.3f}:d={fo:.3f}")

    delay_ms = int(round(start * 1000))
    if delay_ms > 0:
        filters.append(f"adelay={delay_ms}|{delay_ms}")

    return f"{in_label}" + ",".join(filters) + f"{out_label}"

def build_visual_chain(clip, in_label, out_label, stage_w, stage_h, warnings):
    props = clip.get("props", {})
    start = max(0.0, float(clip.get("start", 0)))
    dur = max(0.1, float(clip.get("duration", 0)))
    in_pt = max(0.0, float(clip.get("inPoint", 0)))
    speed = max(0.25, min(4.0, float(clip.get("speed", 1.0))))
    opacity = max(0.0, min(1.0, float(clip.get("opacity", 1.0))))
    fit = props.get("fit", "contain")
    flip_h = bool(props.get("flipH"))
    flip_v = bool(props.get("flipV"))
    tf = props.get("transform", {})
    base_scale = max(10, min(500, float(tf.get("scale", 100)))) / 100.0
    rot = float(tf.get("rotation", 0))

    filters = []
    # 1. Trim & speed
    if clip.get("type") == "video":
        src_len = dur * speed
        filters.append(f"trim=start={in_pt:.3f}:duration={src_len:.3f}")
        if abs(speed - 1.0) > 1e-3:
            filters.append(f"setpts=(PTS-STARTPTS)/{speed:.3f}")
        else:
            filters.append("setpts=PTS-STARTPTS")

    # 2. Fit to stage
    if fit == "cover":
        filters.append(f"scale={stage_w}:{stage_h}:force_original_aspect_ratio=increase,crop={stage_w}:{stage_h}")
    elif fit == "fill":
        filters.append(f"scale={stage_w}:{stage_h}")
    else:  # contain
        filters.append(f"scale={stage_w}:{stage_h}:force_original_aspect_ratio=decrease")

    # 3. Flips
    if flip_h: filters.append("hflip")
    if flip_v: filters.append("vflip")

    # Dynamic scaling for Motion and Zoom transitions
    motion = props.get("motion", {})
    m_type = motion.get("type", "none")
    m_amt = float(motion.get("amount", 20)) / 100.0
    t_in = props.get("transitionIn", {})
    t_out = props.get("transitionOut", {})
    raw_in = float(t_in.get("duration", 0.5)) if t_in.get("type") and t_in.get("type") != "none" else 0.0
    raw_out = float(t_out.get("duration", 0.5)) if t_out.get("type") and t_out.get("type") != "none" else 0.0

    if raw_in + raw_out > dur and (raw_in + raw_out) > 0:
        fac = dur / (raw_in + raw_out)
        raw_in *= fac
        raw_out *= fac

    has_zoom_in = t_in.get("type") == "zoom" and raw_in > 0
    has_zoom_out = t_out.get("type") == "zoom" and raw_out > 0
    has_motion = m_type in ("zoomIn", "zoomOut", "punch") and m_amt > 0

    if has_motion or has_zoom_in or has_zoom_out:
        parts = [f"{base_scale:.4f}"]
        if has_motion:
            if m_type == "zoomIn":
                parts.append(f"(1.0+{m_amt:.3f}*min(max(t/{dur:.3f},0),1))")
            elif m_type == "zoomOut":
                parts.append(f"(1.0+{m_amt:.3f}*(1.0-min(max(t/{dur:.3f},0),1)))")
            elif m_type == "punch":
                parts.append(f"(1.0+{m_amt:.3f}*(1.0-pow(1.0-min(max(t/0.4,0),1),3)))")
        if has_zoom_in:
            parts.append(f"(0.5+0.5*(1.0-pow(1.0-min(max(t/{raw_in:.3f},0),1),3)))")
        if has_zoom_out:
            parts.append(f"(0.5+0.5*(1.0-pow(1.0-min(max(({dur:.3f}-t)/{raw_out:.3f},0),1),3)))")
        expr = "*".join(parts)
        filters.append(f"scale=eval=frame:w='trunc(iw*{expr}/2)*2':h='trunc(ih*{expr}/2)*2'")
    elif abs(base_scale - 1.0) > 1e-3:
        filters.append(f"scale=trunc(iw*{base_scale:.4f}/2)*2:trunc(ih*{base_scale:.4f}/2)*2")

    # Rotation
    if abs(rot) > 1e-3:
        rad = rot * math.pi / 180.0
        filters.append(f"format=rgba,rotate={rad:.4f}:c=none:ow=rotw({rad:.4f}):oh=roth({rad:.4f})")

    # 4. Color / Look
    br = (float(props.get("brightness", 100)) - 100.0) / 100.0
    ct = float(props.get("contrast", 100)) / 100.0
    sat = float(props.get("saturation", 100)) / 100.0
    look = props.get("look", {})
    gray = float(look.get("grayscale", 0)) / 100.0
    sep = float(look.get("sepia", 0)) / 100.0
    hue_deg = float(look.get("hueRotate", 0))
    blur = float(props.get("blur", 0))

    if gray > 0: sat *= (1.0 - gray)
    if abs(br) > 1e-3 or abs(ct - 1.0) > 1e-3 or abs(sat - 1.0) > 1e-3:
        filters.append(f"eq=brightness={br:.3f}:contrast={ct:.3f}:saturation={sat:.3f}")
    if abs(hue_deg) > 1e-3:
        filters.append(f"hue=h={hue_deg:.1f}")
    if sep > 0:
        rr = (1 - sep) + 0.393 * sep; rg = 0.769 * sep; rb = 0.189 * sep
        gr = 0.349 * sep; gg = (1 - sep) + 0.686 * sep; gb = 0.168 * sep
        br_ = 0.272 * sep; bg_ = 0.534 * sep; bb = (1 - sep) + 0.131 * sep
        filters.append(f"colorchannelmixer={rr:.3f}:{rg:.3f}:{rb:.3f}:0:{gr:.3f}:{gg:.3f}:{gb:.3f}:0:{br_:.3f}:{bg_:.3f}:{bb:.3f}")
    if blur > 0:
        b_rad = max(1, min(int(blur * (stage_w / 1080.0)), 30))
        filters.append(f"boxblur={b_rad}:1")

    # 5. Opacity & Fades
    filters.append("format=rgba")
    if opacity < 0.999:
        filters.append(f"colorchannelmixer=aa={opacity:.3f}")
    fade_in = max(0.0, float(props.get("fadeIn", 0.0)))
    fade_out = max(0.0, float(props.get("fadeOut", 0.0)))
    if t_in.get("type") in ("fade", "zoom") and raw_in > 0:
        fade_in = max(fade_in, raw_in)
    if t_out.get("type") in ("fade", "zoom") and raw_out > 0:
        fade_out = max(fade_out, raw_out)
    if fade_in > 0:
        filters.append(f"fade=t=in:st=0:d={min(fade_in, dur):.3f}:alpha=1")
    if fade_out > 0:
        filters.append(f"fade=t=out:st={(dur - min(fade_out, dur)):.3f}:d={min(fade_out, dur):.3f}:alpha=1")

    # Shift PTS to timeline start for overlay enable sync
    filters.append(f"setpts=PTS-STARTPTS+{start:.3f}/TB")
    return f"{in_label}" + ",".join(filters) + f"{out_label}"

def build_overlay_expr(clip, stage_w, stage_h):
    props = clip.get("props", {})
    start = max(0.0, float(clip.get("start", 0)))
    dur = max(0.1, float(clip.get("duration", 0)))
    end = start + dur
    tf = props.get("transform", {})
    tx = float(tf.get("x", 0)) * (stage_w / 1080.0)
    ty = float(tf.get("y", 0)) * (stage_h / 1920.0)

    t_in = props.get("transitionIn", {})
    t_out = props.get("transitionOut", {})
    raw_in = float(t_in.get("duration", 0.5)) if t_in.get("type") and t_in.get("type") != "none" else 0.0
    raw_out = float(t_out.get("duration", 0.5)) if t_out.get("type") and t_out.get("type") != "none" else 0.0
    if raw_in + raw_out > dur and (raw_in + raw_out) > 0:
        fac = dur / (raw_in + raw_out)
        raw_in *= fac; raw_out *= fac

    x_expr = f"(W-w)/2+{tx:.1f}"
    y_expr = f"(H-h)/2+{ty:.1f}"

    if t_in.get("type") == "slideLeft" and raw_in > 0:
        x_expr += f"-{stage_w}*pow(1.0-min(max((t-{start:.3f})/{raw_in:.3f},0),1),3)"
    elif t_in.get("type") == "slideRight" and raw_in > 0:
        x_expr += f"+{stage_w}*pow(1.0-min(max((t-{start:.3f})/{raw_in:.3f},0),1),3)"
    elif t_in.get("type") == "slideUp" and raw_in > 0:
        y_expr += f"+{stage_h}*pow(1.0-min(max((t-{start:.3f})/{raw_in:.3f},0),1),3)"

    if t_out.get("type") == "slideLeft" and raw_out > 0:
        x_expr += f"-{stage_w}*pow(1.0-min(max(({end:.3f}-t)/{raw_out:.3f},0),1),3)"
    elif t_out.get("type") == "slideRight" and raw_out > 0:
        x_expr += f"+{stage_w}*pow(1.0-min(max(({end:.3f}-t)/{raw_out:.3f},0),1),3)"
    elif t_out.get("type") == "slideUp" and raw_out > 0:
        y_expr += f"+{stage_h}*pow(1.0-min(max(({end:.3f}-t)/{raw_out:.3f},0),1),3)"

    return f"x='{x_expr}':y='{y_expr}':enable='between(t,{start:.3f},{end:.3f})':eof_action=pass"

