#!/usr/bin/env bash
# GTA Clipping Studio - Mac / Linux installer. Installs Python 3, ffmpeg and Node.js if missing, then runs setup.py.
# Run:  bash setup/install.sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
have() { command -v "$1" >/dev/null 2>&1; }

echo "== GTA Clipping Studio setup ($(uname -s)) =="
if [ "$(uname -s)" = "Darwin" ]; then
  if ! have brew; then
    echo "Homebrew is needed: https://brew.sh  (install it, then run this again)"; exit 1
  fi
  have python3 || brew install python@3.12
  have ffmpeg || brew install ffmpeg
  have node || brew install node
else
  if have apt-get; then
    PKGS=""
    have python3 || PKGS="$PKGS python3"
    python3 -c "import venv" 2>/dev/null || PKGS="$PKGS python3-venv"
    have ffmpeg || PKGS="$PKGS ffmpeg"
    have node || PKGS="$PKGS nodejs npm"
    [ -n "$PKGS" ] && sudo apt-get update && sudo apt-get install -y $PKGS
  elif have dnf; then
    have python3 || sudo dnf install -y python3
    have ffmpeg || sudo dnf install -y ffmpeg
    have node || sudo dnf install -y nodejs npm
  else
    echo "Install python3, ffmpeg and nodejs with your package manager, then run this again."
  fi
fi
python3 "$ROOT/setup/setup.py"
