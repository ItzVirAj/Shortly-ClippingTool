"""One heavy job (whisper / encode / voice) at a time across processes, so the PC stays usable
while the live recorder and the editor run side by side."""
import os, time
from contextlib import contextmanager
from pathlib import Path

LOCK = Path(__file__).resolve().parent / ".gpu.lock"


@contextmanager
def gpu():
    f = open(LOCK, "a+")
    while True:
        try:
            f.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except OSError:
            time.sleep(1)
    try:
        yield
    finally:
        try:
            f.seek(0)
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        finally:
            f.close()
