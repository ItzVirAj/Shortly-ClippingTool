#!/usr/bin/env python
"""
Clip Watcher (YouTube) - finds the best moments of a stream or video and cuts them.

  info  <url>  what is this link? (live / upcoming / finished stream / video, chat replay, length)
  live  <url>  record a live (or upcoming) stream, read its chat, cut clips while it runs
  vod   <url>  a finished stream: chat replay (or "Most replayed") -> clips,
               downloads ONLY the clip parts, not the whole stream
  scan  <url>  any video: transcript + loudness + Most-replayed + chat signals, so Claude picks
  cut          cut the moments Claude picked from a scan
  fetch <url>  download the whole video (e.g. 4K) for Pro Shorts

Every clip gives:  NN_hhmmss.mp4        16:9 cut
                   NN_hhmmss.srt        captions (faster-whisper)
                   NN_hhmmss_short.mp4  quick 9:16 with burned captions
plus clips.json and CREDITS.txt (always credit + link the streamer).
"""
import argparse, json, os, re, signal, subprocess, sys, time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CFG, FONTS, THREADS, decode16k, ff_path, caption_font_name, log, safe, venc, whisper_model  # noqa: E402
from gpulock import gpu  # noqa: E402

YTDLP = [sys.executable, "-m", "yt_dlp", "--js-runtimes", "node", "--no-warnings"]


def hms(sec):
    sec = int(sec)
    return f"{sec // 3600:02d}{sec % 3600 // 60:02d}{sec % 60:02d}"


