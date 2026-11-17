---
name: gta-clip-studio
description: Turn any YouTube live stream, finished stream or video (GTA and other gaming) into ready-to-post 9:16 Shorts automatically. It finds the best moments from chat spikes, "Most replayed", loudness and the transcript, cuts them, and edits each one with a hook title, punch-in zoom, captions and a streamer credit. It keeps the streamer's own voice, or adds your ElevenLabs voice-over if you pick that. Use it whenever the user pastes a YouTube link and asks for clips, shorts, reels or highlights ("clip this stream", "make 5 shorts from this", "is live ki clipping karo", "isme se clips banao"), or asks to set up or install GTA Clipping Studio.
---

# GTA Clipping Studio

Paste a YouTube link, get finished Shorts. Everything runs on the user's own PC.

`SKILL` below = the folder this file is in. Run every tool through the skill's own Python:

- Windows: `"SKILL/.venv/Scripts/python.exe" "SKILL/scripts/run.py" <tool> ...`
- Mac/Linux: `"SKILL/.venv/bin/python" "SKILL/scripts/run.py" <tool> ...`

Below, `RUN <tool> ...` means that command. The tools are `clipwatch` (find and cut), `clipdesk` (edit),
`voice` (ElevenLabs) and `pro_short` (Pro Shorts).

## 0. First time: install (automatic)

If `SKILL/.installed` doesn't exist, or a tool fails with a missing module or command, set the skill up before anything else:

1. Tell the user in one short message what will be installed and ask for an OK: Python 3.12, ffmpeg (full build) and
   Node.js if missing (from winget on Windows, Homebrew or apt on Mac/Linux), then yt-dlp, faster-whisper,
   Playwright + headless Chromium, free fonts (Anton, Inter) and a generated sound-effect kit, all inside the skill folder.
   The whisper model downloads once (about 0.5-1.6 GB).
2. On their OK, run it in the background (it takes 5-20 min):
   - Windows: `powershell -ExecutionPolicy Bypass -File "SKILL/setup/install.ps1"`
   - Mac/Linux: `bash "SKILL/setup/install.sh"`
3. When it finishes, run the check with the skill's Python (path above): `"SKILL/.venv/.../python" "SKILL/setup/setup.py" --check`,
   and show the result. It must end with `READY`.
   If something is missing, fix that one thing and run the check again.

Setup picks the hardware by itself: an NVIDIA GPU gets NVENC encoding and whisper large-v3-turbo on the GPU. A Mac gets
VideoToolbox. Any other PC gets CPU (whisper `small`, x264), which is slower but works.

## 1. When the user gives a link

1. Run `RUN clipwatch info "<url>"`. It prints the title, channel, `live_status`, length, whether there is a chat
   replay, and `suggested_mode` (`live` / `vod` / `scan`).
2. Ask the user both questions **in one AskUserQuestion call**, before cutting anything:
   - **Voice**: "Keep the streamer's own voice (Recommended)" / "Add my own ElevenLabs voice-over".
     The streamer's voice is the default; `config.json` → `voice_mode` holds the user's usual choice, so list that first.
   - **How many clips**: 3 / 5 / 10 (or Other). For a live stream: "as many as happen" / a number.
   If the user already said either one in their message, don't ask it again.
3. If they picked **ElevenLabs**, run `RUN voice status` first:
   - Key missing: ask the user to add a line `ELEVENLABS_API_KEY=...` to `SKILL/.env` themselves (create the file),
     or to set that environment variable. Don't ask them to paste the key into the chat, and never print it.
   - Voices not set: run `RUN voice voices`, show the list, ask which voice is A and which is B (B is optional), then
     `RUN voice set a <voice_id> --label "Name"` (and `b`). One voice is fine; then use only `a` in the lines.
   - Make one test line, `RUN voice say a "Quick test." --out "<output>/voice_test.mp3"`, so a wrong voice is caught early.
4. Cut the clips (step 2), then edit every clip (step 3), then report (step 5).

## 2. Find and cut the moments

Pick the route by `suggested_mode`. `N` = the number of clips the user asked for.

| Link | Command | What happens |
|---|---|---|
| finished stream with chat replay (`vod`) | `RUN clipwatch vod "<url>" --top N` | chat spikes (each viewer counts once, link spam ignored), falls back to "Most replayed"; downloads only the clip parts |
| any other video (`scan`) | `RUN clipwatch scan "<url>"`, then you pick, then `RUN clipwatch cut --dir "<FOLDER>" --clips ...` | see below |
| live or upcoming (`live`) | `RUN clipwatch live "<url>"` (add `--top N` if the user gave a number), in the background | records, reads chat, cuts while it runs; see step 4 |

**Scan route (you pick the moments):** read `transcript.txt` and `signals.md` in the folder it prints. Pick the N best
self-contained moments (a funny line, a fail, a clutch play, rage, a reveal, a big reaction). Use the loud peaks and
Most-replayed peaks as hints, not as the answer; when signals.md has none, go by the transcript alone. For an edited
video (narrated, not a stream), a moment is a self-contained story beat, tip or joke that makes sense without the rest.
Cut N + 1-2 extra candidates, so you can drop the weakest and still deliver N. Each clip should be 15-60 s, starting 1-3 s before the setup and ending
just after the payoff. Then:

`RUN clipwatch cut --dir "<FOLDER>" --clips "12:30-13:10@25=helmet fail" "1:02:00-1:02:40@18=clutch"`

