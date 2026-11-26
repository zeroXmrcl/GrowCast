# Broadcast music, Twitch alerts, and a 1080p program monitor

**Date:** 2026-09-07  
**Branch:** `ggs-overlay`  
**Status:** implemented

The 24/7 Twitch restream is silent (`anullsrc`) and the Broadcast preview drops `OverlayHud` into a fluid admin box, so the HUD follows the *booth* viewport (`32vw`), not the 1920×1080 encode. v1 adds background music (playlist files **or** a stream URL), on-stream alerts (manual + Twitch follow/sub/raid/bits), and a program monitor that looks and sounds like the encode.

One 1920×1080 **program scene** is shared: Chromium capture, booth preview, music, alerts. Public `/overlay` and the homepage stay unchanged (no music, no these alerts).

---

## Non-goals

- Twitch chat, channel points, gifted-sub train UI, VODs, clips
- Shuffle, per-event custom sounds, StreamElements / Streamlabs
- Music or these alerts on public `/overlay`, `/`, Energy, Gallery, Past Grows
- Capture token in the booth iframe `src`
- Helix, OAuth, or admin secrets in the restream sidecar
- Multi-replica EventSub / shared queue
- Changing the public overlay URL or OBS Browser Source setup
- New stream backends (WHIP, MediaMTX)
- ON AIR tally on the program monitor

---

## Product

| Decision | Choice |
|---|---|
| v1 | Music + manual alerts + Twitch follow/sub/raid/bits + WYSIWYG program |
| Surfaces | Twitch encode + Broadcast preview only |
| Program | 1920×1080 scene, CSS-scaled into the booth, letterboxed |
| Music source | Uploaded files **or** a stream URL (URL wins while non-empty) |
| Alerts | Manual Send alert + EventSub; same chrome |
| Alert placement | Opposite the HUD (left rail → bottom-right; bottom bar → top-center) |
| Alert sound | Visual always; sting toggle **default on** |
| Booth | Mixer strip under the monitor; racks: Twitch, Music, Alerts, OBS, Camera |
| Twitch login | OAuth in GrowCast; EventSub webhooks to the tunnel |

---

## Program scene

The program is a full 1920×1080 document, not `OverlayHud` mounted in a fluid `aspect-video` box.

**Capture (sidecar, unchanged URL):** Chromium kiosk `1920×1080` loads `/overlay/capture?token=…` (fail-closed token, stream always included). That page is camera + HUD + music element + alert layer + optional sting.

**Booth preview:** Session-gated route (e.g. `/admin/stream/program`). Same scene as capture. Iframe is **1920×1080**, then `transform: scale(…)` to fit the column; letterbox leftover. Audio from that iframe is the mix the operator hears. Do **not** put `GROWCAST_RESTREAM_TOKEN` (or `capture.token`) in the iframe `src` — Referer would leak it. Admin cookie / session only.

**Encode:** ffmpeg `x11grab` 1920×1080 plus Chromium audio via Pulse. If Pulse is missing, log and fall back to `anullsrc` so video stays up.

**Not on this scene:** public `/overlay` (OBS HUD). Overlay layout/scale still come from grow JSON and apply **inside** the 1080p document (so `32vw` is 32% of 1920, not of the admin window).

---

## Booth

Keep `AdminChrome` and `/admin/stream`. Grid: program left, racks right.

**Mixer strip** (under the scaled monitor):

- Play / pause, volume, now-playing
- Short text + **Send alert** — enqueues immediately. Audible in the booth always; on Twitch only while the sidecar is live

**Racks** (right column, existing cards plus two):

| Rack | Contents |
|---|---|
| Twitch | Start / Stop, dashboard toast, stream key, channel (unchanged) |
| Music | Playlist uploads, optional stream URL, loop on |
| Alerts | Connect Twitch, Follow/Sub/Raid/Bits toggles, Alert sound switch |
| OBS | Overlay URL, stream/layout/scale (unchanged) |
| Camera | Stream URL, show grow name (unchanged) |

URL non-empty → that stream is the music source. URL empty → playlist loops in **filename** order (no shuffle, no saved order field). Both empty → silence, encode continues.

Uploads: `data/restream/music/` (not grow JSON). Allow mp3 / ogg / wav / m4a; reject other types and oversized files (cap 20 MB each, max 30 files).

---

## Alerts

One visual language for manual and Twitch events: `{kind, title, body}` (e.g. kind `follow` / `sub` / `raid` / `bits` / `manual`).

