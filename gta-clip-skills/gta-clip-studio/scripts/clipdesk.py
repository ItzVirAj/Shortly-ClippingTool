#!/usr/bin/env python
"""
Clip Desk - the editing side. Turns raw clips from clipwatch.py into finished 9:16 shorts.

  python clipdesk.py status           what's clipped / reviewed / edited
  python clipdesk.py pending          new clips: chat sample + transcript + a frame sheet to look at
  python clipdesk.py edit    N --hook "HE DID NOT SEE THAT COMING" [--score 8]
                             [--trim 3 41] [--zoom-at 24] [--note "..."]
                             [--vo "0.3|a|line one" --vo "20|b|line two"]   (ElevenLabs mode only)
  python clipdesk.py drop    N --note "giveaway spam, nothing happened"
  python clipdesk.py rank             writes BEST.md (best first)

Voice:
  streamer mode (default): no --vo. The streamer's own voice and game audio stay, captioned.
  elevenlabs mode: add --vo lines. Your ElevenLabs voices talk over the clip, the streamer
                   ducks under them and comes back up in the gaps; captions are coloured per voice.

--dir = a stream folder (default: the newest one in the output folder).
Finished shorts go to DIR/final/NN_final.mp4. Decisions are kept in DIR/review.json.
"""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CFG, FONTS, THREADS, caption_font_name, duration, ff_path, font, venc  # noqa: E402
from gpulock import gpu  # noqa: E402
import subprocess  # noqa: E402

OUT = Path(CFG["output_dir"])


def stream_dir(d):
    if d:
        p = Path(d)
        if p.is_absolute() or p.exists():
            return p.resolve()
        return OUT / d
    dirs = sorted([p for p in OUT.glob("*") if (p / "clips.json").exists()],
                  key=lambda p: (p / "clips.json").stat().st_mtime)
    if not dirs:
        sys.exit(f"no stream folders with clips yet in {OUT}")
    return dirs[-1]


def load(d):
    clips = json.loads((d / "clips.json").read_text(encoding="utf-8"))
    rp = d / "review.json"
    review = json.loads(rp.read_text(encoding="utf-8")) if rp.exists() else {}
    return clips, review


def save_review(d, review):
    (d / "review.json").write_text(json.dumps(review, indent=2, ensure_ascii=False), encoding="utf-8")


def get_clip(clips, n):
    for c in clips["clips"]:
        if c["n"] == n:
            return c
    sys.exit(f"clip {n} not found")


def ts(s):
    h, m, rest = s.split(":")
    sec, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000


def fmt(t):
    ms = int(round(max(t, 0) * 1000))
    return f"{ms // 3600000:02d}:{ms % 3600000 // 60000:02d}:{ms % 60000 // 1000:02d},{ms % 1000:03d}"


def read_srt(path):
    out = []
    if not path or not Path(path).exists():
        return out
    for block in Path(path).read_text(encoding="utf-8").strip().split("\n\n"):
        lines = block.strip().splitlines()
        if len(lines) >= 3 and "-->" in lines[1]:
            a, b = [x.strip() for x in lines[1].split("-->")]
            out.append((ts(a), ts(b), " ".join(lines[2:])))
    return out


def srt_of(d, c):
    p = d / (c.get("srt") or Path(c["file"]).with_suffix(".srt").name)
    return p if p.exists() and p.stat().st_size else None


# ---------------------------------------------------------------- commands
def cmd_status(a):
    d = stream_dir(a.dir)
    clips, review = load(d)
    s = clips["stream"]
    print(f"{s['channel']} | {s['title']}\n{d}")
    for c in clips["clips"]:
        r = review.get(str(c["n"]), {})
        print(f"  {c['n']:02d}  {c['at']}  chat x{c.get('ratio')}  -> {r.get('status', 'NEW')}"
              f"{'  score ' + str(r['score']) if r.get('score') else ''}  {r.get('hook', '')}")
    print("DONE (stream finished)" if (d / "DONE").exists() else "still running")


