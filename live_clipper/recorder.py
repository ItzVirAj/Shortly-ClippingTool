"""Stream recorder abstraction and fake implementation (Section 7.3 of LIVE_CLIPPER_SPEC)."""
import asyncio
import json
import os
import subprocess
import sys
import time
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple

from jsonfile import write_json_atomic


class Recorder(ABC):
    """Abstract base class for stream recorders."""

    @property
    @abstractmethod
    def state(self) -> str:
        """Current state: stopped | starting | recording | reconnecting."""
        pass

    @abstractmethod
    async def check_available(self) -> Dict[str, Any]:
        """Check if recording tool and dependencies are available."""
        pass

    @abstractmethod
    async def start(
        self,
        channel: str,
        mode: str,
        out_dir: str,
        session_clock_zero: float,
        platform: str = "kick",
    ) -> None:
        """Start stream recording."""
        pass

    @abstractmethod
    async def stop(self) -> None:
        """Stop recording and terminate child processes."""
        pass

    @abstractmethod
    def get_child_pids(self) -> List[int]:
        """Return list of spawned child process IDs."""
        pass


class FakeRecorder(Recorder):
    """Simulated stream recorder for testing and offline development."""

    def __init__(
        self,
        spawn_dummy_subprocess: bool = False,
        drop_intervals: Optional[List[Tuple[float, float]]] = None,
        write_mock_files: bool = True,
    ) -> None:
        self.spawn_dummy_subprocess = spawn_dummy_subprocess
        self.drop_intervals = list(drop_intervals or [])
        self.write_mock_files = write_mock_files

        self._state: str = "stopped"
        self._child_processes: List[subprocess.Popen] = []
        self._out_dir: Optional[str] = None
        self._mode: str = "rolling"
        self._session_clock_zero: float = 0.0
        self._stop_event = asyncio.Event()
        self._writer_task: Optional[asyncio.Task] = None

    @property
    def state(self) -> str:
        return self._state

    async def check_available(self) -> Dict[str, Any]:
        return {"available": True, "version": "fake-recorder-1.0"}

    def get_child_pids(self) -> List[int]:
        pids = []
        for p in self._child_processes:
            if p.poll() is None:
                pids.append(p.pid)
        return pids

    async def start(
        self,
        channel: str,
        mode: str,
        out_dir: str,
        session_clock_zero: float,
        platform: str = "kick",
    ) -> None:
        self._state = "starting"
        self._out_dir = out_dir
        self._mode = mode
        self._session_clock_zero = session_clock_zero
        self._stop_event.clear()

        # Prepare buffer directory and index.json
        buffer_dir = os.path.join(out_dir, "buffer" if mode == "rolling" else "recording")
        os.makedirs(buffer_dir, exist_ok=True)
        index_path = os.path.join(buffer_dir, "index.json")
        if not os.path.exists(index_path):
            write_json_atomic(index_path, {"segments": [], "created_at": time.time()})

        # Optionally spawn a real subprocess to verify process hygiene in tests
        if self.spawn_dummy_subprocess:
            cmd = [sys.executable, "-c", "import time; time.sleep(300)"]
            proc = subprocess.Popen(cmd)
            self._child_processes.append(proc)

        self._state = "recording"
        if self.write_mock_files:
            self._writer_task = asyncio.create_task(self._simulate_segment_writer(buffer_dir, index_path))

    async def _simulate_segment_writer(self, buffer_dir: str, index_path: str) -> None:
        """Periodically write mock segments and update index.json."""
        seg_idx = 0
        seg_duration = 5.0
        try:
            while not self._stop_event.is_set():
                now_session = time.monotonic() - self._session_clock_zero

                # Check simulated drop
                in_drop = any(s <= now_session < e for s, e in self.drop_intervals)
                if in_drop:
                    if self._state != "reconnecting":
                        self._state = "reconnecting"
                elif self._state == "reconnecting":
                    self._state = "recording"

                if self._state == "recording":
                    seg_name = f"seg_{seg_idx:05d}.mp4"
                    seg_file = os.path.join(buffer_dir, seg_name)
                    # Write tiny stub file if not exists
                    if not os.path.exists(seg_file):
                        with open(seg_file, "wb") as f:
                            f.write(b"MOCK_VIDEO_SEGMENT\n")

                    # Update index.json
                    try:
                        if os.path.exists(index_path):
                            with open(index_path, "r", encoding="utf-8") as f:
                                idx_data = json.load(f)
                        else:
                            idx_data = {"segments": []}
                        idx_data["segments"].append({
                            "file": seg_name,
                            "session_start": round(seg_idx * seg_duration, 2),
                            "duration": seg_duration,
                        })
                        write_json_atomic(index_path, idx_data)
                    except Exception:
                        pass

                    seg_idx += 1

                try:
                    await asyncio.wait_for(self._stop_event.wait(), timeout=seg_duration)
                except asyncio.TimeoutError:
                    pass
        except asyncio.CancelledError:
            pass

    async def stop(self) -> None:
        self._state = "stopped"
        self._stop_event.set()

        if self._writer_task and not self._writer_task.done():
            self._writer_task.cancel()
            try:
                await self._writer_task
            except asyncio.CancelledError:
                pass

        # Terminate any child processes (process hygiene)
        for p in self._child_processes:
            if p.poll() is None:
                try:
                    p.terminate()
                    p.wait(timeout=1.0)
                except (subprocess.TimeoutExpired, OSError):
                    try:
                        p.kill()
                    except OSError:
                        pass
        self._child_processes.clear()
