"""Pure rendering pipeline and FFmpeg runner for video editor export."""
import os
import subprocess
import tempfile
import shutil
import math
from editor_filters import (
    check_ffmpeg_filters, build_audio_chain, build_visual_chain, build_overlay_expr
)
from editor_text_render import (
    render_text_clip_to_png, render_shape_clip_to_png
)

def build_render_plan(payload, media_lookup, out_w, out_h, fps, temp_dir):
    warnings = []
    has_filters, missing = check_ffmpeg_filters()
    if not has_filters:
        raise RuntimeError(f"FFmpeg missing required filters: {', '.join(missing)}")

    tracks = payload.get("tracks", [])
    visible_tracks = [t for t in tracks if not t.get("hidden")]

    all_visible_clips = []
    for t in visible_tracks:
        all_visible_clips.extend(t.get("clips", []))

    if not all_visible_clips:
        raise ValueError("No visible clips to export.")

    total_duration = max(float(c.get("start", 0)) + float(c.get("duration", 0)) for c in all_visible_clips)
    total_duration = max(0.1, min(600.0, total_duration))

    inputs = []
    filter_lines = []
    input_idx = 0

    # Layer visual tracks from bottom to top: reverse visible_tracks
    visual_clips_ordered = []
    for track in reversed(visible_tracks):
        for clip in track.get("clips", []):
            if clip.get("type") in ("video", "image", "text", "shape"):
                visual_clips_ordered.append((clip, track))

    # Base black canvas
    filter_lines.append(f"color=c=black:s={out_w}x{out_h}:r={fps}:d={total_duration:.3f}[base_canvas]")
    current_canvas = "[base_canvas]"

    for clip, track in visual_clips_ordered:
        ctype = clip.get("type")
        dur = max(0.1, float(clip.get("duration", 0)))
        start = max(0.0, float(clip.get("start", 0)))

        if ctype == "text":
            png_path = os.path.join(temp_dir, f"text_{clip.get('id')}.png")
            render_text_clip_to_png(clip, png_path, out_w, out_h, warnings)
            inputs.extend(["-loop", "1", "-t", f"{dur:.3f}", "-i", png_path])
            raw_lbl = f"[{input_idx}:v]"
            proc_lbl = f"[v_text_{input_idx}]"
            input_idx += 1
            filter_lines.append(build_visual_chain(clip, raw_lbl, proc_lbl, out_w, out_h, warnings))
            next_canvas = f"[c_{input_idx}]"
            ov_expr = build_overlay_expr(clip, out_w, out_h)
            filter_lines.append(f"{current_canvas}{proc_lbl}overlay={ov_expr}{next_canvas}")
            current_canvas = next_canvas

        elif ctype == "shape":
            shape = clip.get("props", {}).get("shape", {})
            if shape.get("kind") == "progress":
                trk_path = os.path.join(temp_dir, f"shp_trk_{clip.get('id')}.png")
                fill_path = os.path.join(temp_dir, f"shp_fil_{clip.get('id')}.png")
                render_shape_clip_to_png(clip, trk_path, out_w, out_h, warnings, track_only=True)
                render_shape_clip_to_png(clip, fill_path, out_w, out_h, warnings, fill_only=True)
                # 1. Track
                inputs.extend(["-loop", "1", "-t", f"{dur:.3f}", "-i", trk_path])
                trk_raw = f"[{input_idx}:v]"; input_idx += 1
                trk_proc = f"[v_trk_{input_idx}]"
                filter_lines.append(build_visual_chain(clip, trk_raw, trk_proc, out_w, out_h, warnings))
                c_after_trk = f"[c_{input_idx}]"
                filter_lines.append(f"{current_canvas}{trk_proc}overlay={build_overlay_expr(clip, out_w, out_h)}{c_after_trk}")
                # 2. Fill (dynamically scaled width)
                inputs.extend(["-loop", "1", "-t", f"{dur:.3f}", "-i", fill_path])
                fil_raw = f"[{input_idx}:v]"; input_idx += 1
                fil_scaled = f"[v_fil_sc_{input_idx}]"
                filter_lines.append(f"{fil_raw}scale=eval=frame:w='max(2,trunc(iw*min(max((t-{start:.3f})/{dur:.3f},0),1)/2)*2)':h=ih{fil_scaled}")
                fil_proc = f"[v_fil_{input_idx}]"
                filter_lines.append(build_visual_chain(clip, fil_scaled, fil_proc, out_w, out_h, warnings))
                next_canvas = f"[c_{input_idx}]"
                filter_lines.append(f"{c_after_trk}{fil_proc}overlay={build_overlay_expr(clip, out_w, out_h)}{next_canvas}")
                current_canvas = next_canvas
            else:
                png_path = os.path.join(temp_dir, f"shape_{clip.get('id')}.png")
                render_shape_clip_to_png(clip, png_path, out_w, out_h, warnings)
                inputs.extend(["-loop", "1", "-t", f"{dur:.3f}", "-i", png_path])
                raw_lbl = f"[{input_idx}:v]"; proc_lbl = f"[v_shp_{input_idx}]"; input_idx += 1
                filter_lines.append(build_visual_chain(clip, raw_lbl, proc_lbl, out_w, out_h, warnings))
                next_canvas = f"[c_{input_idx}]"
                filter_lines.append(f"{current_canvas}{proc_lbl}overlay={build_overlay_expr(clip, out_w, out_h)}{next_canvas}")
                current_canvas = next_canvas

        elif ctype in ("video", "image"):
            mid = clip.get("mediaId")
            item = media_lookup.get(mid)
            if not item:
                raise ValueError(f"Media file not found for clip: {clip.get('name')}")
            fpath = item["path"]
            if ctype == "image":
                inputs.extend(["-loop", "1", "-t", f"{dur:.3f}", "-i", fpath])
            else:
                inputs.extend(["-i", fpath])
            raw_lbl = f"[{input_idx}:v]"; proc_lbl = f"[v_med_{input_idx}]"; input_idx += 1
            filter_lines.append(build_visual_chain(clip, raw_lbl, proc_lbl, out_w, out_h, warnings))
            next_canvas = f"[c_{input_idx}]"
            filter_lines.append(f"{current_canvas}{proc_lbl}overlay={build_overlay_expr(clip, out_w, out_h)}{next_canvas}")
            current_canvas = next_canvas

    filter_lines.append(f"{current_canvas}null[outv]")

    # Audio pipeline
    audio_labels = []
    for track in visible_tracks:
        if track.get("muted"):
            continue
        for clip in track.get("clips", []):
            mid = clip.get("mediaId")
            item = media_lookup.get(mid) if mid else None
            if not item:
                continue
            ctype = clip.get("type")
            has_aud = item.get("hasAudio")
            if ctype == "audio" or (ctype == "video" and has_aud):
                inputs.extend(["-i", item["path"]])
                raw_a = f"[{input_idx}:a]"
                proc_a = f"[a_{input_idx}]"
                input_idx += 1
                filter_lines.append(build_audio_chain(clip, raw_a, proc_a))
                audio_labels.append(proc_a)

    if not audio_labels:
        filter_lines.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={total_duration:.3f}[outa]")
    elif len(audio_labels) == 1:
        filter_lines.append(f"{audio_labels[0]}atrim=duration={total_duration:.3f}[outa]")
    else:
        all_a = "".join(audio_labels)
        filter_lines.append(f"{all_a}amix=inputs={len(audio_labels)}:normalize=0:duration=longest,atrim=duration={total_duration:.3f}[outa]")

    return {
        "inputs": inputs,
        "filter_script": ";\n".join(filter_lines),
        "duration": total_duration,
        "warnings": warnings,
    }

