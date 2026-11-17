"""Minimal plugin backend. Copy this folder into plugins/<name>/ and edit plugin.json."""

from __future__ import annotations

import os
import sys
import time

root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "plugin-sdk-python"))
if os.path.isdir(root) and root not in sys.path:
    sys.path.insert(0, root)

from growcast_plugin import Plugin  # noqa: E402


def main() -> None:
    plugin = Plugin.from_env()
    while True:
        cfg = plugin.config()
        interval = int(cfg.get("intervalS") or 10)
        plugin.heartbeat(ok=True, status="idle")
        time.sleep(max(5, interval))


if __name__ == "__main__":
    main()
