#!/usr/bin/env python
"""
Pro Shorts ("Evidence Mode") from a local video, e.g. one downloaded with  clipwatch.py fetch <url>.

  python pro_short.py SPEC.json [--only ID] [--stills-only]

SPEC.json (see reference/PRO_SHORTS.md):
{
  "source": "C:/.../source.mkv",
  "credit": "SOURCE · CHANNEL NAME (YOUTUBE)",
  "out": "C:/.../shorts",
  "shorts": [
    {"id": "01_six_stars", "start": "6:55", "end": "7:34", "crop_x": 0.5, "crop_rows": [0, 1.0],
     "hook": ["6 STARS", "THE WHOLE MAP HUNTS YOU"], "hook_until": 2.6,
     "counter": ["THING", "12", "12"],
     "claims": [{"at": 14, "dur": 4.5, "kicker": "MAX WANTED LEVEL", "head": "6 STARS", "stamp": "CONFIRMED"}],
     "punches": [21.5],
     "vo": [[0.2, "a", "..."], [33, "b", "..."]],          <- only in ElevenLabs mode; leave out to keep the streamer
     "cta": ["FOLLOW FOR", "THE FULL DAY 1 PLAN"]}
  ]
}
Times in a short are seconds inside that short.
"""
import argparse, json, re, shutil, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from common import CFG, SFX, THREADS, decode16k, log, video_size, vonly, whisper_model  # noqa: E402
from clipwatch import parse_t  # noqa: E402
import clipdesk as cd  # noqa: E402
from gpulock import gpu  # noqa: E402

FPS = 30


