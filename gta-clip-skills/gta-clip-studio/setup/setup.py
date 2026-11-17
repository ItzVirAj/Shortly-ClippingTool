#!/usr/bin/env python
"""
GTA Clipping Studio - one-time setup (safe to run again; it only fills in what is missing).

  python setup/setup.py            install everything into this skill folder
  python setup/setup.py --check    only report what is there (doctor)

What it does:
  1. checks Python 3.10+, ffmpeg/ffprobe, Node.js/npm (install.ps1 / install.sh install those first)
  2. makes a private Python environment in .venv and installs yt-dlp, faster-whisper, numpy
     (+ NVIDIA cuBLAS/cuDNN wheels when an NVIDIA GPU is present)
  3. installs Playwright + its headless Chromium into node_modules (for Pro Shorts overlays)
  4. downloads the free fonts (Anton, Inter - SIL Open Font License) into assets/fonts
  5. makes the sound-effect kit into assets/sfx
  6. picks the fastest video encoder and whisper device this PC has, downloads the whisper model
  7. writes config.json (your voice settings are kept) and run.cmd / run.sh launchers
"""
import json, os, platform, shutil, subprocess, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENV = ROOT / ".venv"
WIN = os.name == "nt"
VPY = VENV / ("Scripts/python.exe" if WIN else "bin/python")
FONTS = ROOT / "assets" / "fonts"
FONT_URLS = {
    "Anton-Regular.ttf": "https://github.com/google/fonts/raw/main/ofl/anton/Anton-Regular.ttf",
    "Anton-OFL.txt": "https://github.com/google/fonts/raw/main/ofl/anton/OFL.txt",
    "Inter.ttf": "https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
    "Inter-OFL.txt": "https://github.com/google/fonts/raw/main/ofl/inter/OFL.txt",
    "Mukta-ExtraBold.ttf": "https://github.com/google/fonts/raw/main/ofl/mukta/Mukta-ExtraBold.ttf",
    "Mukta-OFL.txt": "https://github.com/google/fonts/raw/main/ofl/mukta/OFL.txt",
}
ENCODERS = ["h264_nvenc", "h264_videotoolbox", "h264_qsv", "h264_amf", "libx264"]
OK, BAD = "OK  ", "MISS"


def say(*a):
    print(*a, flush=True)


def run(cmd, **kw):
    say("  $", " ".join(map(str, cmd))[:160])
    return subprocess.run(cmd, **kw)


def have(cmd):
    return shutil.which(cmd) is not None


def nvidia():
    return have("nvidia-smi") and subprocess.run(["nvidia-smi", "-L"], capture_output=True).returncode == 0


def check_system():
    say("\n[1/7] system tools")
    ok = True
    if sys.version_info < (3, 10):
        say(f"  {BAD} Python 3.10+ (this is {platform.python_version()})")
        ok = False
    else:
        say(f"  {OK} Python {platform.python_version()}")
    for c in ("ffmpeg", "ffprobe", "node", "npm"):
        say(f"  {OK if have(c) else BAD} {c}")
        ok &= have(c)
    if have("ffmpeg"):
        f = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
        if " subtitles " not in f:
            say(f"  {BAD} this ffmpeg has no 'subtitles' filter (libass). Install a full build "
                "(Windows: winget install Gyan.FFmpeg).")
            ok = False
    say(f"  {'yes' if nvidia() else 'no '} NVIDIA GPU")
    return ok


def setup_venv():
    say("\n[2/7] Python packages (.venv)")
    if not VPY.exists():
        run([sys.executable, "-m", "venv", str(VENV)], check=True)
    run([str(VPY), "-m", "pip", "install", "-q", "-U", "pip"], check=True)
    run([str(VPY), "-m", "pip", "install", "-q", "-U", "-r", str(ROOT / "setup" / "requirements.txt")], check=True)
    if nvidia() and platform.system() != "Darwin":
        run([str(VPY), "-m", "pip", "install", "-q", "-U", "nvidia-cublas-cu12", "nvidia-cudnn-cu12>=9,<10"], check=True)


def setup_node():
    say("\n[3/7] Playwright + headless Chromium")
    npm = "npm.cmd" if WIN else "npm"
    npx = "npx.cmd" if WIN else "npx"
    # browsers go into the skill's own folder, so this never touches other Playwright installs on the PC
    envp = {**os.environ, "PLAYWRIGHT_BROWSERS_PATH": str(ROOT / ".browsers")}
    run([npm, "install", "--no-fund", "--no-audit", "--loglevel=error"], cwd=ROOT, check=True, env=envp)
    r = run([npx, "playwright", "install", "--only-shell", "chromium"], cwd=ROOT, env=envp)
    if r.returncode:
        run([npx, "playwright", "install", "chromium"], cwd=ROOT, check=True, env=envp)


def setup_fonts():
    say("\n[4/7] fonts")
    FONTS.mkdir(parents=True, exist_ok=True)
    for name, url in FONT_URLS.items():
        p = FONTS / name
        if p.exists() and p.stat().st_size > 1000:
            say(f"  {OK} {name}")
            continue
        say(f"  downloading {name}")
        req = urllib.request.Request(url, headers={"User-Agent": "gta-clip-studio-setup"})
        with urllib.request.urlopen(req, timeout=120) as r:
            p.write_bytes(r.read())


