"""Shared bits for every GTA Clipping Studio script: paths, config, encoder, whisper, fonts, logging."""
import json, os, re, site, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # the skill folder
SCRIPTS = ROOT / "scripts"
ASSETS = ROOT / "assets"
FONTS = ASSETS / "fonts"
SFX = ASSETS / "sfx"
CONFIG = ROOT / "config.json"
ENV_FILE = ROOT / ".env"

for _s in (sys.stdout, sys.stderr):  # emoji in chat/titles must not crash a Windows console
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

DEFAULTS = {
    "output_dir": str(Path.home() / "GTA-Clip-Studio" / "clips"),
    "voice_mode": "streamer",            # "streamer" = keep the streamer's own voice | "elevenlabs" = add your voice-over
    "elevenlabs": {
        "model_id": "eleven_multilingual_v2",
        "voices": {                       # short name used in --vo "SEC|name|text" -> ElevenLabs voice + caption colour
            "a": {"label": "Voice A", "voice_id": "", "color": "#FF5FA2"},
            "b": {"label": "Voice B", "voice_id": "", "color": "#4FD1FF"},
        },
        "stability": 0.45,
        "similarity_boost": 0.8,
        "style": 0.35,
    },
    "caption_lang": "en",
    "encoder": "libx264",                 # set by setup: h264_nvenc / h264_videotoolbox / h264_qsv / h264_amf / libx264
    "whisper_device": "cpu",              # set by setup: cuda / cpu
    "whisper_model": "small",             # set by setup: large-v3-turbo on NVIDIA, small on CPU
    "threads": max(2, min(8, (os.cpu_count() or 4) // 2)),
    "hook_font": "Anton-Regular.ttf",
    "text_font": "Inter.ttf",
}


def _merge(base, extra):
    out = dict(base)
    for k, v in (extra or {}).items():
        out[k] = _merge(base[k], v) if isinstance(v, dict) and isinstance(base.get(k), dict) else v
    return out


def load_config():
    cfg = DEFAULTS
    if CONFIG.exists():
        try:
            cfg = _merge(DEFAULTS, json.loads(CONFIG.read_text(encoding="utf-8")))
        except ValueError:
            pass
    if not cfg.get("output_dir"):
        cfg = {**cfg, "output_dir": DEFAULTS["output_dir"]}
    return cfg


def save_config(cfg):
    CONFIG.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def env(name):
    """Environment variable, or a line NAME=value in the skill's .env file (the buyer writes that file themselves)."""
    if os.environ.get(name):
        return os.environ[name].strip()
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                if k.strip() == name:
                    return v.strip().strip('"').strip("'")
    return ""


CFG = load_config()
THREADS = str(CFG["threads"])


def log(*a):
    print(time.strftime("[%H:%M:%S]"), *a, flush=True)


# ---------------------------------------------------------------- video encoder (GPU when there is one)
def venc(quality="normal"):
    """ffmpeg video+audio encode args for the encoder setup picked. quality: normal | high."""
    e = CFG.get("encoder", "libx264")
    hi = quality == "high"
    if e == "h264_nvenc":
        v = ["-c:v", "h264_nvenc", "-preset", "p6" if hi else "p5", "-rc", "vbr", "-cq", "17" if hi else "21", "-b:v", "0",
             "-maxrate", "40M" if hi else "12M", "-bufsize", "80M" if hi else "24M"]
    elif e == "h264_videotoolbox":
        v = ["-c:v", "h264_videotoolbox", "-b:v", "16M" if hi else "10M"]
    elif e == "h264_qsv":
        v = ["-c:v", "h264_qsv", "-global_quality", "18" if hi else "22"]
    elif e == "h264_amf":
        v = ["-c:v", "h264_amf", "-quality", "quality", "-rc", "cqp", "-qp_i", "18" if hi else "22",
             "-qp_p", "18" if hi else "22"]
    else:
        v = ["-c:v", "libx264", "-preset", "medium" if hi else "veryfast", "-crf", "17" if hi else "21"]
    return v + ["-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"]


def vonly(quality="normal"):
    """Video-only encode args (no audio options)."""
    a = venc(quality)
    i = a.index("-c:a")
    return a[:i] + ["-movflags", "+faststart"]


# ---------------------------------------------------------------- fonts / ffmpeg paths
def ff_path(p):
    """A file path written inside an ffmpeg filtergraph (Windows drive colons must be escaped)."""
    s = str(Path(p).resolve()).replace("\\", "/")
    return s.replace(":", r"\:").replace("'", r"\'")


def font(kind="hook"):
    """Bundled font (downloaded by setup), else a system fallback."""
    name = CFG["hook_font"] if kind == "hook" else CFG["text_font"]
    p = FONTS / name
    if p.exists():
        return p
    for cand in (["C:/Windows/Fonts/ariblk.ttf", "/Library/Fonts/Arial Black.ttf",
                  "/usr/share/fonts/truetype/msttcorefonts/Arial_Black.ttf"] if kind == "hook" else
                 ["C:/Windows/Fonts/arialbd.ttf", "/Library/Fonts/Arial Bold.ttf",
                  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]):
        if Path(cand).exists():
            return Path(cand)
    return p


def caption_font_name(text=""):
    """Anton for Latin text; Mukta ExtraBold (Hindi/Devanagari + Latin) when the captions use another script."""
    if any(ord(ch) > 0x24F for ch in text if ch.isalpha()) and (FONTS / "Mukta-ExtraBold.ttf").exists():
        return "Mukta ExtraBold"
    return "Anton" if (FONTS / CFG["hook_font"]).exists() else "Arial Black"


def duration(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(f)],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip() or 0)
    except ValueError:
        return 0.0


def video_size(f):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                        "-of", "csv=p=0:s=x", str(f)], capture_output=True, text=True)
    w, h = (r.stdout.strip().splitlines() or ["1920x1080"])[0].split("x")[:2]
    return int(w), int(h)


