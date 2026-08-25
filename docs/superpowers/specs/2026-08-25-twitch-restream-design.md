# Twitch 24/7 restream from Settings

**Date:** 2026-08-25  
**Branch:** `feat/obs-overlay`  
**Status:** plan approved; v1 implemented as sidecar + Settings Start/Stop

Admin starts and stops a 24/7 Twitch push from Settings. Viewers see tent camera + GrowCast overlay. OBS transparent `/overlay` is unchanged.

Encoder is a Compose profile `twitch` sidecar (Chromium + ffmpeg), not the Next.js process. Stream key lives in `data/restream/twitch.key`, never public grow JSON.

Capture URL `/overlay/capture?token=…` always includes the stream. Fail-closed without `GROWCAST_RESTREAM_TOKEN`.
