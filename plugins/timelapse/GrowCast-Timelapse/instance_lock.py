from __future__ import annotations

import atexit
import fcntl
import os
import signal
import sys
from pathlib import Path


class LockHeldError(Exception):

    def __init__(self, message: str, lock_path: Path, holder_pid: int = 0):
        super().__init__(message)
        self.lock_path = lock_path
        self.holder_pid = holder_pid


_held_lock_path: Path | None = None
_held_lock_fd: int | None = None


def is_pid_running(pid: int) -> bool:
    # PID 1 is reused as the container init after restart; our own PID is this
    # process. Neither means another live holder.
    if pid <= 0 or pid in (1, os.getpid()):
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def read_lock_pid(lock_path: Path) -> int:
    try:
        content = lock_path.read_text(encoding="utf-8").strip().splitlines()
        if content and content[0].strip().isdigit():
            return int(content[0].strip())
    except OSError:
        pass
    return 0


def resolve_lock_path(snapshot_dir: str, env_lock: str | None = None) -> Path:
    if env_lock:
        return Path(env_lock).resolve()
    return (Path(snapshot_dir).resolve() / ".timelapse.lock")


def _raise_held(lock_path: Path, holder_pid: int) -> None:
    shown = holder_pid or "?"
    raise LockHeldError(
        f"Another instance is already running (PID {shown}).",
        lock_path=lock_path,
        holder_pid=holder_pid,
    )


def acquire_instance_lock(
    lock_path: Path,
    *,
    pid: int | None = None,
    install_handlers: bool = True,
    is_running=None,
) -> Path:
    global _held_lock_path, _held_lock_fd

    lock_path = Path(lock_path)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    my_pid = os.getpid() if pid is None else pid
    running = is_running or is_pid_running

    if _held_lock_fd is not None:
        old_pid = read_lock_pid(_held_lock_path or lock_path)
        _raise_held(lock_path, old_pid or my_pid)

    fd = os.open(str(lock_path), os.O_RDWR | os.O_CREAT, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        old_pid = read_lock_pid(lock_path)
        os.close(fd)
        # flock already failed: a live process holds the file. PID 1 and our
        # own PID are still not reported as a foreign live holder.
        if old_pid in (1, my_pid, os.getpid()) or not running(old_pid):
            _raise_held(lock_path, old_pid)
        _raise_held(lock_path, old_pid)

    try:
        os.ftruncate(fd, 0)
        os.lseek(fd, 0, os.SEEK_SET)
        os.write(fd, f"{my_pid}\n".encode("utf-8"))
        os.fsync(fd)
    except OSError:
        pass

    _held_lock_fd = fd
    _held_lock_path = lock_path
    if install_handlers:
        _install_cleanup_handlers()
    return lock_path


def release_instance_lock(lock_path: Path | None = None) -> None:
    global _held_lock_path, _held_lock_fd
    path = lock_path or _held_lock_path
    fd = _held_lock_fd
    _held_lock_fd = None
    _held_lock_path = None
    if fd is not None:
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        except OSError:
            pass
        try:
            os.close(fd)
        except OSError:
            pass
    if path is not None:
        print(f"[lock] Released {path}")


def _install_cleanup_handlers() -> None:
    atexit.register(release_instance_lock)

    def _handle_signal(signum, _frame):
        print(f"[lock] Received signal {signum}, releasing lock and exiting...")
        release_instance_lock()
        sys.exit(128 + signum if signum < 128 else 1)

    for sig_name in ("SIGTERM", "SIGINT"):
        try:
            sig = getattr(signal, sig_name)
            signal.signal(sig, _handle_signal)
        except (AttributeError, ValueError):
            pass