def run_ffmpeg_export(plan, output_path, temp_dir, on_progress=None, check_cancelled=None):
    script_path = os.path.join(temp_dir, "filter_complex.txt")
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(plan["filter_script"])

    cmd = [
        "ffmpeg", "-y", "-nostats", "-progress", "pipe:1",
        *plan["inputs"],
        "-filter_complex_script", script_path,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
        "-movflags", "+faststart",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        output_path
    ]

    stderr_path = os.path.join(temp_dir, "stderr.log")
    with open(stderr_path, "w", encoding="utf-8") as stderr_file:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=stderr_file, text=True, bufsize=1)
        total_us = plan["duration"] * 1000000.0

        try:
            while True:
                if check_cancelled and check_cancelled():
                    proc.terminate()
                    try:
                        proc.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                    raise RuntimeError("Export was cancelled.")

                line = proc.stdout.readline()
                if not line:
                    if proc.poll() is not None:
                        break
                    continue

                line = line.strip()
                if line.startswith("out_time_us="):
                    try:
                        val = float(line.split("=", 1)[1])
                        pct = min(99, max(1, int(round((val / total_us) * 100))))
                        if on_progress:
                            on_progress(pct)
                    except Exception:
                        pass

            ret = proc.wait()
            if ret != 0:
                stderr_tail = []
                if os.path.exists(stderr_path):
                    with open(stderr_path, "r", encoding="utf-8", errors="replace") as ef:
                        stderr_tail = [l.strip() for l in ef.readlines()][-20:]
                err_msg = "\n".join(stderr_tail) or f"FFmpeg exited with error code {ret}"
                raise RuntimeError(f"FFmpeg failed:\n{err_msg}")

            if on_progress:
                on_progress(100)
        finally:
            if proc.poll() is None:
                try:
                    proc.kill()
                    proc.wait(timeout=2)
                except Exception:
                    pass