def cmd_pending(a):
    d = stream_dir(a.dir)
    clips, review = load(d)
    (d / "review").mkdir(exist_ok=True)
    new = [c for c in clips["clips"] if str(c["n"]) not in review]
    print(f"{d}\n{len(new)} new clip(s)\n")
    for c in new:
        f = d / c["file"]
        dur = duration(f)
        sheet = d / "review" / f"{c['n']:02d}_sheet.jpg"
        if not sheet.exists() and dur:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-threads", THREADS, "-i", str(f), "-vf",
                            f"fps=8/{dur:.2f},scale=480:-2,drawtext=fontfile='{ff_path(font('text'))}':"
                            "text='%{pts\\:hms}':x=8:y=8:fontsize=26:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=4x2",
                            "-frames:v", "1", str(sheet)])
        src = c.get("source", "chat")
        why = (f"chat {c.get('chat_peak')} vs avg {c.get('chat_avg')} (x{c.get('ratio')})" if src == "chat"
               else "Most replayed peak" if src == "most_replayed" else "picked from the transcript")
        print(f"=== clip {c['n']:02d}  video time {c['at']}  ({dur:.0f}s)  {why}  {c.get('label') or ''}")
        print(f"{'spike' if src == 'chat' else 'payoff'} in clip at ~{max(0, c.get('spike_in_clip', 30)):.0f}s"
              f"  | link {c['link']}")
        if src == "chat":
            print("chat at the spike:", " | ".join(c.get("chat_sample") or [])[:400] or "-")
        lines = read_srt(srt_of(d, c))
        print("transcript:", " ".join(f"[{s:.0f}s] {t}" for s, _, t in lines)[:1500] or "(no speech)")
        print(f"frame sheet (8 frames, timestamps on them): {sheet}\n")


