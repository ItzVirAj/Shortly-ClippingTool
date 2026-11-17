# GTA Clipping Studio

Paste a YouTube link → get finished, ready-to-post 9:16 Shorts. A skill for **Claude Code**.

- Works on **live streams** (clips while the stream is still running), **finished streams** and **any video**
- Finds the best moments by itself: chat spikes, YouTube "Most replayed", loud reactions and the transcript
- Edits every clip: hook title, punch-in zoom on the payoff, bold captions, streamer credit, clean audio
- **Voice: your choice every time.** Keep the streamer's own voice (default), or add **your own ElevenLabs voice-over**
  (one or two voices, coloured captions, the streamer ducks under your voice automatically)
- **Pro Shorts** mode: full-screen crop, stamps, counters, word-by-word captions, SFX
- Fast on NVIDIA GPUs, and it still works on any PC (CPU fallback)

## What you need

- **Claude Code** (desktop app or terminal) on Windows 10/11, macOS or Linux. It runs on your own PC, not in the
  claude.ai web chat.
- About 6 GB of free disk space, and internet for the first setup.
- Optional: an NVIDIA GPU (much faster); an ElevenLabs account and API key (only for the voice-over option).

## Install (2 minutes of your time; setup runs by itself)

1. Unzip `gta-clip-studio.zip`.
2. Open Claude Code and paste the text from **`INSTALL_PROMPT.txt`** (replace the path with where you unzipped it).
3. Claude copies the skill into place, tells you what it will install, and on your OK installs everything:
   Python, ffmpeg, Node.js, yt-dlp, faster-whisper, Playwright, fonts and sound effects. It ends with `READY`.

Manual install instead: copy the `gta-clip-studio` folder to `~/.claude/skills/` (Windows:
`C:\Users\<you>\.claude\skills\`), then run `setup\install.ps1` (Windows) or `bash setup/install.sh` (Mac/Linux).

## Use

Just talk to Claude:

> Make 5 shorts from this: https://www.youtube.com/watch?v=...

> This stream is live, clip it: https://www.youtube.com/@channel/live

Claude asks two things: **streamer voice or your ElevenLabs voice**, and **how many clips**. Then it cuts, edits,
ranks and gives you the files. Finished shorts are in `~/GTA-Clip-Studio/clips/<date>_<channel>_<id>/final/`, and
`BEST.md` there lists them best first.

## ElevenLabs voice-over (optional)

1. Create the file `.env` in the skill folder (`~/.claude/skills/gta-clip-studio/.env`) with one line:
   `ELEVENLABS_API_KEY=your_key_here`
   Keep this key private: don't paste it into a chat or share the folder with it inside.
2. Say "use my ElevenLabs voice". Claude lists your voices and you pick voice A (and optionally B).
3. Make it your default if you like: "make ElevenLabs my default voice" (or `voice_mode` in `config.json`).

## No PC? Clip from your phone (free)

This skill needs a PC with Claude Code. No PC or no Claude plan? Use **Opus Clip** on your phone, free:

1. Open https://www.opus.pro or install the **OpusClip** app (Play Store / App Store) and sign up free.
2. Paste the YouTube link and tap **Get clips**. Its AI picks the best moments and makes 9:16 clips with captions.
3. Pick the clips you like, then download or post them to Shorts, Reels or TikTok.

The free plan gives monthly credits (check the current limits on their site). Live-stream clipping, chat spikes and
your own voice-over need this skill on a PC.

## Settings (`config.json`, made by setup)

| Key | Meaning |
|---|---|
| `output_dir` | where clips go |
| `voice_mode` | `streamer` (default) or `elevenlabs` |
| `elevenlabs.voices` | your voices: `voice_id`, `label`, caption `color` |
| `caption_lang` | `en`, `hi`, … or `auto` |
| `encoder`, `whisper_device`, `whisper_model` | picked by setup for your PC |

## Fair use

Always credit and link the original streamer (it's burned into every short and listed in `CREDITS.txt`). Reposting
someone else's content needs their permission or must count as fair use. Commentary voice-over and edits help, but
you are responsible for what you upload.

## Troubleshooting

- Check the install: ask Claude "check GTA Clipping Studio setup", or run `.venv` python with `setup/setup.py --check`.
- YouTube errors: update yt-dlp with `.venv` python `-m pip install -U "yt-dlp[default]"`.
- Members-only or age-restricted videos need your browser's YouTube cookies. Ask Claude.

Built on open-source tools: yt-dlp, faster-whisper (OpenAI Whisper models), FFmpeg, Playwright, and the Anton and
Inter fonts (SIL Open Font License, licences in `assets/fonts`).