def sh(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    if r.returncode:
        sys.exit(f"FAILED: {' '.join(map(str, cmd[:8]))}\n{r.stderr[-2500:]}")
    return r


def crop_x_expr(crop_x, cwid, srcw):
    """crop_x = 0.5, or steps [[t, x], ...] (x 0..1 = left..right, "from t on, frame x") -> eased pans."""
    span = srcw - cwid
    if not isinstance(crop_x, list):
        return str(int(round(span * crop_x)))
    steps = sorted(crop_x)
    keys = [steps[0]]
    for t, xx in steps[1:]:
        keys += [[max(t - 0.35, keys[-1][0] + 0.01), keys[-1][1]], [t, xx]]
    expr = f"{span * keys[-1][1]:.1f}"
    for (t0, x0), (t1, x1) in reversed(list(zip(keys, keys[1:]))):
        u = f"clip((t-{t0})/{max(t1 - t0, 0.01)},0,1)"
        seg = f"({span * x0:.1f}+({span * (x1 - x0):.1f})*({u}*{u}*(3-2*{u})))"
        expr = f"if(lt(t,{t1}),{seg},{expr})"
    return f"if(lt(t,{keys[0][0]}),{span * keys[0][1]:.1f},{expr})"


def build_base(src, s, dur, sp, out):
    """Full-screen 9:16 crop (no blurred borders), slow 100->104% push, punch-ins."""
    srcw, srch = video_size(src)
    r0, r1 = sp.get("crop_rows", [0, 1.0])  # fraction of the height to keep (skip burned-in bars/captions)
    y0 = int(srch * r0) // 2 * 2
    ch = int(srch * r1) // 2 * 2 - y0
    cwid = min(srcw, int(round(ch * 9 / 16 / 2) * 2))
    x = f"'{crop_x_expr(sp.get('crop_x', 0.5), cwid, srcw)}'"
    n = int(round(dur * FPS))
    z = f"1+0.04*on/{n}" + "".join(f"+0.10*between(on/{FPS},{p:.2f},{p + 0.8:.2f})" for p in sp.get("punches", []))
    vf = (f"fps={FPS},crop={cwid}:{ch}:{x}:{y0},scale=2160:3840:flags=lanczos,"
          f"zoompan=z='{z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps={FPS},setsar=1")
    with gpu():
        sh(["ffmpeg", "-y", "-v", "error", "-threads", THREADS, "-ss", f"{s:.3f}", "-t", f"{dur:.3f}", "-i", str(src),
            "-vf", vf, "-an", *vonly("high"), str(out)])


def words_of(path, offset=0.0):
    audio = decode16k(path)
    with gpu():
        segs, _ = whisper_model().transcribe(audio, language=CFG["caption_lang"], beam_size=5,
                                             word_timestamps=True, vad_filter=True)
        return [(w.start + offset, w.end + offset, w.word.strip()) for s in segs for w in (s.words or []) if w.word.strip()]


def chunks(words, who, max_words=3):
    caps, cur = [], []
    for s, e, w in words:
        if cur and (len(cur) >= max_words or s - cur[-1][1] > 0.35 or re.search(r"[.,!?;:]$", cur[-1][2])):
            caps.append(cur)
            cur = []
        cur.append((s, e, w))
    if cur:
        caps.append(cur)
    out = []
    for k, c in enumerate(caps):
        nxt = caps[k + 1][0][0] if k + 1 < len(caps) else c[-1][1] + 0.4
        out.append({"s": round(c[0][0], 3), "e": round(min(c[-1][1] + 0.25, nxt), 3), "who": who,
                    "words": [{"w": re.sub(r"[.,;:]+$", "", w).upper(), "s": round(s, 3)} for s, e, w in c]})
    return out


def mix(orig, vo, sfx, dur, out_wav, tmp):
    inputs, fc = ["-i", str(orig)], "[0:a]aresample=48000,aformat=channel_layouts=stereo[orig];"
    k, vlabels, slabels = 1, [], []
    for v in vo:
        inputs += ["-i", str(v["mp3"])]
        ms = int(v["start"] * 1000)
        fc += (f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-13:TP=-2:LRA=7,aresample=48000,"
               f"adelay={ms}|{ms}[v{k}];")
        vlabels.append(f"[v{k}]")
        k += 1
    for t, name, vol in sfx:
        f = SFX / f"{name}.wav"
        if not f.exists():
            continue
        inputs += ["-i", str(f)]
        ms = max(0, int(t * 1000))
        fc += f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay={ms}|{ms},volume={vol}[s{k}];"
        slabels.append(f"[s{k}]")
        k += 1
    if vlabels:
        fc += (f"{''.join(vlabels)}amix=inputs={len(vlabels)}:normalize=0:duration=longest[vo];" if len(vlabels) > 1
               else f"{vlabels[0]}anull[vo];")
        fc += ("[vo]apad,asplit[vok][vom];[orig][vok]sidechaincompress=threshold=0.012:ratio=12:attack=15:release=400:"
               "level_sc=1,volume=0.85[duck];")
        parts = ["[duck]", "[vom]"] + slabels
    else:
        parts = ["[orig]"] + slabels
    fc += f"{''.join(parts)}amix=inputs={len(parts)}:normalize=0:duration=first,atrim=0:{dur:.3f}[pre]"
    pre = tmp / "pre.wav"
    sh(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", fc, "-map", "[pre]", "-ar", "48000", str(pre)])
    # two-pass loudnorm -> -14 LUFS, true peak -1.5 dBTP
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(pre), "-af", "loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json",
                        "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    m = json.loads(r.stderr[r.stderr.rfind("{"):r.stderr.rfind("}") + 1])
    af = (f"loudnorm=I=-14:TP=-1.5:LRA=9:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
          f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true")
    sh(["ffmpeg", "-y", "-v", "error", "-i", str(pre), "-af", af + ",aresample=48000", str(out_wav)])


def build(spec, sp, stills_only=False):
    src, out, sid = Path(spec["source"]), Path(spec["out"]), sp["id"]
    tmp = out / "work" / sid
    tmp.mkdir(parents=True, exist_ok=True)
    s, e = parse_t(sp["start"]), parse_t(sp["end"])
    dur = round(e - s, 3)
    log(f"[{sid}] {sp['start']}-{sp['end']} ({dur:.1f}s)")
    base, orig = tmp / "base.mp4", tmp / "orig.wav"
    key = json.dumps([sp["start"], sp["end"], sp.get("crop_x", 0.5), sp.get("crop_rows"), sp.get("punches", [])])
    kf = tmp / "base.key"
    if not (base.exists() and kf.exists() and kf.read_text() == key):
        log("  cut -> 9:16 crop + push ...")
        build_base(src, s, dur, sp, base)
        sh(["ffmpeg", "-y", "-v", "error", "-ss", f"{s:.3f}", "-t", f"{dur:.3f}", "-i", str(src), "-vn", "-ac", "2",
            "-ar", "48000", str(orig)])
        kf.write_text(key)
    vo = cd.make_vo([(float(a), w, t) for a, w, t in sp.get("vo", [])], tmp / "vo", dur, 3) if sp.get("vo") else []
    windows = [(v["start"] - 0.1, v["end"] + 0.1) for v in vo]
    log("  captions (word timings) ...")
    caps = chunks([w for w in words_of(orig) if not any(w[0] < b and w[1] > a for a, b in windows)], "orig")
    for v in vo:
        caps += chunks(words_of(v["mp3"], v["start"]), v["who"])
    caps.sort(key=lambda c: c["s"])
    for i in range(len(caps) - 1):  # never two captions at once
        caps[i]["e"] = min(caps[i]["e"], caps[i + 1]["s"])
    hook_until = sp.get("hook_until", 2.6)
    cta_at = round(dur - sp.get("cta_len", 2.4), 2) if sp.get("cta") else None
    caps = [c for c in caps if c["e"] > (hook_until if sp.get("hide_caps_under_hook") else 0)]
    tl = {"meta": {"w": 1080, "h": 1920, "fps": FPS, "dur": dur, "venc": vonly("high")[:-2]},
          "voices": {k: {"label": v.get("label", k), "color": v.get("color")} for k, v in CFG["elevenlabs"]["voices"].items()},
          "hook": {"l1": sp["hook"][0], "l2": sp["hook"][1] if len(sp["hook"]) > 1 else "", "until": hook_until,
                   "y": sp.get("hook_y", 600)},
          "counter": {"label": sp["counter"][0], "n": sp["counter"][1], "of": sp["counter"][2], "from": hook_until - 0.2}
          if sp.get("counter") else None,
          "source": spec.get("credit"), "claims": sp.get("claims", []), "caps": caps,
          "cta": {"at": cta_at, "l1": sp["cta"][0], "l2": sp["cta"][1], "y": sp.get("cta_y", 640)} if cta_at else None}
    (tmp / "tl.json").write_text(json.dumps(tl, indent=1, ensure_ascii=False), encoding="utf-8")
    # QA stills -> one contact sheet to look at before rendering
    times = sorted({0.0, 1.2, hook_until + 0.6, *[c["at"] + 1.0 for c in sp.get("claims", [])],
                    *[c["at"] + 0.6 for c in sp.get("claims", []) if c.get("stamp")], *(sp.get("punches", [])),
                    *[round(k * 3.0, 2) for k in range(1, int(dur // 3) + 1)], *([cta_at + 0.8] if cta_at else [])})
    times = [round(min(t, dur - 0.05), 2) for t in times]
    shutil.rmtree(tmp / "stills", ignore_errors=True)
    sh(["node", str(HERE / "render_overlay.js"), "stills", str(tmp / "tl.json"), str(tmp / "stills"), str(base),
        ",".join(map(str, times))])
    sheet = out / f"{sid}_QA.jpg"
    stills = sorted((tmp / "stills").glob("t*.jpg"), key=lambda p: float(p.stem[1:]))
    cols = min(8, len(stills))
    if len(stills) > 1:
        sh(["ffmpeg", "-y", "-v", "error", *sum([["-i", str(p)] for p in stills], []), "-filter_complex",
            "".join(f"[{i}:v]scale=270:-1,drawtext=text='{p.stem[1:]}s':x=8:y=8:fontsize=22:fontcolor=yellow:"
                    f"box=1:boxcolor=black@0.6[s{i}];" for i, p in enumerate(stills))
            + "".join(f"[s{i}]" for i in range(len(stills))) + f"xstack=inputs={len(stills)}:layout="
            + "|".join(f"{(i % cols) * 270}_{(i // cols) * 480}" for i in range(len(stills))) + ":fill=black",
            "-frames:v", "1", str(sheet)])
    log(f"  QA sheet: {sheet}")
    if stills_only:
        return
    # sound: duck + VO + SFX (whoosh on hook, pops on plates, stamp thunks, impacts on punches, whip into CTA)
    sfx = [(0.0, "whoosh", 0.55), (hook_until - 0.2, "pop", 0.5)]
    for c in sp.get("claims", []):
        sfx.append((c["at"], "pop", 0.55))
        if c.get("stamp"):
            sfx.append((c["at"] + 0.45, "stamp", 0.9))
    for p in sp.get("punches", []):
        sfx.append((p, "impact", 0.45))
    if cta_at:
        sfx.append((cta_at - 0.05, "whip", 0.6))
    log("  mixing (-14 LUFS) ...")
    mix(orig, vo, sfx, dur, tmp / "mix.wav", tmp)
    final = out / f"{sid}_FINAL.mp4"
    log("  rendering overlay + final ...")
    with gpu():
        sh(["node", str(HERE / "render_overlay.js"), "video", str(tmp / "tl.json"), str(base), str(tmp / "mix.wav"),
            str(final)])
    log(f"  done -> {final}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("spec")
    p.add_argument("--only")
    p.add_argument("--stills-only", action="store_true")
    a = p.parse_args()
    spec = json.loads(Path(a.spec).read_text(encoding="utf-8"))
    Path(spec["out"]).mkdir(parents=True, exist_ok=True)
    for sp in spec["shorts"]:
        if a.only and sp["id"] != a.only:
            continue
        build(spec, sp, a.stills_only)


if __name__ == "__main__":
    main()
