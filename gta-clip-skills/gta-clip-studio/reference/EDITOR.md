# Editing rules (Clip Desk)

You turn raw clips into finished 9:16 Shorts. The raw clips come from `clipwatch` (16:9 cut + captions + a quick 9:16)
in a stream folder. You write only through `clipdesk`, which keeps `review.json` and `final/`.

## For each new clip

1. `RUN clipdesk pending --dir "<FOLDER>"` gives the chat at the spike, the transcript with seconds, and a frame sheet
   (8 frames with timestamps). **Look at the frame sheet** with Read, and read the transcript and chat. Work out what
   actually happened.
   Edited videos (narrated, not streams) have no chat: judge them by the transcript and frames alone.
2. **Drop** it when nothing happened on screen or in speech: giveaway or "hi from X" chat waves, raids, spam, a menu or
   loading screen, dead air, an ad read.
   `RUN clipdesk drop N --dir "<FOLDER>" --note "why"`
3. **Edit** it when there is a real moment (a funny line, a fail, a clutch play, rage, a big reveal, a reaction):
   `RUN clipdesk edit N --dir "<FOLDER>" --hook "..." --score 1-10 --trim START END --zoom-at S --note "what happens"`
   - `--hook`: in English unless the user wants another language. 3-6 words that make people want to watch and stay
     true to the clip. No emoji (the font can't draw them).
   - `--trim`: seconds inside the clip. Start 1-2 s before the setup and end right after the payoff. Usually 15-45 s;
     cut dead air at both ends.
   - `--zoom-at`: the second **in the raw clip** (same clock as `--trim` and `pending`) where the payoff or reaction
     lands. The punch-in zoom fires there. If left out, it uses the `@N` from `cut`, or just before the chat spike.
   - `--no-captions`: when the source already has captions burned into the picture (look at the frame sheet).
     Without it the short shows two caption tracks.
   - `--score`: 9-10 could go viral, 7-8 solid, 5-6 filler. Below 5, drop the clip instead.
4. After each batch: `RUN clipdesk rank --dir "<FOLDER>"`.

## Voice: the user's choice, asked every time a link comes in

### Streamer voice (default)
No `--vo`. The streamer's own voice and the game audio stay as they are, loudness-normalised, with the streamer's
words as captions. This is the default and the safest choice.

### ElevenLabs voice-over
The user's ElevenLabs voices (A, and optionally B) talk over the clip like commentators. Add 2-4 lines per clip:
`--vo "SECONDS|a|line"` and `--vo "SECONDS|b|line"`.

- SECONDS are inside the **trimmed** clip (0 = the first frame after `--trim`).
- Line 1 (around 0.3 s) sets up the situation. One line can tease or react before the moment.
  **Never talk over the payoff:** let the streamer's own reaction play, then add one short closing line if there's room.
- 6-14 words per line (about 3-5 s spoken). Plain, witty, true to what's on screen. No swearing, and nothing claimed
  about the real streamer that the clip doesn't show.
- With one voice, use only `a`. With two, let them talk to each other like a duo.
- The streamer and the game duck under the voices automatically and come back up in the gaps. Captions show each voice
  in its own colour (set in `config.json`).
- Lines are cached, so re-rendering with the same text costs no new ElevenLabs credits. Changed text costs credits again.
- If a line runs past the end of the clip, clipdesk warns you. Start it earlier or shorten it.

## Quality check

Now and then, grab 2 frames from a finished short (full paths, saved in `review/`, never in `final/`) and look at them:
`ffmpeg -v error -y -ss 2 -i "<FOLDER>/final/NN_final.mp4" -frames:v 1 "<FOLDER>/review/NN_check_2s.jpg"`
Check that the hook is readable, there's only one caption track, captions don't sit on faces, and the zoom doesn't
cut the action out.

## Rules

- Never touch `clips.json`, the raw clips or the recording, and never stop a running `clipwatch live`.
- Heavy jobs are locked automatically (gpulock), so captions and encodes never overlap. Don't start other heavy jobs.
- Every upload credits and links the streamer (`CREDITS.txt`, the link column in `BEST.md`).
- Report to the user: clips in, kept vs dropped, top 3-5 with hook + score + file path, anything that looked off.