def wrap(text, width):
    words = text.split()
    if len(text) > width and len(text) <= 2 * width + 4 and len(words) > 1:
        # two lines: pick the break that makes them as even as possible
        best = min(range(1, len(words)), key=lambda i: max(len(" ".join(words[:i])), len(" ".join(words[i:]))))
        return " ".join(words[:best]) + chr(10) + " ".join(words[best:])
    lines, cur = [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > width:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    if cur:
        lines.append(cur)
    return "\n".join(lines)


# ---------------------------------------------------------------- voice-over (ElevenLabs mode)
def voices():
    return CFG["elevenlabs"]["voices"]


def parse_vo(specs):
    """--vo "2.5|a|Nobody in that lobby saw this coming." (seconds inside the FINAL trimmed clip)"""
    out = []
    for s in specs or []:
        parts = s.split("|", 2)
        if len(parts) != 3:
            sys.exit(f'bad --vo "{s}"  (use "SECONDS|voice|text", voices: {", ".join(voices())})')
        at, who, text = float(parts[0]), parts[1].strip().lower(), parts[2].strip()
        if who not in voices():
            sys.exit(f"unknown voice '{who}', set up voices: {', '.join(voices())} (python voice.py status)")
        out.append((at, who, text))
    return sorted(out)


def make_vo(lines, vodir, clip_len, words_per_cue=3):
    from voice import tts
    vodir.mkdir(parents=True, exist_ok=True)
    items = []
    for i, (at, who, text) in enumerate(lines, 1):
        mp3 = vodir / f"{i:02d}_{who}.mp3"
        print(f"voice-over {i}: {who} ...", flush=True)
        tts(text, who, mp3)
        items.append({"at": at, "who": who, "text": text, "mp3": mp3})
    cur = -1.0
    for v in items:
        v["dur"] = duration(v["mp3"])
        v["start"] = max(v["at"], cur + 0.15)  # never let two lines talk over each other
        v["end"] = v["start"] + v["dur"]
        cur = v["end"]
        ws = v["text"].split()
        groups = [" ".join(ws[k:k + words_per_cue]) for k in range(0, len(ws), words_per_cue)]
        total = sum(len(g) for g in groups) or 1
        t, v["chunks"] = v["start"], []
        for g in groups:
            seg = v["dur"] * len(g) / total
            v["chunks"].append((t, min(t + seg, clip_len), g))
            t += seg
    return items


def cmd_edit(a):
    d = stream_dir(a.dir)
    clips, review = load(d)
    c = get_clip(clips, a.n)
    src = d / c["file"]
    dur = duration(src)
    t0, t1 = (a.trim if a.trim else (0, dur))
    t1 = min(t1, dur)
    if t1 - t0 < 3:
        sys.exit("trim too short")
    if a.zoom_at is not None:
        zoom = a.zoom_at
    elif c.get("zoom_hint") is not None:
        zoom = c["zoom_hint"]
    else:
        zoom = max(0.0, c.get("spike_in_clip", 30) - 6)  # chat reacts a few seconds after the moment
    zoom = max(0.0, zoom - t0)
    fin = d / "final"
    fin.mkdir(exist_ok=True)
    tag = f"{a.n:02d}"
    vo = make_vo(parse_vo(a.vo), fin / f"{tag}_vo", t1 - t0, a.words) if a.vo else []  # fails early, before any file
    # the hook font can't draw emoji -> strip them
    hook = "".join(ch for ch in a.hook if ord(ch) <= 0xFFFF and not 0x2600 <= ord(ch) <= 0x27BF
                   and ord(ch) != 0xFE0F).strip().upper()
    (fin / f"{tag}_hook.txt").write_bytes(wrap(hook, 16).encode("utf-8"))  # LF only, a CR shows as an empty line
    (fin / f"{tag}_credit.txt").write_text(f"Clip: {clips['stream']['channel']} on YouTube", encoding="utf-8")
    windows = [(v["start"], v["end"]) for v in vo]
    # captions: VO lines in the voice's colour; streamer captions only where none of our voices talk
    cues = []
    for s, e, t in ([] if a.no_captions else read_srt(srt_of(d, c))):
        if e <= t0 or s >= t1:
            continue
        s2, e2 = max(s, t0) - t0, min(e, t1) - t0
        if any(s2 < we and e2 > ws for ws, we in windows):
            continue
        cues.append((s2, e2, t.upper() if a.upper else t))
    for v in vo:
        for s2, e2, t in v["chunks"]:
            cues.append((s2, e2, f'<font color="{voices()[v["who"]]["color"]}">{t.upper()}</font>'))
    cues.sort()
    cap = fin / f"{tag}_final.srt"
    with open(cap, "w", encoding="utf-8") as f:
        for i, (s2, e2, t) in enumerate(cues, 1):
            f.write(f"{i}\n{fmt(s2)} --> {fmt(e2)}\n{t}\n\n")
    style = (f"FontName={caption_font_name(' '.join(t for _, _, t in cues))},Fontsize=15,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
             "BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV=62")
    fc = (f"[0:v]trim={t0:.3f}:{t1:.3f},setpts=PTS-STARTPTS,split=3[a][b][c];"
          "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:2,eq=brightness=-0.12[bg];"
          "[b]scale=1080:-2[fg];"
          f"[c]scale={int(1080 * a.zoom)}:-2,crop=1080:ih[fz];"
          "[bg][fg]overlay=(W-w)/2:(H-h)/2[v1];"
          f"[v1][fz]overlay=(W-w)/2:(H-h)/2:enable='gte(t,{zoom:.2f})'[v2];"
          f"[v2]drawtext=fontfile='{ff_path(font('hook'))}':textfile='final/{tag}_hook.txt':fontsize=78:fontcolor=black:"
          "text_align=C:line_spacing=10:box=1:boxcolor=0xFFC83D:boxborderw=26:x=(w-text_w)/2:y=330,"
          f"drawtext=fontfile='{ff_path(font('text'))}':textfile='final/{tag}_credit.txt':fontsize=32:fontcolor=white@0.85:"
          "x=(w-text_w)/2:y=h-150")
    if cap.stat().st_size:
        fc += f",subtitles=final/{tag}_final.srt:fontsdir='{ff_path(FONTS)}':force_style='{style}'"
    fc += f"[v];[0:a]atrim={t0:.3f}:{t1:.3f},asetpts=PTS-STARTPTS"
    inputs = ["-i", src.name]
    if vo:
        # streamer + game audio ducks under the voice-over (sidechain) and comes back up in the gaps
        fc += "[orig];"
        for k, v in enumerate(vo, 1):
            inputs += ["-i", str(v["mp3"])]
            ms = int(v["start"] * 1000)
            fc += (f"[{k}:a]aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-12:TP=-1.5:LRA=7,"
                   f"aresample=48000,adelay={ms}|{ms},volume={a.vo_gain}[vo{k}];")
        labels = "".join(f"[vo{k}]" for k in range(1, len(vo) + 1))
        fc += (f"{labels}amix=inputs={len(vo)}:normalize=0:duration=longest[vo];" if len(vo) > 1
               else f"{labels}anull[vo];")
        # apad: without it the sidechain stops when the last VO line ends and the clip loses its audio
        fc += ("[vo]apad,asplit[vok][vom];"
               f"[orig][vok]sidechaincompress=threshold=0.012:ratio=12:attack=15:release=400:level_sc=1,"
               f"volume={a.bed_gain}[duck];"
               "[duck][vom]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[aud]")
    else:
        fc += ",loudnorm=I=-14:TP=-1.5:LRA=11[aud]"
    out = f"final/{tag}_final.mp4"
    with gpu():
        r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-threads", THREADS, *inputs, "-filter_complex", fc,
                            "-map", "[v]", "-map", "[aud]", *venc(), out], cwd=d, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr[-2000:])
    review[str(a.n)] = {"status": "edited", "score": a.score, "hook": a.hook, "note": a.note,
                        "final": out, "trim": [round(t0, 2), round(t1, 2)], "zoom_at": round(zoom, 2),
                        "stream_time": c["at"], "link": c["link"], "voice": "elevenlabs" if vo else "streamer",
                        "voiceover": [{"at": round(v["start"], 2), "who": v["who"], "text": v["text"]} for v in vo]}
    save_review(d, review)
    late = [v for v in vo if v["end"] > t1 - t0]
    if late:
        print(f"WARNING: {len(late)} VO line(s) run past the clip end and get cut - start them earlier or shorten")
    print(f"edited -> {d / out}  ({t1 - t0:.0f}s, voice: {'elevenlabs, ' + str(len(vo)) + ' lines' if vo else 'streamer'})")


