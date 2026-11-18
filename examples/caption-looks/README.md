# Caption look verification

The contact sheet shows the exported frame at 0.60 seconds for every built-in look. The reel shows each export in motion. Both use the same crop from MDN's CC0 flower video and the same six manually timed words. The sample verifies rendering independently of speech recognition. [Source footage](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4)

On the test host, encoding the same 2.4 seconds of 540 × 960 video at 24 fps with CPU libx264, medium preset and CRF 18 took 1.12 seconds with the previous default ASS captions. Individual new looks took 0.94–1.06 seconds in this single run. Measurements include subtitle preparation and the caption encode. Capture, transcription, framing and upload run separately. Longer recordings, stickers and different hardware can change these timings.

| Look | Seconds |
|---|---:|
| Hype | 1.062 |
| Trio | 0.983 |
| Beast | 0.998 |
| Spotlight | 0.951 |
| Vice | 1.037 |
| Punch | 1.044 |
| Neon | 0.992 |
| Comic | 0.988 |
| Typed | 0.937 |
| Karaoke | 0.952 |
| Clean | 0.996 |
| Pixel | 1.003 |

Browser checks covered selecting and cancelling Auto setup, captured-frame thumbnails, enabling Auto with Pixel, selecting Trio in the editor, and adding a sticker to a render request. Those interactions used fixture API responses. A separate real API rerender exported Vice with a timed sticker, then reloaded the saved settings. The automated FFmpeg test samples frames before, during and after a sticker's interval.
