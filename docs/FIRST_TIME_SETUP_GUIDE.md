# Shortly (OpenShorts) — First-Time User Setup & Operations Guide

Welcome to **Shortly**! This guide walks you through everything required to install, configure, and run the entire system for the first time — including **Clip Studio**, **Live Clipper + Skipper**, the **Live Stream (Manual-Only)** menu, **Webcam Tracing Box**, **Mirror Video**, and **Direct Push to YouTube**.

---

## 1. Prerequisites

Before running the app, make sure the following tools are installed and available on your system `PATH`:

| Tool | Required For | Notes |
| --- | --- | --- |
| **Python 3.10+** | Backend API & video pipeline | Recommended: Python 3.10 or 3.11 inside a virtual environment (`.venv`). |
| **Node.js 18+ & npm** | Dashboard frontend | Required to build or run the React/Vite dashboard. |
| **FFmpeg & FFprobe** | All video cutting, reframing, mirroring, captions & snapshots | Verify with `ffmpeg -version` and `ffprobe -version`. |
| **Streamlink** | Live Clipper & Live Stream recording | Required for recording Twitch, Kick, and YouTube live streams (`pip install streamlink` or standalone installer). |
| **NVIDIA GPU + CUDA** *(optional)* | Faster Whisper transcription & NVENC encoding | Works on CPU out of the box; GPU speeds up transcription and rendering significantly. |

---

## 2. First-Time Installation

### Step 1 — Create Python Virtual Environment & Install Dependencies
From the project root directory:

```powershell
# Windows (PowerShell)
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

```bash
# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Step 2 — Install Frontend Dependencies & Build Dashboard
```bash
cd dashboard
npm install
npm run build
cd ..
```

---

## 3. Environment Configuration (`.env`)

Copy `.env.example` to `.env` in the project root and configure the sections below based on how you plan to use Shortly.

> **Important `.env` Quoting Rule:** Any value containing `#` (such as hashtags) **must be wrapped in double quotes** (`"..."`). Otherwise, `python-dotenv` treats everything after `#` as a comment.

### A. Storage Paths (Clips, Uploads, Live Buffers, Publishing)
Point all generated media and live rolling buffers to a fast drive with plenty of free space (for example, `D:\gtaclips`):

```env
OUTPUT_DIR=D:\gtaclips
UPLOAD_DIR=D:\gtaclips\uploads
LIVE_SESSIONS_DIR=D:\gtaclips\live_sessions
LIVE_CLIPPER_DIR=D:\gtaclips\liveclipper
PUBLISHING_DIR=D:\gtaclips\.publishing
EDITOR_MEDIA_DIR=D:\gtaclips\editor_media
```

### B. AI Model Keys (Pick One or Use Free/Manual Mode)
1. **Google Gemini (Recommended for Auto Mode & Vision Features):**
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GEMINI_MODEL=gemini-3.1-flash-lite
   ```
   *You can also enter your Gemini key directly inside the Dashboard under **Settings**.*
2. **Self-Hosted / Local LLM (Optional — Ollama, LM Studio, vLLM, OpenRouter):**
   ```env
   LLM_BASE_URL=http://localhost:11434/v1
   LLM_MODEL=qwen2.5:14b
   LLM_API_KEY=
   ```
3. **Zero-Key Free / Manual Mode:**
   No API key is required! Select **Free / Manual** inside Clip Studio to copy the generated prompt into ChatGPT/Claude and paste the clip timestamps back.

### C. Transcription (Whisper) & Video Encoding (FFmpeg)
```env
# CPU defaults (works everywhere):
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE=int8
FFMPEG_ENCODER=x264

# If you have an NVIDIA GPU (much faster):
# WHISPER_MODEL=large-v3-turbo
# WHISPER_DEVICE=cuda
# WHISPER_COMPUTE=float16
# FFMPEG_ENCODER=auto
```

### D. Default YouTube Metadata Preset (Optional)
Used automatically by Skipper automated uploads and available as a 1-click **"Apply Default Preset"** button in the Direct Push to YouTube modal:

```env
DEFAULT_VIDEO_TITLE="GTA 6 Has Something INSANE! 😱"
DEFAULT_VIDEO_HASHTAGS="#GTA6 #GTA5 #GTAShorts #GamingShorts #KRYO"
DEFAULT_VIDEO_TAGS="GTA 6, GTA 5, GTA Shorts, Gaming Shorts, KRYO Gaming"
```

### E. Optional Platform Integrations
- **YouTube Cookies** (helps `yt-dlp` download restricted/age-gated URLs):
  ```env
  YOUTUBE_COOKIES_PATH=C:\path\to\cookies.txt
  ```
- **Kick Official Webhooks** (optional for Live Clipper Kick chat):
  ```env
  KICK_CLIENT_ID=...
  KICK_CLIENT_SECRET=...
  KICK_WEBHOOK_SECRET=...
  ```

---

## 4. Starting the Application

Start the backend server from the project root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app:app --host 0.0.0.0 --port 8000
```