def cmd_drop(a):
    d = stream_dir(a.dir)
    clips, review = load(d)
    c = get_clip(clips, a.n)
    review[str(a.n)] = {"status": "dropped", "note": a.note, "stream_time": c["at"]}
    save_review(d, review)
    print(f"clip {a.n} dropped")


def cmd_rank(a):
    d = stream_dir(a.dir)
    clips, review = load(d)
    s = clips["stream"]
    kept = sorted([(k, v) for k, v in review.items() if v.get("status") == "edited"],
                  key=lambda kv: -(kv[1].get("score") or 0))
    lines = [f"# Best clips: {s['channel']}", "", f"{s['title']}  ", f"{s['url']}", "",
             "| Rank | Score | Short | Hook | Stream time | Note |", "|---|---|---|---|---|---|"]
    for i, (k, v) in enumerate(kept, 1):
        lines.append(f"| {i} | {v.get('score') or '-'} | [{Path(v['final']).name}]({v['final']}) | {v['hook']} | "
                     f"[{v['stream_time']}]({v['link']}) | {v.get('note') or ''} |")
    dropped = [(k, v) for k, v in review.items() if v.get("status") == "dropped"]
    if dropped:
        lines += ["", "Dropped:"] + [f"- clip {k} ({v['stream_time']}): {v.get('note') or ''}" for k, v in dropped]
    lines += ["", "Credit and link the streamer on every upload (see CREDITS.txt)."]
    (d / "BEST.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(kept)} kept, {len(dropped)} dropped -> {d / 'BEST.md'}")


def main():
    p = argparse.ArgumentParser(description="Clip Desk: review + edit clips from clipwatch.py")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("status", "pending", "rank"):
        sub.add_parser(name).add_argument("--dir", help="stream folder (default: newest)")
    e = sub.add_parser("edit")
    e.add_argument("--dir")
    e.add_argument("n", type=int)
    e.add_argument("--hook", required=True, help="short title on top, max ~6 words")
    e.add_argument("--score", type=int, help="1-10, used by rank")
    e.add_argument("--trim", type=float, nargs=2, metavar=("START", "END"), help="seconds inside the clip")
    e.add_argument("--zoom-at", type=float, help="punch-in second inside the clip (default: just before the spike)")
    e.add_argument("--zoom", type=float, default=1.3, help="punch-in amount")
    e.add_argument("--upper", action="store_true", help="UPPERCASE captions")
    e.add_argument("--no-captions", action="store_true",
                   help="no captions of the original speech (use when the source already has captions burned in)")
    e.add_argument("--vo", action="append", metavar='"SEC|a|text"',
                   help="ElevenLabs voice-over line (voice names from config.json); repeat for each line")
    e.add_argument("--words", type=int, default=3, help="words per caption line for VO")
    e.add_argument("--vo-gain", type=float, default=1.0, help="voice-over volume (lines are loudness-normalised first)")
    e.add_argument("--bed-gain", type=float, default=0.8, help="streamer/game audio volume under the voice-over")
    e.add_argument("--note", default="")
    dr = sub.add_parser("drop")
    dr.add_argument("--dir")
    dr.add_argument("n", type=int)
    dr.add_argument("--note", default="")
    a = p.parse_args()
    {"status": cmd_status, "pending": cmd_pending, "edit": cmd_edit, "drop": cmd_drop, "rank": cmd_rank}[a.cmd](a)


if __name__ == "__main__":
    main()
