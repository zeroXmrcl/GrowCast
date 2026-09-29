from __future__ import annotations

import atexit
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

def is_pid_running(pid: int) -> bool:
    if pid <= 0:
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

def _try_exclusive_create(lock_path: Path, pid: int) -> bool:
    flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
    try:
        fd = os.open(str(lock_path), flags)
    except FileExistsError:
        return False
    try:
        os.write(fd, f"{pid}\n".encode("utf-8"))
    finally:
        os.close(fd)
    return True

def resolve_lock_path(snapshot_dir: str, env_lock: str | None = None) -> Path:
    if env_lock:
        return Path(env_lock).resolve()
    return (Path(snapshot_dir).resolve() / ".timelapse.lock")

def acquire_instance_lock(
    lock_path: Path,
    *,
    pid: int | None = None,
    install_handlers: bool = True,
    is_running=None,
) -> Path:
    global _held_lock_path

    lock_path = Path(lock_path)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    my_pid = os.getpid() if pid is None else pid
    running = is_running or is_pid_running

    if _try_exclusive_create(lock_path, my_pid):
        _held_lock_path = lock_path
        if install_handlers:
            _install_cleanup_handlers()
        return lock_path

    old_pid = read_lock_pid(lock_path)
    if old_pid and running(old_pid):
        raise LockHeldError(
            f"Another instance is already running (PID {old_pid}).",
            lock_path=lock_path,
            holder_pid=old_pid,
        )

    try:
        lock_path.unlink()
    except FileNotFoundError:
        pass

    if not _try_exclusive_create(lock_path, my_pid):
        race_pid = read_lock_pid(lock_path)
        raise LockHeldError(
            f"Another instance is already running (PID {race_pid or '?'}).",
            lock_path=lock_path,
            holder_pid=race_pid,
        )

    _held_lock_path = lock_path
    if install_handlers:
        _install_cleanup_handlers()
    return lock_path

def release_instance_lock(lock_path: Path | None = None) -> None:
    global _held_lock_path
    path = lock_path or _held_lock_path
    if path is None:
        return
    path = Path(path)
    try:
        if path.exists():
            holder = read_lock_pid(path)
            if holder and holder != os.getpid() and lock_path is None:
                return
            path.unlink()
            print(f"[lock] Released {path}")
    except OSError as e:
        print(f"[lock] Warning: could not remove lockfile: {e}")
    if _held_lock_path is not None and path.resolve() == Path(_held_lock_path).resolve():
        _held_lock_path = None

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