- If you built the dashboard (`npm run build`), open **`http://localhost:8000`** in your browser.
- For frontend development with hot reload, run `npm --prefix dashboard run dev` in a second terminal and open **`http://localhost:5173`**.

---

## 5. Connecting Your YouTube Channel (First-Time OAuth Setup)

To upload Shorts directly from **Clip Studio**, **History**, or **Skipper**:

1. Create a Google Cloud project and enable **YouTube Data API v3**.
2. Create an **OAuth 2.0 Client ID** (Web Application) with the authorized redirect URI:
   ```text
   http://localhost:8000/api/youtube/callback
   ```
3. Add your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (or `client_secret.json`) as guided in **Settings → YouTube Direct Integration** (see also [youtube-direct-integration.md](./youtube-direct-integration.md) and [local-publishing-setup.md](./local-publishing-setup.md)).
4. In the Dashboard, open **Settings** or **Publishing** and click **Connect YouTube** to authorize your channel.

Once connected, your channel name appears with a green status dot in **Publishing**, **Skipper**, and the **Push to YouTube** modal.

---

## 6. Feature Walkthrough & Recommended Settings

### A. Clip Studio (Dashboard Home)
Turn uploaded videos or pasted stream links (YouTube, Twitch, Kick, etc.) into vertical Shorts.

1. **Choose Source:** Drag & drop a video file (`MP4`, `MOV`, `WebM`, min 45s) or switch to **Paste Stream Link**.
2. **AI Processing Mode:**
   - **Auto Mode:** Gemini / Local LLM automatically picks the highest-retention clips.
   - **Free / Manual:** Exports a prompt you can run in ChatGPT/Claude for zero API cost.
3. **Output Aspect Ratio:** `9:16` (Shorts/Reels/TikTok), `1:1` (Square), or `16:9` (Landscape).
4. **Vertical Speaker Layout & Streamer Webcam Box:**
   - Choose `Streamer Top / Stream Bottom` or `Stream Top / Streamer Bottom` for gaming/reaction clips.
   - Under **Streamer Webcam Box**, select:
     - **Auto (Check 4 Corners):** Scans only the 4 outer corners so center game characters (e.g., GTA characters) are never mistaken for the facecam.
     - **Top-Left / Top-Right / Bottom-Left / Bottom-Right:** Locks strictly to that corner.
     - **Custom Tracing Box (Recommended for Gaming):** Click **Draw Tracing Box** and drag a rectangle directly over the streamer's webcam on your video preview frame. This bypasses YOLO completely for 100% accuracy and faster rendering.
     - **No Webcam (Blur Center):** Clean centered gameplay over a blurred 9:16 backdrop.
5. **Auto-Hook Titles:**
   - Generates **single-line, 3–4 word hooks** relative to the streamer being recorded.
   - For pasted URLs, the streamer/channel name is detected automatically. For uploaded files, type the streamer's name in the **Streamer name** field right under Auto-Hook Titles.
6. **Mirror Video:**
   - Flips the video horizontally (`hflip`) **before** Whisper transcription and subtitle burning — so the footage is mirrored while subtitles and hooks stay normal and readable.
7. **Auto-Push to YouTube (Optional Automation):**
   - **Tick & Ask Title/Desc:** Automatically opens the Push to YouTube modal when your clips finish so you can tick which clips to upload and customize titles, descriptions, and emojis.
   - **Auto-Upload Immediately:** Uploads all finished clips directly to YouTube using your chosen title, description, emojis, and visibility.

After clips finish rendering, you can also **tick individual clips** (`YT` badge) and click **Push to YouTube (N)** or click **push to yt** on any individual card.

---

### B. Live Clipper (Automated Live Stream Highlight Capture)
Open **Live Clipper** from the left sidebar to monitor a live stream in real time.