`@N` is the second inside the clip where the payoff lands. It becomes the default zoom point for `clipdesk edit`
(`--zoom-at` overrides it). `=label` is a short note.

If `vod` finds fewer moments than the user asked for (small streams have quiet chats), run `scan` on the same link
and pick the rest yourself with `cut` (skip times you already have).

Useful options: `--lang hi` (or `auto`) for non-English captions (Hindi captions get a Hindi-capable font automatically), `--min-msgs 3` and `--factor 2.5` for small streams,
and `--length 60` for longer clips. vod, scan, cut, live and fetch print `FOLDER: ...`; that is the folder for clipdesk.

## 3. Edit every clip into a finished Short

Follow `SKILL/reference/EDITOR.md` (rules for hooks, trims, zoom, voice-over and when to drop a clip). In short:

1. `RUN clipdesk pending --dir "<FOLDER>"` prints, for each new clip, the chat at the spike, the transcript with seconds,
   and a frame sheet image. **Look at the frame sheet** with Read, then decide.
2. Nothing real happened? Drop it: `RUN clipdesk drop N --dir "<FOLDER>" --note "why"`.
3. Otherwise edit it:
   - **Streamer voice:** `RUN clipdesk edit N --dir "<FOLDER>" --hook "HE DID NOT SEE THAT" --score 8 --trim 3 38 --zoom-at 24 --note "what happens"`
   - **ElevenLabs:** the same plus 2-4 lines: `--vo "0.3|a|Setup line here." --vo "21|b|Short closing line."`.
     Seconds are inside the trimmed clip. Never talk over the payoff.
   - **Two clocks:** `--trim` and `--zoom-at` are seconds in the raw clip (as `pending` shows them); `--vo` seconds
     are in the finished, trimmed clip (0 = the first frame after the trim).
   - **Source already has captions burned in** (common for edited YouTube videos; you'll see text on the frame sheet):
     add `--no-captions`, or the short shows two caption tracks. Voice-over captions still appear.
4. `RUN clipdesk rank --dir "<FOLDER>"` writes `BEST.md`, best first.
5. Spot-check one or two finished shorts: grab 2 frames with ffmpeg and look at them (hook readable, captions not on
   faces, zoom not cutting the action).

If the user asked for N clips and too many get dropped, cut a few more candidates (scan route) to reach N.
Leave the extra good ones in `BEST.md` as bonus clips.

**Pro Shorts (optional, when the user wants the premium look):** stamps, claim plates, a counter, word-by-word captions
and SFX, built from a full-quality download. See `SKILL/reference/PRO_SHORTS.md`.

## 4. Live streams

1. Start `RUN clipwatch live "<url>"` in the background. It prints `FOLDER: ...` right away and writes a `DONE` file
   there when the stream ends.
2. Every ~5 minutes (use /loop or ScheduleWakeup at ~300 s), run step 3 on the new clips (`pending` → edit or drop →
   `rank`). Keep going until `DONE` exists, then finish the last clips and rank once more.
3. For a long stream, suggest the user keeps the PC awake. Never stop the recorder unless the user asks.
4. Members-only or age-restricted streams need YouTube cookies. Tell the user; yt-dlp's `--cookies-from-browser chrome`
   is the usual fix (add it to the yt-dlp command in `clipwatch.py` only if the user agrees).

## 5. Report to the user

Answer in the user's language and keep it short: how many moments were found, how many kept vs dropped, and the top
3-5 with hook, score and file path (`FOLDER/final/NN_final.mp4`). Then point to `BEST.md` and `CREDITS.txt`.

## No PC? Phone users

This skill needs a PC (Windows, Mac or Linux) with Claude Code. If the user, or someone they ask about, has no PC, no
Claude plan, or wants to clip from a phone, point them to **Opus Clip** (free plan, works on a phone):
https://www.opus.pro, or the **OpusClip** app on the Play Store / App Store. Paste the YouTube link, tap Get clips,
pick and download. The free plan has monthly credit limits; live-stream clipping, chat spikes and ElevenLabs
voice-over stay PC-only (this skill).

## Rules

- **Always credit and link the streamer** in every upload (the credit is burned into each short; links are in
  `CREDITS.txt` and `BEST.md`). Remind the user that reposting other people's streams needs their permission or must
  fall under fair use. Transformative edits (commentary voice-over, hooks) help, but they are no guarantee.
- One heavy job at a time: the scripts lock the GPU/encoder between themselves. Don't start other heavy renders in parallel.
- Hooks: 3-6 words, true to the clip, no emoji, no claims about the real streamer.
- Never edit `clips.json`, the raw clips or the live recording by hand; clipdesk writes only `review.json` and `final/`.
- Output goes to `config.json` → `output_dir` (default `~/GTA-Clip-Studio/clips`). The user can change it there.

## Files

| Path | What |
|---|---|
| `scripts/clipwatch.py` | find + cut (info, live, vod, scan, cut, fetch) |
| `scripts/clipdesk.py` | review + edit + rank |
| `scripts/voice.py` | ElevenLabs key/voice setup and test |
| `scripts/shorts/pro_short.py` | Pro Shorts renderer (overlay.html + render_overlay.js) |
| `reference/EDITOR.md` | editing rules (read before editing) |
| `reference/PRO_SHORTS.md` | Pro Shorts spec + style |
| `setup/` | installers + `setup.py --check` |
| `config.json` | made by setup: voice mode, voices, encoder, whisper, output folder |
