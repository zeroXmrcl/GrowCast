# GrowCast Twitch restream sidecar

Started by default with `docker compose up`. Captures `/overlay/capture` in Chromium and pushes RTMPS to Twitch. Stays idle until Broadcast (`/admin/stream`) → Start.

Needs about 1–2 CPU cores and 1 GB RAM.

GrowCast auto-creates `data/restream/capture.token` (Broadcast page load, Twitch Start, or capture authorize). Optional `GROWCAST_RESTREAM_TOKEN` in `.env.local` overrides that file. Put the Twitch stream key on Broadcast; it is stored under `data/restream/`, not in the public grow JSON.

Optional `GROWCAST_RESTREAM_STREAM_URL` in the same `.env.local` so the capture overlay loads MediaMTX internally instead of the public HLS URL.

```bash
docker compose up --build -d
docker compose logs -f restream
```

Logs boot, idle vs Start, Chromium/ffmpeg start and stop, Twitch ingest host (never the stream key or capture token), and a still-live line about once a minute. Chromium GPU noise stays at `LOG_LEVEL=debug`.