1. **New Session:**
   - Pick **Kick**, **Twitch**, or **YouTube**, enter the channel/stream URL, and choose a **Highlight Detection** preset (`Quiet Chat`, `Aggressive`, `Balanced`, or `Hype / Raids`).
   - Open **Capture settings** to configure:
     - **Recording mode:** `Rolling buffer` (auto-prunes old footage to save SSD space) or `Full recording`.
     - **Streamer Webcam Box:** Pin a corner or draw a tracing box.
     - **Mirror video:** Flip clips horizontally before Whisper & captions.
   - Check the permission acknowledgment and click **Start monitoring**.
2. **Active Session Controls:**
   - Monitor live chat velocity, audio peaks, total spikes, and clips currently cutting in real time.
   - Toggle **Spike Controls** to adjust sensitivity live without restarting the stream.
   - Click **`Cam: 4-Corner / Box`** at any time during a live stream to grab a **Live Frame** snapshot from the running stream and draw your exact webcam tracing box directly on top of it.
   - Click **`Mirror: On / Off`** to toggle mirroring live.
3. **Skipper (Auto-Publisher Tab inside Live Clipper):**
   - Pick **Framing** (`Stream Top · Cam Bottom` or `Single Centered · Blur`).
   - Set **Streamer Webcam Box** (including **Live Frame** snapshot tracing) and **Mirror video**.
   - Choose your caption style and click **Set up auto mode** to automatically render, caption, and publish detected spikes to your connected YouTube channel.

---

### C. Live Stream Menu (Manual-Only Deck)
Open **Live Stream** (`MANUAL`) in the left sidebar whenever you want full manual control over a live stream with **zero** automatic spike cuts and **zero** Skipper auto-uploads:

1. Connect a Kick, Twitch, or YouTube live stream and choose a rolling buffer size (`8m`, `15m`, `30m`, or `Full`).
2. Watch the live feed. When a great moment happens, set:
   - **Before NOW** (in seconds or minutes)
   - **After NOW** (in seconds or minutes)
3. Click **Cut Clip Now**.
4. **Old Buffer Cleanup:**
   - Check **Delete old buffer before this clip** to free disk space automatically right after cutting, or use **Delete older than −X** / **Clear buffer before NOW** anytime.

---

### D. History Menu & Direct Push to YouTube
Open **Library → History** in the left sidebar to manage all clips saved on disk (filterable by **All Clips**, **Studio Clipper**, or **Live Clipper**):

- **Tickmark Selection:** Click the checkmark box in the top-left corner of any video card (or use **Tick All**).
- **Push to YouTube:** Click **Push to YouTube** on any single card or **Push to YouTube (N)** in the top bar for all ticked videos.
- **Push to YouTube Modal:**
  - Edit each clip's **Title**, **Description & Hashtags**, **YouTube Tags**, **Visibility** (`Public` / `Unlisted` / `Private`), and optional **Schedule time** — or toggle **Apply title & description to all clips**.
  - Click any emoji in the built-in **Emoji Bar** (`😱 🔥 💀 🚨 🎮 🤯 😂 💥 ⚡ 🏆 👀 💯 👑 🚀`) to insert it directly into your Title or Description.
  - Click **Push & Upload to YouTube** to upload straight to YouTube (bypassing the Live Clipper/Skipper rendering pipeline) and watch live upload status right inside the modal.

---

## 7. First-Time Troubleshooting

| Issue | Fix |
| --- | --- |
| **Only the first `#hashtag` loads from `.env`** | Wrap `DEFAULT_VIDEO_HASHTAGS` and `DEFAULT_VIDEO_TITLE` in double quotes `"..."` inside `.env`. |
| **Game character detected as streamer cam** | Open **Streamer Webcam Box**, select **Custom Tracing Box** (or a specific corner like **Bottom-Right**), and draw the box directly over the webcam on a live/video frame. |
| **Live Clipper says Recorder unavailable** | Install `streamlink` and `ffmpeg`, ensure both are on your system `PATH`, and restart the backend server. |
| **YouTube upload says channel not connected / 401** | Open **Settings → YouTube** (or **Publishing**) and reconnect your Google OAuth account. |
| **Slow transcription or rendering** | If you have an NVIDIA GPU, set `WHISPER_DEVICE=cuda`, `WHISPER_COMPUTE=float16`, and `FFMPEG_ENCODER=auto` in `.env`. On CPU, use `WHISPER_MODEL=base` or `small` with `WHISPER_COMPUTE=int8`. |
| **Disk filling up during long live streams** | Use **Rolling buffer** mode (8–15 min) in Live Clipper / Live Stream, or use the **Clear buffer before NOW** button in the Live Stream manual deck. |
