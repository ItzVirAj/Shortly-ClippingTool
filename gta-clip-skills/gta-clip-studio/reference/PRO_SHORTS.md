# Pro Shorts ("Evidence Mode")

The premium look: full-screen 9:16 crop (no blurred borders), hook plates, a counter (`THING 03/12`), claim plates with
stamps (`CONFIRMED` / `RUMOR` / `THEORY` / `BUSTED`), word-by-word captions (current word in yellow), a source credit,
punch-ins, SFX and a -14 LUFS mix. Use it for list/fact videos ("12 things you need to do...") and for the user's best
moments. Use the normal clipdesk edit for quick reaction clips.

## Steps

1. Download the full video in high quality: `RUN clipwatch fetch "<url>"` (up to 4K; `--height 1080` for smaller).
   It prints `FOLDER` and `SOURCE`.
2. Get a transcript to pick from: `RUN clipwatch scan "<url>"` (or reuse an earlier scan).
3. Write `FOLDER/shorts.json` (format below). One entry per Short, 30-55 s each.
4. QA first: `RUN pro_short "FOLDER/shorts.json" --stills-only`. Look at every `<id>_QA.jpg`. Plates and captions must
   not cover faces or the key action, the crop must keep the subject in frame, and nothing may be cut off at the edges.
   Fix `crop_x`, `hook_y`, claim timing and so on, then run again.
5. Render: `RUN pro_short "FOLDER/shorts.json"` (or `--only <id>`). The output is `<out>/<id>_FINAL.mp4`.

## shorts.json

```json
{
  "source": "C:/.../FOLDER/source.mkv",
  "credit": "SOURCE · CHANNEL NAME (YOUTUBE)",
  "out": "C:/.../FOLDER/shorts",
  "shorts": [
    {
      "id": "01_six_stars",
      "start": "6:55", "end": "7:34",
      "crop_x": 0.5,
      "crop_rows": [0, 1.0],
      "hook": ["6 STARS", "THE WHOLE MAP HUNTS YOU"], "hook_until": 2.6,
      "counter": ["THING", "12", "12"],
      "claims": [{"at": 14, "dur": 4.5, "kicker": "MAX WANTED LEVEL", "head": "6 STARS", "stamp": "CONFIRMED"}],
      "punches": [21.5],
      "vo": [[0.2, "a", "Six stars means the whole map is hunting you."]],
      "cta": ["FOLLOW FOR", "THE FULL DAY 1 PLAN"]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `start` / `end` | position in the source video (`m:ss` or `h:mm:ss`) |
| `crop_x` | 0 = left edge, 0.5 = centre, 1 = right. Or pan steps `[[0, 0.3], [8.5, 0.7]]` ("from 8.5 s on, frame 0.7"), eased |
| `crop_rows` | part of the height to keep, as fractions, e.g. `[0.06, 0.82]` to skip a burned-in top bar and the source's own captions |
| `hook` | 1-2 lines shown until `hook_until` s |
| `counter` | `[label, n, of]` shown after the hook |
| `claims` | plates at `at` s for `dur` s; `stamp` is optional (CONFIRMED / RUMOR / THEORY / BUSTED). Only stamp facts you checked |
| `punches` | seconds with a quick zoom punch + impact SFX |
| `vo` | **ElevenLabs mode only.** `[seconds, voice, text]`. Leave it out to keep the streamer's voice |
| `cta` | 2-line end card for the last ~2.4 s |
| `hook_y`, `cta_y`, `hide_caps_under_hook`, `cta_len` | fine-tuning |

## Style rules

- Hook in the first 1.5 s, one idea per Short, end on a line that loops back to the start.
- Something changes every 1-1.5 s (a punch, a plate, a caption, a pan). Static shots still get the slow push.
- Safe zones: keep text out of the top 220 px and the bottom 380 px (platform UI). Never put a plate on a face.
- Facts: only stamp `CONFIRMED` what an official source confirms. `RUMOR` / `THEORY` for the rest. No invented facts or timestamps.
- Credit the source channel in `credit`. It stays on screen.
- Palette: coral `#FF5A4E`, teal `#00A9A5`, yellow `#FFC83D`, sand `#FFF6E8`, ink `#14161A`.
  Fonts: Anton (headlines), Inter (labels, captions).
