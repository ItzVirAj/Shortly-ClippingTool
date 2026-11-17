"""Real Streamlink & FFmpeg stream copy recorder wrapper (Section 7.3 of LIVE_CLIPPER_SPEC)."""
import asyncio
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

from jsonfile import write_json_atomic
from .recorder import Recorder


class StreamlinkRecorder(Recorder):
    """Real Streamlink stream capture piped into FFmpeg with stream copy."""

    def __init__(
        self,
        streamlink_bin: Optional[str] = None,
        ffmpeg_bin: Optional[str] = None,
        segment_time_sec: float = 10.0,
        buffer_minutes: int = 8,
    ) -> None:
        self.streamlink_bin = (
            streamlink_bin
            or os.environ.get("STREAM_RECORDER_PATH")
            or shutil.which("streamlink")
        )
        self.ffmpeg_bin = (
            ffmpeg_bin
            or os.environ.get("FFMPEG_PATH")
            or shutil.which("ffmpeg")
        )
        self.segment_time_sec = float(segment_time_sec)
        self.buffer_minutes = int(buffer_minutes)

        self._state: str = "stopped"
        self._streamlink_proc: Optional[subprocess.Popen] = None
        self._ffmpeg_proc: Optional[subprocess.Popen] = None
        self._child_processes: List[subprocess.Popen] = []

        self._out_dir: Optional[Path] = None
        self._mode: str = "rolling"
        self._session_clock_zero: float = 0.0
        self._recording_offset_sec: Optional[float] = None

        self._stop_event = asyncio.Event()
        self._monitor_task: Optional[asyncio.Task] = None
        self._gaps: List[Tuple[float, float]] = []
        self._active_gap_start: Optional[float] = None

    @property
    def state(self) -> str:
        return self._state

    def get_child_pids(self) -> List[int]:
        """Return list of active child process IDs."""
        pids = []
        for p in self._child_processes:
            if p and p.poll() is None:
                pids.append(p.pid)
        return pids

    def get_and_clear_gaps(self) -> List[Tuple[float, float]]:
        res = list(self._gaps)
        self._gaps.clear()
        return res

    async def check_available(self) -> Dict[str, Any]:
        """Verify streamlink and ffmpeg binaries and version reporting."""
        sl_ok = bool(self.streamlink_bin and (os.path.exists(self.streamlink_bin) or shutil.which(self.streamlink_bin)))
        ff_ok = bool(self.ffmpeg_bin and (os.path.exists(self.ffmpeg_bin) or shutil.which(self.ffmpeg_bin)))

        sl_version = None
        if sl_ok:
            try:
                proc = await asyncio.to_thread(
                    subprocess.run,
                    [self.streamlink_bin, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                if proc.returncode == 0:
                    sl_version = proc.stdout.strip()
            except Exception:
                pass

        return {
            "available": bool(sl_ok and ff_ok),
            "streamlink": sl_ok,
            "ffmpeg": ff_ok,
            "version": sl_version,
            "streamlink_path": self.streamlink_bin,
            "ffmpeg_path": self.ffmpeg_bin,
        }

    async def start(
        self,
        channel: str,
        mode: str,
        out_dir: str,
        session_clock_zero: float,
        platform: str = "kick",
    ) -> None:
        """Start Streamlink piped into FFmpeg with stream copy (-c copy)."""
        avail = await self.check_available()
        if not avail["available"]:
            missing = []
            if not avail["streamlink"]:
                missing.append("streamlink")
            if not avail["ffmpeg"]:
                missing.append("ffmpeg")
            raise RuntimeError(f"Missing required recorder binaries: {', '.join(missing)}")

        self._state = "starting"
        self._out_dir = Path(out_dir).resolve()
        self._mode = mode
        self._session_clock_zero = session_clock_zero
        self._stop_event.clear()

        # Buffer folder setup
        buffer_dir = self._out_dir / ("buffer" if mode == "rolling" else "recording")
        buffer_dir.mkdir(parents=True, exist_ok=True)
        index_path = buffer_dir / "index.json"
        if not index_path.exists():
            write_json_atomic(str(index_path), {"segments": [], "created_at": time.time()})

        # Argument lists (never shell=True, strictly verified flags)
        if channel.startswith("http://") or channel.startswith("https://"):
            stream_url = channel
        elif platform == "youtube" and ("youtube.com" in channel.lower() or "youtu.be" in channel.lower()):
            stream_url = f"https://{channel.lstrip('/')}"
        elif platform == "twitch":
            stream_url = f"https://twitch.tv/{channel}"
        elif platform == "youtube":
            clean_ch = channel.lstrip("@")
            stream_url = f"https://www.youtube.com/@{clean_ch}/live"
        else:
            stream_url = f"https://kick.com/{channel}"
        sl_cmd = [self.streamlink_bin, stream_url, "best", "-O"]

        if mode == "rolling":
            segment_pattern = str(buffer_dir / "seg_%05d.mp4")
            ff_cmd = [
                self.ffmpeg_bin,
                "-y",
                "-loglevel", "warning",
                "-i", "pipe:0",
                "-c", "copy",
                "-f", "segment",
                "-segment_time", str(int(self.segment_time_sec)),
                "-reset_timestamps", "1",
                segment_pattern,
            ]
        else:
            out_file = str(buffer_dir / "full_recording.mp4")
            ff_cmd = [
                self.ffmpeg_bin,
                "-y",
                "-loglevel", "warning",
                "-i", "pipe:0",
                "-c", "copy",
                out_file,
            ]

        # Launch processes with pipe
        self._streamlink_proc = subprocess.Popen(
            sl_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self._ffmpeg_proc = subprocess.Popen(
            ff_cmd,
            stdin=self._streamlink_proc.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        # Allow streamlink to receive SIGPIPE if ffmpeg exits
        if self._streamlink_proc.stdout:
            self._streamlink_proc.stdout.close()

        self._child_processes = [self._streamlink_proc, self._ffmpeg_proc]
        self._state = "recording"
        self._recording_offset_sec = max(0.0, time.monotonic() - session_clock_zero)

        # Launch background monitor for segment index and crash/drop detection
        self._monitor_task = asyncio.create_task(self._monitor_loop(buffer_dir, index_path))

    async def _monitor_loop(self, buffer_dir: Path, index_path: Path) -> None:
        """Periodically scan segments, prune rolling buffer, and detect process failures."""
        known_segments = set()
        last_seg_time = time.monotonic()

        try:
            while not self._stop_event.is_set():
                now_mono = time.monotonic()
                now_session = max(0.0, now_mono - self._session_clock_zero)

                # 1. Check if processes died
                sl_dead = self._streamlink_proc and self._streamlink_proc.poll() is not None
                ff_dead = self._ffmpeg_proc and self._ffmpeg_proc.poll() is not None

                if sl_dead or ff_dead:
                    if self._state == "recording":
                        self._state = "reconnecting"
                        if self._active_gap_start is None:
                            self._active_gap_start = now_session

                # 2. Update buffer index from disk
                new_files = sorted(buffer_dir.glob("seg_*.mp4"))
                if new_files:
                    last_seg_time = now_mono
                    if self._state == "reconnecting" and self._active_gap_start is not None:
                        self._gaps.append((self._active_gap_start, now_session))
                        self._active_gap_start = None
                        self._state = "recording"

                    # Add new segments to index
                    updated = False
                    try:
                        idx_data = {"segments": []}
                        if index_path.exists():
                            with open(index_path, "r", encoding="utf-8") as f:
                                idx_data = json.load(f)

                        indexed_files = {s["file"] for s in idx_data.get("segments", [])}
                        for f in new_files:
                            if f.name not in indexed_files:
                                idx_data["segments"].append({
                                    "file": f.name,
                                    "session_start": round(now_session, 2),
                                    "duration": self.segment_time_sec,
                                })
                                updated = True

                        # 3. Rolling buffer retention pruning
                        if self._mode == "rolling" and self.buffer_minutes > 0:
                            retention_sec = self.buffer_minutes * 60.0
                            cutoff_session = max(0.0, now_session - retention_sec)

                            surviving = []
                            for seg in idx_data.get("segments", []):
                                if (seg["session_start"] + seg["duration"]) < cutoff_session:
                                    # Prune old segment from disk
                                    old_path = buffer_dir / seg["file"]
                                    if old_path.exists():
                                        try:
                                            old_path.unlink()
                                        except OSError:
                                            pass
                                    updated = True
                                else:
                                    surviving.append(seg)
                            idx_data["segments"] = surviving

                        if updated:
                            write_json_atomic(str(index_path), idx_data)
                    except Exception:
                        pass

                # 4. Check for 30s silence / gap
                if (now_mono - last_seg_time) > 30.0 and self._state == "recording":
                    self._state = "reconnecting"
                    if self._active_gap_start is None:
                        self._active_gap_start = now_session

                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    pass

        except asyncio.CancelledError:
            pass

    async def stop(self) -> None:
        """Terminate processes cleanly with zero orphans (SIGTERM -> SIGKILL)."""
        self._state = "stopped"
        self._stop_event.set()

        if self._monitor_task and not self._monitor_task.done():
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass

        # Terminate FFmpeg first so it writes trailer/flushes
        for proc in (self._ffmpeg_proc, self._streamlink_proc):
            if proc and proc.poll() is None:
                try:
                    proc.terminate()
                    proc.wait(timeout=1.5)
                except (subprocess.TimeoutExpired, OSError):
                    try:
                        proc.kill()
                        proc.wait(timeout=1.0)
                    except OSError:
                        pass

        self._child_processes.clear()
        self._streamlink_proc = None
        self._ffmpeg_proc = None
