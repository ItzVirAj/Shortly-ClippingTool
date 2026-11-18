<div align="center">

# ⚡ Shortly

### Open-Source AI Video Clipper & Shorts Generator

Turn long videos, podcasts, and streams into viral 9:16 vertical shorts for **YouTube Shorts**, **TikTok**, and **Instagram Reels** — completely open source, self-hostable, and free.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![React: 18](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![Docker: Ready](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)](docker-compose.yml)
[![Platform: Win/Mac/Linux](https://img.shields.io/badge/Platform-Windows%20|%20macOS%20|%20Linux-black.svg)]()

[Features](#-key-features) • [Quick Start](#-quick-start) • [Desktop App](#-desktop-app) • [CLI & MCP](#-cli--agent-mcp-server) • [Tech Stack](#-tech-stack) • [License](#-license)

---

</div>

## ✨ Overview

**Shortly** is an all-in-one AI video automation platform designed to turn long-form content (YouTube URLs or local video files) into high-retention short vertical clips. It combines transcript-aware viral moment detection, face-tracking reframing, animated kinetic subtitles, and multi-platform publishing into a single cohesive tool.

Whether you run it as a **native desktop app (Electron)**, a **Docker microservice**, or a headless **CLI / MCP pipeline** for AI agents, Shortly gives you full ownership over your media with zero watermark restrictions.

---

## 🚀 Key Features

### 🎯 1. AI Viral Highlight Detection
- Analyzes video transcripts and visual dynamics to detect high-retention moments, hooks, and punchlines.
- Powered by **Google Gemini** or local offline LLMs (**Ollama, LM Studio, vLLM**).
- Automated hook sentence generation to grab viewer attention in the first 3 seconds.

### 📐 2. Smart Active Speaker Tracking & Layouts
- **AI Face & Speaker Tracking**: Employs MediaPipe and YOLOv8 to dynamically track faces and center speakers in 9:16 vertical space without letterboxing.
- **Stacked Split Layout**: Automatically detects multi-person podcasts and interviews, stacking both speakers vertically with seam-aligned captions.
- **Screencast & Inset Modes**: Preserves presentations, gameplay, and software demos while cleanly overlaying speaker reactions.

### 💬 3. Animated Captions & Typography
- Word-level audio transcription powered by **faster-whisper** (with Silero VAD filtering).
- Kinetic word highlighting, emoji emphasis, and customizable styles (bold, uppercase, outline, drop shadows).
- Full typography control: Inter, Anton, Montserrat, Thunder, Sk-Modernist, and custom font uploads.

### 📱 4. Multi-Platform Auto-Publishing
- Direct scheduling and one-click publishing to **YouTube Shorts**, **TikTok**, and **Instagram Reels**.
- Automatic SEO-optimized video titles, descriptions, and hashtags tailored per platform.

### 🎨 5. Thumbnail Studio & UGC Creator
- **Thumbnail Studio**: Generate click-worthy YouTube thumbnails with AI face overlays, background styling, and viral typography.
- **AI UGC Shorts**: Create marketing shorts with realistic AI actors, synthetic lip-sync, and automated voiceovers.

### 🤖 6. Built-in MCP Server & Automation
- Native **Model Context Protocol (MCP)** server for Claude Code, Cursor, ChatGPT, and custom agents.
- Headless **CLI** tool for batch processing and automated background workflows.
- Webhook callbacks (`X-Shortly-Signature`) for headless server pipelines.

---

## ⚡ Quick Start

### Option A: Docker Compose (Recommended for Self-Hosting)

The fastest way to deploy the entire stack (Backend + Dashboard + Renderer):

```bash
# 1. Clone the repository
git clone https://github.com/ItzVirAj/Shortly-ClippingTool.git
cd Shortly-ClippingTool

# 2. Configure environment (optional)
cp .env.example .env

# 3. Build and launch all services
docker compose up --build
```

Once launched, open your browser at:
👉 **`http://localhost:5175`**

---

### Option B: Local Development Setup

#### 1. Backend Setup (Python 3.10+)

```bash
# Create and activate virtual environment
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

#### 2. Frontend Setup (React + Vite)

```bash
cd dashboard
npm install
npm run dev
```

The web dashboard will be available at `http://localhost:5173`.

---

## 🖥 Desktop App (Electron)

Shortly includes a native desktop application with local hardware acceleration:

```bash
cd dashboard

# Run in desktop development mode
npm run electron:dev

# Build standalone Windows installer (.exe)
npm run electron:build
```

Standalone installation files will be packaged into `dashboard/dist-electron/`.

---

## 🤖 CLI & Agent MCP Server

### Command Line Interface (CLI)

Run Shortly directly from your terminal with zero dependencies:

```bash
cd cli
pip install -e .

# Clip a YouTube video with automatic highlight detection
shortly process "https://www.youtube.com/watch?v=..." --wait

# View generated clips
shortly clips <job_id>

# Publish directly to social networks
shortly publish <job_id> 0 --platforms youtube,tiktok
```

### Model Context Protocol (MCP)

Connect Shortly as a tool provider for Claude, Cursor, or ChatGPT:

```bash
# Add to Claude Desktop or Claude Code
claude mcp add --transport http shortly http://localhost:8000/mcp

# Or run stdio mode directly
claude mcp add shortly -- python mcp_stdio.py
```

Available MCP tools:
- `process_video`: Submits a video URL or local file for analysis and clipping.
- `get_job_status`: Polls status, logs, and progress.
- `list_clips`: Retrieves generated clips with metadata and download URLs.
- `add_subtitles`: Modifies caption presets and styling.
- `publish_clip`: Posts clips to linked social channels.

---

## 🛠 Tech Stack

| Component | Technologies |
|---|---|
| **Core Engine** | Python 3.10+, FastAPI, OpenCV, FFmpeg, yt-dlp |
| **AI & Speech** | Google Gemini API, Faster-Whisper, Silero VAD |
| **Computer Vision**| MediaPipe FaceMesh, Ultralytics YOLOv8, PySceneDetect |
| **Frontend UI** | React 18, Vite, Tailwind CSS, Lucide Icons |
| **Desktop Harness**| Electron, Electron-Builder |
| **Video Composition**| Remotion, Custom CUDA NVENC/NVDEC pipeline |
| **Integration** | Model Context Protocol (MCP), Upload-Post API |

---

## ⚙️ Configuration

Shortly works out of the box in **Manual / Free Mode** without requiring cloud keys. For automatic viral detection and publishing, configure your credentials in the dashboard **Settings** or `.env`:

| Key | Description | Required For |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API Key | Automatic AI highlight picking |
| `UPLOAD_POST_API_KEY` | Upload-Post.com Key | Direct social posting (TikTok/IG/YT) |
| `LLM_BASE_URL` | Local LLM Endpoint (e.g. Ollama `http://localhost:11434/v1`) | Offline AI highlight picking |
| `FAL_KEY` | Fal.ai Key (Optional) | AI Shorts avatar generation |
| `ELEVENLABS_API_KEY` | ElevenLabs Key (Optional) | AI voice dubbing & synthesis |

---

## 🤝 Contributing

Contributions, feedback, and pull requests are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m "Add amazing feature"`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

Developed & Maintained with ❤️ by [ItzVirAj](https://github.com/ItzVirAj).

### Caption looks and timed stickers

In **Live Clipper → Skipper**, choose **Enable Auto**, select a caption look or switch captions off, then choose **Start Auto**. Skipper remembers the choice and attaches it to each new capture. Cancel keeps the current mode. Auto publicly uploads to the connected YouTube channel through the existing publishing workflow. Before a capture is available, the picker shows sample text on a plain background.

In the **clip editor**, open **Captions** to preview a look on the current clip. **Adjust look** controls the size, position, highlight color, and group length. **Memes/Emojis** places a sticker at the playhead. Drag it on the video, then set its size and time range in the panel. **Re-render clip** saves the settings and exports the video. **Save this look for every clip in this job** also saves the caption choice for sibling clips. Each sibling uses it on its next editor render. Stickers belong to the individual clip.

Add a preset to `dashboard/src/captions/captionStyles.json` with a unique ID, display name, font, grouping, colors, position and an existing effect. Both pickers and the exporter read this registry. Bundle a new font and its license when needed. Set `file` to the backend filename under `dashboard/public/captions/` or `fonts/` and `fontUrl` to the dashboard asset URL. The bundled looks use Montserrat, Bangers, Press Start 2P and DejaVu Sans Mono. Sticker images are rasterized Noto Color Emoji glyphs. Attribution is alongside the font and sticker assets.

FFmpeg uses libass for timed text and Pillow-generated transparent strips for gradients and rounded pills. The browser previews the same settings with CSS. Font fallback and line breaks can vary by script and platform. For scripts missing from the selected gradient or pill font, export uses libass and the system fallback fonts. The existing backend and dashboard startup commands above run the feature.

[Compare all 12 exported looks](examples/caption-looks/styles.jpg) · [Watch the caption timing reel](examples/caption-looks/style-reel.mp4)
