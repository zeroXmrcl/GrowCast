# Cam cover (HLS player + GrowCast reconnect)

**Date:** 2026-09-08  
**Branch:** `ggs-overlay`  
**Status:** approved design, not implemented

MediaMTX’s HLS **iframe** paints a black page with `stream not found, retrying in some seconds` when the camera drops. GrowCast cannot read that document (cross-origin). Twitch, the booth, public `/overlay`, and the homepage all show it.

v1 **stops using their player**. GrowCast loads `index.m3u8` with **hls.js**, and on a fatal miss shows a **cam cover**: last frame blurred, real **logo + GrowCast + Reconnecting**, faded so it does not flash.

---

## Non-goals

- Scraping MediaMTX’s iframe DOM or error string
- GrowCast reverse-proxy for HLS segments
- MediaMTX HTTP API / path `ready` poll
- Timelapse snapshot as the cover still
- Unmuting tent-mic audio (video stays muted for autoplay; program music is unchanged)
- Cover on public `/overlay` when stream mode is transparent (no camera)
- Changing restream ffmpeg / Pulse

---

## Product

| Decision | Choice |
|---|---|
| Surfaces | Capture, booth `/program`, public `/overlay` (include), homepage embed |
| Engine | hls.js on a GrowCast `<video>`; native HLS when `Hls.isSupported()` is false |
| Detect | Fatal HLS error (playlist **404** or other fatal), same miss MediaMTX uses |
| Cover | Blur last frame + `growCastLogo_green.svg` + **GrowCast** + **Reconnecting** |
| No frame yet | Dark fill, same brand (no blur) |
| Motion | Fade in/out **400ms**; cover stays **≥ 3s**; Reconnecting breathes |
| Reduced motion | Fade only, no pulse |
| Camera look | Existing CSS filter + temperature overlay on this video wrap, not an iframe |

---

## Why not the iframe

`OverlayShell` and the homepage embed `streamUrl` in a cross-origin iframe (`http://…:8888/growcam/`). MediaMTX still returns **200 HTML**. Inside it, hls.js loads `index.m3u8`; on fatal 404 it sets `stream not found, retrying in some seconds` and retries every **2s**. Parent `iframe.onerror` does not fire. There is no legal `contentDocument`.

MediaMTX documents the alternative we use: HLS with JavaScript on our own `<video>`.

---

## Playlist URL

`hlsPlaylistUrl(streamUrl: string): string`

1. `safeHttpUrlOrEmpty`; empty → `""`.
2. If the path ends with `.m3u8` (case-insensitive), return that URL.
3. Otherwise strip a trailing `/` and append `/index.m3u8`.

Used by the player only. Admin still saves the HLS **page** URL as today.

---

## Player

`OverlayCamera` (client):

- Full-bleed `<video>` `object-fit: cover`, `autoPlay`, `playsInline`, `muted`.
- hls.js `attachMedia` + `loadSource(playlist)`. Destroy on unmount / URL change.
- Safari path: `video.src = playlist` when hls.js is not supported; `error` event is fatal.
- While playing, copy the current frame to an offscreen canvas (last frame).
- Camera-look `filter` and temperature sibling wrap the video + cover, same as today’s iframe wrap.

`OverlayShell` replaces the MediaMTX iframe with `OverlayCamera` and passes `look` when the shell has one. Homepage aspect-video uses `OverlayCamera` **without** camera-look (dashboard cam was never graded). Empty URL keeps “No Stream configured”.

---

## Cover

Shown when HLS is fatal (or has not produced a frame and the load failed).

Stack, bottom → top:

1. Last frame (canvas/img) `filter: blur(14px)` + slight scale so blur edges do not letterbox; or `#09090b` if no frame.
2. Scrim `rgba(9,9,11,0.42)`.
3. Center: logo **56px** (`/growCastLogo_green.svg`) + **GrowCast** (`text-zinc-50 font-semibold tracking-tight`), same pairing as `OverlayWatermark`.
4. Under that: **Reconnecting** — 12px, uppercase, wide tracking, zinc-300. Slow opacity pulse (~2s), same family as the LIVE dot.

Corner GrowCast watermark stays a sibling on the shell (program/overlay). Homepage has no that watermark; cover brand is enough there.

**Timing** (`COVER_MIN_MS = 3000`, `COVER_FADE_MS = 400`):

- Fatal → cover **on** immediately (fade in 400ms). Record `shownAt`.
- Healthy and `video.readyState >= HAVE_CURRENT_DATA` → cover **off** only if `now - shownAt >= 3000` (fade out 400ms).
- If health returns during the floor, keep the cover until the floor, then fade out.

`coverShouldHide({fatal, playing, shownAtMs, nowMs})` is a pure helper for tests.

`prefers-reduced-motion: reduce` → opacity fades only.

---

## Persistence / config

No new JSON. `streamUrl` on the grow record is unchanged.

Operator MediaMTX: `hlsAllowOrigin: '*'` (document in README next to existing HLS notes). Capture already prefers `GROWCAST_RESTREAM_STREAM_URL` (Docker `http://mediamtx:8888/…`).

CSP: `connect-src` must include `http:` so Chromium/booth can fetch LAN playlists and segments (today `frame-src` allows `http:`, `connect-src` does not).

---

## Errors

| Case | Behavior |
|---|---|
| Playlist 404 / fatal hls.js | Cover on, min 3s, fade 400ms |
| Native HLS `error` | Same |
| No decoded frame | Dark + brand, no blur |
| Recover before 3s | Hold cover, then fade out |
| CORS / mixed content | Fatal → cover. Fix origin/CORS, not a second player |
| Invalid URL | Do not mount a player |
| Transparent public overlay | No camera, no cover |

---

## Tests

- `hlsPlaylistUrl("http://mtx:8888/growcam/")` → `http://mtx:8888/growcam/index.m3u8`
- already `.m3u8` unchanged; non-http → `""`
- `coverShouldHide`: fatal → false; playing + 2s since show → false; playing + 3s → true
- OverlayShell and homepage: `OverlayCamera`, no MediaMTX `<iframe>`
- OverlayCamera source: `hls.js` or `Hls`, `growCastLogo_green.svg`, `Reconnecting`, `blur`, fade, `COVER_MIN_MS`
- `connect-src` includes `http:`
- Camera-look filter still on the cam wrap (video, not iframe)

---

## Out of scope later

Range of HLS via GrowCast if a public HTTPS overlay cannot reach LAN MediaMTX (existing mixed-content limit). Tent-mic on the AAC track.