**Placement:** if `overlayLayout === "bottom-bar"` → top-center; else bottom-right. Never cover the HUD rail/bar.

**Queue:** one on screen at a time, **6 seconds**, FIFO. Cap **15**; if full, drop the oldest and log. Manual Send alert uses this queue.

**Sting:** Broadcast switch, default **on**. Off → visual only, no duck. On → short sting and duck music (~12 dB) for the sting; then restore volume.

**Without Twitch OAuth:** music, mixer, and manual alerts work. Follow/Sub/Raid/Bits toggles disabled until Connect succeeds.

---

## Twitch OAuth and EventSub

**Connect Twitch** on the Alerts rack. Authorization code flow in the GrowCast container. Store tokens in `data/restream/twitch-oauth.json` mode 600. Never grow JSON. Never the sidecar.

Scopes (this list only): `moderator:read:followers`, `channel:read:subscriptions`, `bits:read`. Raid uses the broadcaster user token (`channel.raid` as the destination). No chat scopes.

**Transport:** EventSub **webhooks** to the public origin + `/api/twitch/eventsub` (Cloudflare Tunnel). Verify Twitch message signature. Invalid signature → 4xx, no enqueue.

Map:

| Event | Alert |
|---|---|
| `channel.follow` | follow |
| `channel.subscribe` | sub |
| `channel.raid` | raid |
| `channel.cheer` | bits |

Toggles in `data/restream/alerts.json` filter enqueue; default all **on** after first successful Connect.

Refresh token failure → show Connect again; music and manual alerts keep working. EventSub subscription create/renew is GrowCast’s job after Connect and on boot if tokens exist.

Fan-out: **SSE** from GrowCast to capture and booth preview for alert enqueue. Mixer play/pause/volume writes `audio.json`; program pages **poll it every 2s**. In-memory alert queue is enough for the single Compose replica. Restart clears the queue.

---

## Data and audio control

Do not put music paths, OAuth, or alert state in `current-grow.json`.

| File | Role |
|---|---|
| `data/restream/audio.json` | `url`, `volume` (0–1), `paused` |
| `data/restream/music/*` | Uploaded tracks |
| `data/restream/alerts.json` | Event toggles, `stingEnabled` (default true) |
| `data/restream/twitch-oauth.json` | User tokens |
| `data/restream/eventsub.secret` | Webhook secret |
| Existing `twitch.key`, `control.json`, `status.json`, `channel.json`, `capture.token` | Unchanged |

Mixer play/pause/volume is an admin action that writes `audio.json`. Capture and preview poll it every 2s and apply to the `<audio>` element.

Sidecar: add Pulse so Chromium audio is capturable. Do **not** pass `.env.local` wholesale into restream; only `GROWCAST_URL`, ingest, and restream token/stream-url as already required.

---

## Errors

- Music URL fails → fall back to playlist; both missing → silence
- Upload reject → notice, no write
- Pulse missing → log, `anullsrc` fallback, video stays live
- EventSub verify fail → 4xx
- OAuth/refresh fail → Connect CTA, no crash
- Send alert with empty text → no enqueue
- Public `/overlay` and `/` never load program audio or this alert layer

---

## Tests

No live Twitch account required (Helix/EventSub mocked).

- Program monitor iframe is 1920×1080 then scaled; booth does not mount HUD in a fluid box
- Capture token absent from booth iframe `src`
- URL set → that audio source; URL empty → playlist loop; both empty → no `src`
- Send alert enqueues `{kind: "manual"}`; left-rail vs bottom-bar pick opposite placement
- EventSub valid signature accepted; bad signature 4xx; follow/sub/raid/cheer map to the shared alert shape
- Queue: 6s display, FIFO, cap 15 drops oldest
- `stingEnabled: false` → no sting/duck; visual still enqueued
- OAuth file and music directory never written into grow JSON
- Restream compose env does not interpolate Helix/admin/mesh secrets
- Pulse-missing path still starts ffmpeg (silent fallback)

---

## Implementation notes

- Reuse `OverlayHud` inside the 1080p program document; add a sibling alert layer and audio controller. Do not reuse the homepage Twitch-purple toast.
- EventSub handler is a Route Handler; signature verify before JSON parse side effects.
- ffmpeg line today: `x11grab` + `anullsrc`. Replace `anullsrc` with Pulse when available.
- Preview route: `force-dynamic`, `isAdminAuthenticated`, same body as capture minus token check.
- YAGNI: no shuffle, no per-kind sound files, no chat.