def decode16k(path, cwd=None):
    """Mono 16 kHz float32 numpy audio, decoded by ffmpeg (avoids PyAV version trouble)."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-threads", THREADS, "-i", str(path), "-ac", "1", "-ar", "16000",
                          "-f", "f32le", "-"], capture_output=True, cwd=cwd).stdout
    return np.frombuffer(raw, dtype=np.float32)


# ---------------------------------------------------------------- whisper (GPU when available, CPU otherwise)
_model = None


def whisper_model(name=None):
    global _model
    if _model is not None:
        return _model
    name = name or CFG["whisper_model"]
    device = CFG.get("whisper_device", "cpu")
    if device == "cuda":
        # pip nvidia-cublas/cudnn wheels ship DLLs that are not on PATH -> add them before importing
        for sp in site.getsitepackages() + [site.getusersitepackages()]:
            for sub in ("cublas", "cudnn", "cuda_nvrtc"):
                p = os.path.join(sp, "nvidia", sub, "bin" if os.name == "nt" else "lib")
                if os.path.isdir(p):
                    if os.name == "nt":
                        os.add_dll_directory(p)
                    os.environ["PATH"] = p + os.pathsep + os.environ.get("PATH", "")
    from faster_whisper import WhisperModel
    if device == "cuda":
        try:
            log(f"loading whisper {name} on GPU ...")
            _model = WhisperModel(name, device="cuda", compute_type="float16")
            return _model
        except Exception as e:  # driver/DLL trouble -> keep working on CPU
            log(f"GPU whisper failed ({str(e)[:120]}), using CPU")
            name = "small" if name.startswith("large") else name
    log(f"loading whisper {name} on CPU ...")
    _model = WhisperModel(name, device="cpu", compute_type="int8")
    return _model


def safe(name):
    return re.sub(r"[^\w\-]+", "_", name or "stream").strip("_")[:40] or "stream"