def setup_sfx():
    say("\n[5/7] sound effects")
    run([str(VPY), str(ROOT / "scripts" / "make_sfx.py")], check=True)


def pick_encoder():
    for e in ENCODERS:
        r = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=black:s=640x360:d=0.5",
                            "-c:v", e, "-pix_fmt", "yuv420p", "-f", "null", "-"], capture_output=True)
        if r.returncode == 0:
            return e
    return "libx264"


def setup_engine(cfg):
    say("\n[6/7] encoder + whisper")
    cfg["encoder"] = pick_encoder()
    say(f"  video encoder: {cfg['encoder']}")
    cuda = nvidia() and platform.system() != "Darwin"
    cfg["whisper_device"] = "cuda" if cuda else "cpu"
    cfg["whisper_model"] = cfg.get("whisper_model_override") or ("large-v3-turbo" if cuda else "small")
    write_config(cfg)
    test = ("import sys; sys.path.insert(0, r'%s'); import numpy as np; from common import whisper_model;"
            "m = whisper_model(); segs, _ = m.transcribe(np.zeros(16000, dtype=np.float32)); list(segs); print('WHISPER_OK')"
            % (ROOT / "scripts"))
    say(f"  downloading/testing whisper {cfg['whisper_model']} on {cfg['whisper_device']} (first time can take a few min)")
    r = subprocess.run([str(VPY), "-c", test], capture_output=True, text=True)
    if "WHISPER_OK" not in r.stdout and cuda:
        say("  GPU whisper did not work, switching to CPU:", (r.stderr or "")[-300:])
        cfg["whisper_device"], cfg["whisper_model"] = "cpu", "small"
        write_config(cfg)
        r = subprocess.run([str(VPY), "-c", test], capture_output=True, text=True)
    say(f"  {OK if 'WHISPER_OK' in r.stdout else BAD} whisper {cfg['whisper_model']} ({cfg['whisper_device']})")
    if "WHISPER_OK" not in r.stdout:
        say((r.stderr or "")[-800:])


def load_config():
    p = ROOT / "config.json"
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except ValueError:
            pass
    return json.loads((ROOT / "config.example.json").read_text(encoding="utf-8"))


def write_config(cfg):
    if not cfg.get("output_dir"):
        cfg["output_dir"] = str(Path.home() / "GTA-Clip-Studio" / "clips")
    (ROOT / "config.json").write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def write_launchers():
    say("\n[7/7] launchers")
    (ROOT / "run.cmd").write_text('@echo off\r\n"%~dp0.venv\\Scripts\\python.exe" "%~dp0scripts\\run.py" %*\r\n',
                                  encoding="utf-8")
    sh = ROOT / "run.sh"
    sh.write_text('#!/usr/bin/env bash\nD="$(cd "$(dirname "$0")" && pwd)"\n'
                  'exec "$D/.venv/bin/python" "$D/scripts/run.py" "$@"\n', encoding="utf-8")
    try:
        sh.chmod(0o755)
    except OSError:
        pass
    say(f"  {OK} run.cmd / run.sh   e.g.  run clipwatch info <url>")


def doctor():
    say("\nGTA Clipping Studio - check")
    ok = check_system()
    for label, p in (("python env", VPY), ("playwright", ROOT / "node_modules" / "playwright"),
                     ("chromium", ROOT / ".browsers"),
                     ("font Anton", FONTS / "Anton-Regular.ttf"), ("font Inter", FONTS / "Inter.ttf"),
                     ("font Mukta (Hindi)", FONTS / "Mukta-ExtraBold.ttf"),
                     ("sfx kit", ROOT / "assets" / "sfx" / "stamp.wav"), ("config", ROOT / "config.json")):
        say(f"  {OK if p.exists() else BAD} {label}")
        ok &= p.exists()
    if VPY.exists():
        r = subprocess.run([str(VPY), "-c", "import yt_dlp, faster_whisper; print(yt_dlp.version.__version__)"],
                           capture_output=True, text=True)
        say(f"  {OK if r.returncode == 0 else BAD} yt-dlp {r.stdout.strip()} + faster-whisper")
        ok &= r.returncode == 0
    if (ROOT / "config.json").exists():
        c = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
        say(f"  encoder {c.get('encoder')} | whisper {c.get('whisper_model')} on {c.get('whisper_device')} | "
            f"voice mode {c.get('voice_mode')} | output {c.get('output_dir')}")
    say("\nREADY" if ok else "\nNOT READY - run:  python setup/setup.py")
    return ok


def main():
    if "--check" in sys.argv:
        sys.exit(0 if doctor() else 1)
    if not check_system():
        sys.exit("\nInstall the missing tools first (Windows: setup\\install.ps1, Mac/Linux: setup/install.sh), "
                 "then run this again.")
    cfg = load_config()
    setup_venv()
    setup_node()
    setup_fonts()
    setup_sfx()
    setup_engine(cfg)
    write_launchers()
    (ROOT / ".installed").write_text("ok\n", encoding="utf-8")
    doctor()


if __name__ == "__main__":
    main()