def nice(sec):
    sec = int(sec)
    return f"{sec // 3600}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def run(cmd, cwd=None, quiet=True):
    r = subprocess.run(cmd, cwd=cwd, capture_output=quiet, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(f"command failed ({r.returncode}): {' '.join(map(str, cmd[:6]))} ...\n{(r.stderr or '')[-1500:]}")
    return r.stdout


# ---------------------------------------------------------------- chat
def chat_text(item):
    out = []
    for r in item.get("message", {}).get("runs", []):
        if "text" in r:
            out.append(r["text"])
        elif "emoji" in r:
            sc = r["emoji"].get("shortcuts") or [r["emoji"].get("emojiId", "")]
            out.append(sc[0])
    return "".join(out)


def parse_chat(path, rec_start=None):
    """[(seconds_into_video, author, text)]. Replay chat has videoOffsetTimeMsec; live chat only has
    wall-clock timestampUsec, turned into an offset with rec_start (wall time the recording began)."""
    msgs = []
    if not path or not Path(path).exists():
        return msgs
    with open(path, encoding="utf-8", errors="ignore") as f:
        for line in f:
            try:
                d = json.loads(line)
            except ValueError:
                continue  # half-written last line of a live file
            r = d.get("replayChatItemAction", {})
            off = r.get("videoOffsetTimeMsec")
            for a in r.get("actions", []):
                item = a.get("addChatItemAction", {}).get("item", {})
                for kind in ("liveChatTextMessageRenderer", "liveChatPaidMessageRenderer",
                             "liveChatMembershipItemRenderer"):
                    m = item.get(kind)
                    if not m:
                        continue
                    if off is not None and not d.get("isLive"):
                        t = int(off) / 1000
                    elif rec_start is not None and m.get("timestampUsec"):
                        t = int(m["timestampUsec"]) / 1e6 - rec_start
                    else:
                        continue
                    if t >= 0:
                        msgs.append((t, m.get("authorName", {}).get("simpleText", ""), chat_text(m)))
    return msgs


LINK = re.compile(r"https?://|www\.|\.com/", re.I)


def reaction_times(msgs, a):
    """One count per viewer per bin, links skipped -> bots / one person spamming can't fake a spike."""
    seen, out = set(), []
    for t, author, text in msgs:
        if LINK.search(text or ""):
            continue
        key = (author or text, int(t // a.bin))
        if key not in seen:
            seen.add(key)
            out.append(t)
    return out


def find_spikes(times, dur, a):
    """A --bin is a spike when it has >= --factor x the average of the previous --baseline seconds
    (and at least --min-msgs). Spikes within --gap s are merged into one moment."""
    b = a.bin
    nb = int(dur // b)
    if nb <= 0:
        return []
    counts = [0] * nb
    for t in times:
        i = int(t // b)
        if 0 <= i < nb:
            counts[i] += 1
    base_n = max(1, int(a.baseline // b))
    hits = []
    for i in range(nb):
        prev = counts[max(0, i - base_n):i]
        if len(prev) < min(6, base_n):  # need ~1 min of history first
            continue
        avg = sum(prev) / len(prev)
        if counts[i] >= a.min_msgs and counts[i] >= a.factor * max(avg, 0.5):
            hits.append({"t": i * b, "count": counts[i], "avg": round(avg, 1),
                         "ratio": round(counts[i] / max(avg, 0.5), 1)})
    groups = []
    for h in hits:
        if groups and h["t"] - groups[-1][-1]["t"] <= a.gap:
            groups[-1].append(h)
        else:
            groups.append([h])
    moments = []
    for g in groups:
        peak = max(g, key=lambda h: h["ratio"])
        start = max(0.0, g[0]["t"] - a.pre)  # chat reacts AFTER the moment
        end = max(start + a.length, g[-1]["t"] + b + 5)
        end = min(end, start + a.max_length, dur)
        moments.append({"start": start, "end": end, "spike_at": g[0]["t"], "last_spike": g[-1]["t"],
                        "peak_count": peak["count"], "avg": peak["avg"], "ratio": peak["ratio"],
                        "score": sum(h["count"] for h in g)})
    return moments


def heatmap_moments(heatmap, dur, a):
    """'Most replayed' graph -> peaks (for videos without chat)."""
    pts = [h for h in heatmap if h.get("value") is not None]
    peaks = []
    for i, h in enumerate(pts):
        v = h["value"]
        left = pts[i - 1]["value"] if i else -1
        right = pts[i + 1]["value"] if i + 1 < len(pts) else -1
        if v >= a.heat_min and v >= left and v >= right and h["start_time"] > 5:
            peaks.append(h)
    peaks.sort(key=lambda h: -h["value"])
    chosen = []
    for h in peaks:
        mid = (h["start_time"] + h["end_time"]) / 2
        start = max(0.0, mid - a.length * 0.6)
        end = min(dur, start + a.length)
        if all(end <= c["start"] or start >= c["end"] for c in chosen):
            chosen.append({"start": start, "end": end, "spike_at": mid, "ratio": round(h["value"], 2),
                           "score": h["value"], "source": "most_replayed"})
    return chosen


def pick_top(moments, top):
    best = sorted(moments, key=lambda m: -m["score"])[:top] if top else moments
    return sorted(best, key=lambda m: m["start"])


# ---------------------------------------------------------------- captions
def srt_time(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms % 3600000 // 60000:02d}:{ms % 60000 // 1000:02d},{ms % 1000:03d}"


def transcribe(video, srt_path, a):
    audio = decode16k(video)
    if audio.size < 16000:
        return 0
    segs, info = whisper_model(a.model).transcribe(
        audio, language=None if a.lang == "auto" else a.lang, beam_size=5, word_timestamps=True, vad_filter=True)
    chunks, cur = [], []  # short punchy caption chunks (max N words) for shorts
    for s in segs:
        for w in (s.words or []):
            if cur and (len(cur) >= a.words or w.start - cur[-1].end > 0.6):
                chunks.append(cur)
                cur = []
            cur.append(w)
    if cur:
        chunks.append(cur)
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, c in enumerate(chunks, 1):
            text = "".join(w.word for w in c).strip()
            f.write(f"{i}\n{srt_time(c[0].start)} --> {srt_time(max(c[-1].end, c[0].start + 0.3))}\n"
                    f"{text.upper() if a.upper else text}\n\n")
    return len(chunks)


# ---------------------------------------------------------------- video
def make_short(clip, srt, out, a):
    font_name = a.font or caption_font_name(Path(srt).read_text(encoding="utf-8") if srt and Path(srt).exists() else "")
    style = (f"FontName={font_name},Fontsize={a.font_size},PrimaryColour=&H00FFFFFF,"
             f"OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=1,Alignment=2,MarginV={a.margin_v}")
    vf = ("[0:v]split[a][b];"
          "[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:2,eq=brightness=-0.08[bg];"
          "[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2")
    if srt and Path(srt).exists() and Path(srt).stat().st_size > 0:
        vf += f",subtitles={Path(srt).name}:fontsdir='{ff_path(FONTS)}':force_style='{style}'"
    vf += "[v]"
    run(["ffmpeg", "-y", "-v", "error", "-threads", THREADS, "-i", Path(clip).name,
         "-filter_complex", vf, "-map", "[v]", "-map", "0:a?", *venc(), Path(out).name], cwd=Path(clip).parent)


def finish_clip(clip, m, idx, outdir, meta, a):
    base = clip.with_suffix("")
    srt = base.with_suffix(".srt")
    n = 0
    if not a.no_captions:
        with gpu():
            n = transcribe(clip, srt, a)
        log(f"   captions: {n} lines")
    if not a.no_short:
        with gpu():
            make_short(clip, srt if n else None, Path(str(base) + "_short.mp4"), a)
        log(f"   quick short: {base.name}_short.mp4")
    rec = {"n": idx, "file": clip.name, "start": round(m["start"], 1), "end": round(m["end"], 1),
           "at": nice(m["start"]), "spike_in_clip": round(m.get("spike_at", m["start"]) - m["start"], 1),
           "chat_peak": m.get("peak_count"), "chat_avg": m.get("avg"),
           "ratio": m.get("ratio"), "source": m.get("source", "chat"), "chat_sample": m.get("sample", []),
           "zoom_hint": m.get("zoom_hint"), "label": m.get("label", ""),
           "srt": srt.name if n else None, "short": f"{base.name}_short.mp4" if not a.no_short else None,
           "link": f"{meta['url']}&t={int(m['start'])}s" if "watch?v=" in meta["url"] else meta["url"]}
    jp = outdir / "clips.json"
    data = json.loads(jp.read_text(encoding="utf-8")) if jp.exists() else {"stream": meta, "clips": []}
    data["clips"].append(rec)
    jp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    with open(outdir / "CREDITS.txt", "a", encoding="utf-8") as f:
        f.write(f"{clip.name}: clip from {meta['channel']} - \"{meta['title']}\" - {rec['link']}\n")


def new_outdir(meta, a):
    d = Path(a.out) / f"{datetime.now():%Y-%m-%d_%H%M}_{safe(meta['channel'])}_{meta['id']}"
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_meta(url):
    info = json.loads(run([*YTDLP, "-J", "--no-playlist", url]))
    vid = info.get("id", "")
    return info, {"id": vid, "title": info.get("title", ""), "channel": info.get("channel") or info.get("uploader", ""),
                  "channel_url": info.get("channel_url", ""), "url": f"https://www.youtube.com/watch?v={vid}",
                  "live_status": info.get("live_status")}


def fmt_arg(a):
    return f"bv*[height<={a.height}]+ba/b[height<={a.height}]/b"


def download_section(url, s, e, name, outdir, a):
    run([*YTDLP, "-f", fmt_arg(a), "--download-sections", f"*{s:.1f}-{e:.1f}", "--force-keyframes-at-cuts",
         "--downloader-args", f"ffmpeg_o:-threads {THREADS}", "--merge-output-format", "mp4", "-o", name, url],
        cwd=outdir)


# ---------------------------------------------------------------- info
def cmd_info(a):
    info, meta = get_meta(a.url)
    subs = info.get("subtitles") or {}
    st = meta["live_status"]
    mode = {"is_live": "live", "is_upcoming": "live", "was_live": "vod" if "live_chat" in subs else "scan",
            "post_live": "wait"}.get(st, "scan")
    print(json.dumps({"title": meta["title"], "channel": meta["channel"], "url": meta["url"], "live_status": st,
                      "duration": nice(info.get("duration") or 0), "chat_replay": "live_chat" in subs,
                      "most_replayed": bool(info.get("heatmap")), "language": info.get("language"),
                      "suggested_mode": mode}, indent=2, ensure_ascii=False))


# ---------------------------------------------------------------- vod mode
def cmd_vod(a):
    info, meta = get_meta(a.url)
    dur = float(info.get("duration") or 0)
    log(f"{meta['channel']} | {meta['title']} | {nice(dur)} | {meta['live_status']}")
    if meta["live_status"] in ("is_live", "is_upcoming"):
        sys.exit("This stream is live/upcoming - use:  clipwatch.py live <url>")
    outdir = new_outdir(meta, a)
    moments, source = [], None
    if a.source in ("auto", "chat"):
        log("downloading chat replay ...")
        try:
            run([*YTDLP, "--skip-download", "--write-subs", "--sub-langs", "live_chat", "-o", "chat", a.url], cwd=outdir)
        except RuntimeError as e:
            log("no chat replay:", str(e).splitlines()[-1][:200])
        msgs = parse_chat(outdir / "chat.live_chat.json")
        if msgs:
            log(f"chat replay: {len(msgs)} messages")
            moments, source = find_spikes(reaction_times(msgs, a), dur, a), "chat"
            for m in moments:
                m["source"] = "chat"
                m["sample"] = [txt for t, _, txt in msgs if m["spike_at"] <= t < m["spike_at"] + a.bin][:6]
    if not moments and a.source in ("auto", "heatmap"):
        hm = info.get("heatmap") or []
        if hm:
            moments, source = heatmap_moments(hm, dur, a), "most_replayed"
            log(f"using 'Most replayed' graph ({len(hm)} points)")
    if not moments:
        sys.exit("No chat spikes and no 'Most replayed' data for this video. "
                 "Use  clipwatch.py scan <url>  instead (Claude picks the moments from the transcript).")
    moments = pick_top(moments, a.top)
    log(f"{len(moments)} moments ({source}):")
    for i, m in enumerate(moments, 1):
        extra = (f"chat {m.get('peak_count')} vs avg {m.get('avg')} (x{m['ratio']})" if source == "chat"
                 else f"replay {m['ratio']}")
        log(f"  {i:02d}  {nice(m['start'])} - {nice(m['end'])}  {extra}  {' | '.join(m.get('sample', []))[:90]}")
    (outdir / "moments.json").write_text(json.dumps(moments, indent=2, ensure_ascii=False), encoding="utf-8")
    if a.dry_run:
        log(f"dry run - nothing downloaded. list: {outdir / 'moments.json'}")
        return
    for i, m in enumerate(moments, 1):
        name = f"{i:02d}_{hms(m['start'])}.mp4"
        log(f"clip {i}/{len(moments)}  {nice(m['start'])}  -> {name}")
        try:
            download_section(a.url, m["start"], m["end"], name, outdir, a)
            finish_clip(outdir / name, m, i, outdir, meta, a)
        except Exception as e:
            log(f"   clip {i} failed: {e}")
    (outdir / "DONE").write_text(f"vod finished, {len(moments)} moments\n", encoding="utf-8")
    log(f"done -> {outdir}")
    print(f"FOLDER: {outdir}")


# ---------------------------------------------------------------- any video: Claude picks
def parse_t(s):
    s = str(s).strip()
    if ":" in s:
        sec = 0.0
        for part in s.split(":"):
            sec = sec * 60 + float(part)
        return sec
    return float(s)


def loud_peaks(audio, top=20, gap=45):
    """Loudest seconds (shouting, laughing, explosions) as candidate moments."""
    import numpy as np
    sr = 16000
    n = int(len(audio) // sr)
    if n < 10:
        return []
    rms = np.sqrt(np.mean(audio[:n * sr].reshape(n, sr) ** 2, axis=1) + 1e-9)
    smooth = np.convolve(20 * np.log10(rms), np.ones(3) / 3, mode="same")
    floor = float(np.median(smooth))
    picked = []
    for i in np.argsort(-smooth):
        if smooth[i] < floor + 6:
            break
        if all(abs(int(i) - p) > gap for p, _ in picked):
            picked.append((int(i), round(float(smooth[i] - floor), 1)))
        if len(picked) >= top:
            break
    return sorted(picked)


def first(outdir, pattern):
    hits = sorted(outdir.glob(pattern))
    return hits[0] if hits else None


def cmd_scan(a):
    """Step 1 for any video: transcript with timestamps + every signal we can get.
    Claude reads transcript.txt + signals.md, picks the moments, then runs `cut`."""
    info, meta = get_meta(a.url)
    dur = float(info.get("duration") or 0)
    log(f"{meta['channel']} | {meta['title']} | {nice(dur)} | {meta['live_status']}")
    if meta["live_status"] in ("is_live", "is_upcoming"):
        sys.exit("This is live - use:  clipwatch.py live <url>")
    outdir = new_outdir(meta, a)
    (outdir / "scan.json").write_text(json.dumps({"stream": meta, "duration": dur}, indent=2, ensure_ascii=False),
                                      encoding="utf-8")
    log("downloading audio only ...")
    run([*YTDLP, "-f", "ba/b", "-o", "audio.%(ext)s", a.url], cwd=outdir)
    af = first(outdir, "audio.*")
    audio = decode16k(af.name, cwd=outdir)
    log(f"transcribing {nice(len(audio) / 16000)} ...")
    with gpu():
        segs, _ = whisper_model(a.model).transcribe(audio, language=None if a.lang == "auto" else a.lang,
                                                    beam_size=5, vad_filter=True)
        segs = list(segs)
    with open(outdir / "transcript.txt", "w", encoding="utf-8") as f:
        for s in segs:
            f.write(f"[{nice(s.start)}-{nice(s.end)}] {s.text.strip()}\n")
    log(f"transcript: {len(segs)} lines")
    lines = [f"# Signals: {meta['title']}", f"{meta['channel']} | {nice(dur)} | {meta['url']}", "",
             "## Loudest moments (shouting / laughing / action), dB above normal", ""]
    lines += [f"- {nice(t)}  +{d} dB" for t, d in loud_peaks(audio)] or ["- none"]
    hm = info.get("heatmap") or []
    lines += ["", "## YouTube 'Most replayed' peaks (0-1)", ""]
    if hm:
        for m in sorted(heatmap_moments(hm, dur, a), key=lambda m: -m["score"])[:12]:
            lines.append(f"- {nice(m['spike_at'])}  replay {m['ratio']}")
    else:
        lines.append("- not available for this video")
    if meta["live_status"] == "was_live":
        try:
            run([*YTDLP, "--skip-download", "--write-subs", "--sub-langs", "live_chat", "-o", "chat", a.url], cwd=outdir)
        except RuntimeError:
            pass
        msgs = parse_chat(outdir / "chat.live_chat.json")
        if msgs:
            lines += ["", "## Chat replay spikes (chat reacts ~5-15 s AFTER the moment)", ""]
            for m in sorted(find_spikes(reaction_times(msgs, a), dur, a), key=lambda m: -m["score"])[:15]:
                sample = " | ".join(txt for t, _, txt in msgs if m["spike_at"] <= t < m["spike_at"] + a.bin)[:120]
                lines.append(f"- {nice(m['spike_at'])}  chat x{m['ratio']}  {sample}")
    (outdir / "signals.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    af.unlink(missing_ok=True)
    log(f"scan done -> {outdir}")
    print(f"FOLDER: {outdir}\nTRANSCRIPT: {outdir / 'transcript.txt'}\nSIGNALS: {outdir / 'signals.md'}")


def cmd_cut(a):
    """Step 2: cut the moments Claude picked.  --clips "12:30-13:10@25=label" "1:02:00-1:02:40" ...
    @N = punch-in second inside the clip (optional), =label = short note (optional)."""
    outdir = Path(a.dir)
    if not outdir.is_absolute() and not outdir.exists():
        outdir = Path(a.out) / a.dir
    sj = json.loads((outdir / "scan.json").read_text(encoding="utf-8"))
    meta, dur = sj["stream"], sj["duration"]
    jp = outdir / "clips.json"
    idx = len(json.loads(jp.read_text(encoding="utf-8"))["clips"]) if jp.exists() else 0
    for spec in a.clips:
        label = ""
        if "=" in spec:
            spec, label = spec.split("=", 1)
        zoom = None
        if "@" in spec:
            spec, z = spec.split("@", 1)
            zoom = float(z)
        s, e = (parse_t(x) for x in spec.split("-", 1))
        e = min(e, dur) if dur else e
        if e - s < 3:
            log(f"skip {spec}: too short")
            continue
        idx += 1
        m = {"start": s, "end": e, "spike_at": s + (zoom if zoom is not None else (e - s) / 2),
             "zoom_hint": zoom, "label": label, "source": "picked"}
        name = f"{idx:02d}_{hms(s)}.mp4"
        log(f"clip {idx}  {nice(s)}-{nice(e)}  {label}  -> {name}")
        try:
            download_section(meta["url"], s, e, name, outdir, a)
            finish_clip(outdir / name, m, idx, outdir, meta, a)
        except Exception as e2:
            log(f"   clip {idx} failed: {e2}")
    log(f"cut done -> {outdir}")
    print(f"FOLDER: {outdir}")


def cmd_fetch(a):
    """Whole video at up to --height (Pro Shorts need the full-quality source)."""
    info, meta = get_meta(a.url)
    outdir = new_outdir(meta, a)
    log(f"downloading {meta['title']} (up to {a.height}p) ...")
    run([*YTDLP, "-f", fmt_arg(a), "--merge-output-format", "mkv", "-o", "source.%(ext)s", a.url], cwd=outdir, quiet=False)
    (outdir / "scan.json").write_text(json.dumps({"stream": meta, "duration": info.get("duration")}, indent=2,
                                                 ensure_ascii=False), encoding="utf-8")
    print(f"FOLDER: {outdir}\nSOURCE: {first(outdir, 'source.*')}")


# ---------------------------------------------------------------- live mode
def cmd_live(a):
    info, meta = get_meta(a.url)
    log(f"{meta['channel']} | {meta['title']} | {meta['live_status']}")
    if meta["live_status"] in ("was_live", "not_live", "post_live"):
        sys.exit("This stream is not live - use:  clipwatch.py vod <url>")
    url = meta["url"]
    outdir = new_outdir(meta, a)
    print(f"FOLDER: {outdir}", flush=True)
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    rec = subprocess.Popen([*YTDLP, "--wait-for-video", "30", "--no-part", "--hls-use-mpegts",
                            "-f", fmt_arg(a), "-o", "rec.ts", url],
                           cwd=outdir, stdout=subprocess.DEVNULL, stderr=open(outdir / "rec.log", "w"),
                           creationflags=flags)
    chat = subprocess.Popen([*YTDLP, "--wait-for-video", "30", "--skip-download", "--write-subs",
                             "--sub-langs", "live_chat", "-o", "chat", url],
                            cwd=outdir, stdout=subprocess.DEVNULL, stderr=open(outdir / "chat.log", "w"),
                            creationflags=flags)
    log(f"recording + reading chat (Ctrl+C to stop) -> {outdir}")
    rec_start, done_starts, idx, stop = None, [], 0, False

    def stop_all(*_):
        nonlocal stop
        stop = True
    signal.signal(signal.SIGINT, stop_all)

    def check(final=False):
        nonlocal idx
        recf = first(outdir, "rec.ts*")  # rec.ts, or rec.ts.mp4 once merged (still MPEG-TS inside)
        if rec_start is None or recf is None:
            return
        recorded = time.time() - rec_start - 8  # don't cut the last few unflushed seconds
        msgs = parse_chat(first(outdir, "chat.live_chat.json*"), rec_start)
        for m in find_spikes(reaction_times(msgs, a), recorded, a):
            settled = final or (recorded - m["last_spike"] > a.gap and m["end"] <= recorded)
            if not settled or any(abs(m["start"] - s) < a.length for s in done_starts):
                continue
            done_starts.append(m["start"])
            idx += 1
            name = f"{idx:02d}_{hms(m['start'])}.mp4"
            m["sample"] = [txt for t, _, txt in msgs if m["spike_at"] <= t < m["spike_at"] + a.bin][:8]
            log(f"SPIKE {nice(m['start'])}: chat {m['peak_count']} vs avg {m['avg']} (x{m['ratio']})  "
                f"{' | '.join(m['sample'])[:90]}")
            try:
                with gpu():
                    run(["ffmpeg", "-y", "-v", "error", "-threads", THREADS, "-ss", f"{m['start']:.2f}",
                         "-i", recf.name, "-t", f"{m['end'] - m['start']:.2f}", *venc(), name], cwd=outdir)
                finish_clip(outdir / name, m, idx, outdir, meta, a)
            except Exception as e:
                log(f"   clip failed: {e}")
            if a.top and idx >= a.top:
                log(f"reached --top {a.top} clips")
                return "full"

    last = 0
    while not stop:
        recf = first(outdir, "rec.ts*")
        if rec_start is None and recf and recf.stat().st_size > 0:
            rec_start = time.time()
            log("stream is live - recording started")
        if rec.poll() is not None:
            log("recording ended")
            break
        if time.time() - last >= a.every:
            last = time.time()
            if check() == "full":
                break
            if rec_start:
                log(f"recorded {nice(time.time() - rec_start)}, clips so far: {idx}")
        time.sleep(2)
    for p in (rec, chat):
        if p.poll() is None:
            try:
                p.send_signal(signal.CTRL_BREAK_EVENT if os.name == "nt" else signal.SIGINT)
                p.wait(20)
            except Exception:
                p.kill()
    if not (a.top and idx >= a.top):
        check(final=True)
    (outdir / "DONE").write_text(f"stream finished, {idx} clips\n", encoding="utf-8")  # tells the editor
    log(f"done: {idx} clips -> {outdir}")


# ---------------------------------------------------------------- cli
def main():
    p = argparse.ArgumentParser(description="YouTube Clip Watcher: find the best moments and cut them.")
    sub = p.add_subparsers(dest="mode", required=True)
    for name in ("info", "live", "vod", "scan", "cut", "fetch"):
        s = sub.add_parser(name)
        if name == "cut":
            s.add_argument("--dir", required=True, help="folder made by scan")
            s.add_argument("--clips", nargs="+", required=True, help='"12:30-13:10@25=label" ...')
        else:
            s.add_argument("url")
        s.add_argument("--out", default=CFG["output_dir"])
        s.add_argument("--top", type=int, default=10 if name == "vod" else 0, help="max clips (live: 0 = no limit)")
        s.add_argument("--bin", type=int, default=10, help="seconds per chat count")
        s.add_argument("--baseline", type=int, default=300, help="seconds of history for the average")
        s.add_argument("--factor", type=float, default=3.0, help="spike = factor x average")
        s.add_argument("--min-msgs", type=int, default=6, help="min viewers chatting in a spike bin")
        s.add_argument("--pre", type=float, default=30, help="seconds before the spike")
        s.add_argument("--length", type=float, default=45, help="clip length")
        s.add_argument("--max-length", type=float, default=90)
        s.add_argument("--gap", type=float, default=40, help="merge spikes closer than this")
        s.add_argument("--height", type=int, default=2160 if name == "fetch" else 1080)
        s.add_argument("--model", default=CFG["whisper_model"], help="faster-whisper model")
        s.add_argument("--lang", default=CFG["caption_lang"], help="caption language (en, hi, ... or auto)")
        s.add_argument("--words", type=int, default=3, help="words per caption line")
        s.add_argument("--upper", action="store_true", help="UPPERCASE captions")
        s.add_argument("--font", help="caption font (default: Anton, or Mukta for Hindi)")
        s.add_argument("--font-size", type=int, default=14)
        s.add_argument("--margin-v", type=int, default=60)
        s.add_argument("--no-captions", action="store_true")
        s.add_argument("--no-short", action="store_true", help="skip the quick 9:16 version")
        if name in ("vod", "scan"):
            s.add_argument("--heat-min", type=float, default=0.5, help="min 'Most replayed' value 0-1")
        if name == "vod":
            s.add_argument("--source", choices=["auto", "chat", "heatmap"], default="auto")
            s.add_argument("--dry-run", action="store_true", help="only list the moments")
        if name == "live":
            s.add_argument("--every", type=int, default=60, help="seconds between chat checks")
    a = p.parse_args()
    try:
        {"info": cmd_info, "live": cmd_live, "vod": cmd_vod, "scan": cmd_scan, "cut": cmd_cut,
         "fetch": cmd_fetch}[a.mode](a)
    except RuntimeError as e:  # yt-dlp / ffmpeg failure -> one clear line, not a traceback
        err = [l for l in str(e).splitlines() if "ERROR" in l] or str(e).splitlines()[-1:]
        sys.exit(f"FAILED: {err[-1].strip()}\n"
                 "(private/members-only/age-restricted videos need YouTube cookies; a dead or wrong link fails "
                 "here too. Old yt-dlp? update it: python -m pip install -U \"yt-dlp[default]\")")


if __name__ == "__main__":
    main()
