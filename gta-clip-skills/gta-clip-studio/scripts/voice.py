#!/usr/bin/env python
"""
Voice-over with ElevenLabs (only used when voice_mode = "elevenlabs").

  python voice.py status                     key found? which voices are set?
  python voice.py voices                     list the voices on your ElevenLabs account
  python voice.py set a <voice_id> [--label "Max"] [--color "#FF5FA2"]
  python voice.py say a "Nobody saw that coming." --out test.mp3
  python voice.py mode streamer|elevenlabs   default voice mode for new clips

The API key is read from the ELEVENLABS_API_KEY environment variable, or from a line
ELEVENLABS_API_KEY=... in the .env file in the skill folder. Write it there yourself;
don't paste it into a chat.
"""
import argparse, hashlib, json, sys, urllib.error, urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import CFG, ENV_FILE, env, load_config, save_config  # noqa: E402

API = "https://api.elevenlabs.io/v1"


def key():
    k = env("ELEVENLABS_API_KEY") or env("XI_API_KEY")
    if not k:
        sys.exit(f"No ElevenLabs API key. Put a line  ELEVENLABS_API_KEY=your_key  in {ENV_FILE}\n"
                 "(or set the ELEVENLABS_API_KEY environment variable), then try again.")
    return k


def _req(url, data=None, accept="application/json"):
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data is not None else None,
                                 headers={"xi-api-key": key(), "Content-Type": "application/json", "Accept": accept},
                                 method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:400]
        sys.exit(f"ElevenLabs error {e.code}: {body}")


def voices_cfg():
    return CFG["elevenlabs"]["voices"]


def tts(text, who, out_mp3):
    """Speak text with voice `who` (a name from config) into out_mp3. Cached by text+voice+settings."""
    v = voices_cfg().get(who)
    if not v or not v.get("voice_id"):
        sys.exit(f"voice '{who}' has no ElevenLabs voice_id yet. Run: python voice.py voices, then "
                 f"python voice.py set {who} <voice_id>")
    el = CFG["elevenlabs"]
    body = {"text": text, "model_id": el["model_id"],
            "voice_settings": {"stability": el["stability"], "similarity_boost": el["similarity_boost"],
                               "style": el.get("style", 0), "use_speaker_boost": True}}
    out_mp3 = Path(out_mp3)
    stamp = hashlib.sha1(json.dumps([v["voice_id"], body], sort_keys=True).encode()).hexdigest()
    tag = out_mp3.with_suffix(".key")
    if out_mp3.exists() and tag.exists() and tag.read_text() == stamp:
        return out_mp3
    audio = _req(f"{API}/text-to-speech/{v['voice_id']}?output_format=mp3_44100_128", body, accept="audio/mpeg")
    out_mp3.parent.mkdir(parents=True, exist_ok=True)
    out_mp3.write_bytes(audio)
    tag.write_text(stamp)
    return out_mp3


def main():
    p = argparse.ArgumentParser(description="ElevenLabs voice-over setup")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status")
    sub.add_parser("voices")
    s = sub.add_parser("set")
    s.add_argument("name")
    s.add_argument("voice_id")
    s.add_argument("--label")
    s.add_argument("--color")
    y = sub.add_parser("say")
    y.add_argument("name")
    y.add_argument("text")
    y.add_argument("--out", default="voice_test.mp3")
    m = sub.add_parser("mode")
    m.add_argument("mode", choices=["streamer", "elevenlabs"])
    a = p.parse_args()

    if a.cmd == "status":
        has = bool(env("ELEVENLABS_API_KEY") or env("XI_API_KEY"))
        print(f"voice_mode (default): {CFG['voice_mode']}")
        print(f"ElevenLabs key: {'found' if has else 'missing'}  (.env: {ENV_FILE})")
        for n, v in voices_cfg().items():
            print(f"  {n}: {v.get('label')}  voice_id={v.get('voice_id') or '(not set)'}  colour {v.get('color')}")
    elif a.cmd == "voices":
        data = json.loads(_req(f"{API}/voices"))
        for v in data.get("voices", []):
            print(f"{v['voice_id']}  {v['name']}  ({v.get('category', '')})")
    elif a.cmd == "set":
        cfg = load_config()
        v = cfg["elevenlabs"]["voices"].setdefault(a.name, {"label": a.name, "voice_id": "", "color": "#FFFFFF"})
        v["voice_id"] = a.voice_id
        if a.label:
            v["label"] = a.label
        if a.color:
            v["color"] = a.color
        save_config(cfg)
        print(f"voice '{a.name}' -> {a.voice_id}")
    elif a.cmd == "say":
        print(tts(a.text, a.name, a.out))
    elif a.cmd == "mode":
        cfg = load_config()
        cfg["voice_mode"] = a.mode
        save_config(cfg)
        print(f"default voice mode: {a.mode}")


if __name__ == "__main__":
    main()
