# GrowCast Twitch restream sidecar

Started by default with `docker compose up`. Captures `/overlay/capture` in Chromium and pushes RTMPS to Twitch. Stays idle until Settings → Start.

Needs about 1–2 CPU cores and 1 GB RAM.

Put `GROWCAST_RESTREAM_TOKEN` in `.env.local` (GrowCast and this sidecar both load that file). Put the Twitch stream key in Settings; it is stored under `data/restream/`, not in the public grow JSON.

Optional `GROWCAST_RESTREAM_STREAM_URL` in the same `.env.local` so the capture overlay loads MediaMTX internally instead of the public HLS URL.

```bash
docker compose up --build -d
```
