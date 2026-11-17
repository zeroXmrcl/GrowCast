# GrowCast Timelapse

A lightweight GrowCast extension script that captures snapshots from an RTSP camera feed and continuously builds a `latest_timelapse.mp4` file.

## 1. Project Overview

`GrowCast-Timelapse/main.py`:
- Connects to an RTSP stream using `ffmpeg`
- Captures `.webp` snapshots on a schedule
- Generates/updates a timelapse video from all snapshots

Key features:
- Supports trigger-by-time (`TIME_1`, `TIME_2`, `TIME_3`)
- Supports interval-based capture (`INTERVAL` in minutes)
- Rebuilds timelapse after every successful snapshot

## 2. Demo / Screenshots

No screenshots here right now, but if you want to check how it looks, see [my instance](https://grow.0xmarcel.com).

## 3. Getting Started

### Prerequisites

Install:
- Python 3.10+
- `ffmpeg` available in your `PATH`
- `pip`

Check versions:

```bash
python3 --version
ffmpeg -version
pip3 --version
```

### Installation

1. Clone or download this repository.
2. Put the `GrowCast-Timelapse` folder into your GrowCast extension folder.
3. Create and activate a virtual environment (recommended):

```bash
python3 -m venv .venv
source .venv/bin/activate
```

4. Install Python dependencies:

```bash
pip install -r requirements.txt
```

### Environment Variables Setup

1. Copy the example file:

```bash
cp GrowCast-Timelapse/.env.example GrowCast-Timelapse/.env
```

2. Edit `GrowCast-Timelapse/.env`:

```env
RTSP_STREAM=rtsp://username:password@camera-ip:554/stream
TZ=UTC
TIME_1=08:00
TIME_2=12:00
TIME_3=18:00
INTERVAL=
RETRY_MAX_SECONDS=3600
RETRY_DELAY_SECONDS=60
SNAPSHOT_DIR_OUT=./snapshots
TIMELAPSE_DIR_OUT=./timelapse
TIMELAPSE_LENGTH_SECONDS=10
```

Notes:
- You must set `RTSP_STREAM`.
- Set `TZ` to your local IANA timezone, such as `Europe/Berlin` or `America/New_York`.
- Configure either `TIME_1/2/3` and/or `INTERVAL`.
- Time format must be `HH:MM` (24-hour).

## 4. Running the Application

### Development mode

From the repository root:

```bash
cd GrowCast-Timelapse
python3 main.py
```

The process stays running and executes scheduled jobs.

### Production-like run

Same command, but run it with a process manager so it survives terminal close:
- `systemd` (Linux)
- `launchd` (macOS)
- Docker or your GrowCast host process manager

### Docker

Build and start the worker with Docker Compose:

```bash
cp GrowCast-Timelapse/.env.example GrowCast-Timelapse/.env
docker compose up -d --build
```

The Compose service loads configuration from `GrowCast-Timelapse/.env` and mounts output folders from the host.
Set `TZ` in `GrowCast-Timelapse/.env` so scheduled `TIME_1/2/3` values use the intended local time. If `TZ` is omitted, the container uses its default timezone, which is normally `UTC`.

Scheduled times only fire while the worker is already running. If you start the container after a configured time has passed, that daily time runs on the next day. Interval captures run after the first full interval has elapsed.

Useful commands:

```bash
docker compose logs -f
docker compose run --rm growcast-timelapse python main.py --validate
docker compose run --rm growcast-timelapse python main.py --render
docker compose down
```

## 5. Project Structure

```text
.
├── GrowCast-Timelapse/
│   ├── main.py               # Scheduler + snapshot + timelapse logic
│   ├── .env.example          # Environment template
│   ├── snapshots/            # Captured images
│   └── timelapse/            # Generated latest_timelapse.mp4
├── requirements.txt          # Python dependencies
└── README.md
```

## 6. Configuration

Key runtime config is in `GrowCast-Timelapse/.env`:
- `RTSP_STREAM`: camera stream URL
- `TIME_1`, `TIME_2`, `TIME_3`: fixed daily capture times
- `INTERVAL`: capture every N minutes
- `RETRY_MAX_SECONDS`: how long to keep retrying after a failed snapshot
- `RETRY_DELAY_SECONDS`: delay between retry attempts
- `SNAPSHOT_DIR_OUT`: snapshot output folder
- `TIMELAPSE_DIR_OUT`: timelapse output folder
- `TIMELAPSE_LENGTH_SECONDS`: target duration used to calculate FPS

## 7. Usage Guide

1. Start the script.
2. Confirm startup logs show configuration accepted.
3. Wait for scheduled trigger(s).
4. Check outputs:
- snapshots in `snapshots/`
- video in `timelapse/latest_timelapse.mp4`

End-user expectation: each successful capture updates the timelapse.

## 8. API or Backend

No HTTP API/backend service is included.

This is a local scheduled worker script that calls `ffmpeg` via subprocess.

## 9. Deployment

### Docker deployment

1. Install Docker and Docker Compose.
2. Create `GrowCast-Timelapse/.env` from `GrowCast-Timelapse/.env.example`.
3. Set `RTSP_STREAM` and at least one schedule option.
4. Start the service:

```bash
docker compose up -d --build
```

The container includes `ffmpeg`, so the host does not need a separate `ffmpeg` install for Docker usage.

### GrowCast extension deployment

1. Copy `GrowCast-Timelapse/` into your GrowCast extensions directory.
2. Install dependencies on the host machine.
3. Configure `.env`.
4. Start `main.py` from your extension runtime/host.

### Important Autostart Note

This extension does **not** autostart by default.
You must configure startup manually (for example with your GrowCast host process manager, `systemd`, `launchd`, cron + `@reboot`, or another supervisor).

## 10. Troubleshooting

Common issues:
- `RTSP_STREAM is required`
  - Set `RTSP_STREAM` in `.env`.
- `You must define either TIME_1, TIME_2, TIME_3 or INTERVAL`
  - Add at least one schedule mode.
- `Invalid time format`
  - Use `HH:MM` (e.g. `07:30`).
- `ffmpeg: command not found`
  - Install `ffmpeg` and ensure it is in `PATH`.
- No files being generated
  - Verify camera URL, network reachability, and credentials.

## 11. Contributing

Contributions are welcome.

Suggested workflow:
1. Create a branch.
2. Make focused changes.
3. Test with a real or test RTSP stream.
4. Open a PR with logs/screenshots when relevant.
