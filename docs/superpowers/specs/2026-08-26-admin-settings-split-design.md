# Split Settings into five admin homes

**Date:** 2026-08-26  
**Branch:** `feat/obs-overlay`  
**Status:** architecture approved; spec written

`/admin` is one long page. Split it into five sidebar routes. Streaming becomes an operator page (preview + Stream / Overlay / Twitch). Capture token is auto-created on disk so restream no longer needs a manual `.env.local` line.

---

## Non-goals

- GGS MQTT / Spider Farmer login in the dashboard (stay in `extensions/GrowCast-GGS/.env`)
- Worldwide SaaS or new camera/controller onboarding
- Changing public `/overlay` (OBS Browser Source stays unlisted and ungated)
- Query-param overlay layout or stream (`?layout=`, `?stream=`)
- Restream logs in the dashboard
- New stream backends (WHIP, MediaMTX in Compose)
- Putting the Twitch key or capture token in public grow JSON

---

## Product

| Decision | Choice |
|---|---|
| v1 | Split existing fields + Streaming operator page. No GGS credentials UI. |
| Navigation | Five real routes in existing `AdminChrome` sidebar |
| Settings header / `/admin` | Grow |
| Streaming layout | Preview on top, then Stream / Overlay / Twitch cards |
| Preview | Always camera + HUD, using `grow.streamUrl` (same HLS OBS would use) |
| Capture token | Auto-written to `data/restream/capture.token`. Env optional override. |
| GGS page | Sidecar health, live devices, energy tariffs/watts. Climate targets stay on Grow. |
| Complete Grow | Top of Archives |
| Saves | Per page, only that page’s files |

---

## Routes

| Nav | Route | Contents |
|---|---|---|
| Grow | `/admin` | General, Lifecycle, Climate targets, Status, Notes, Hardware, Socials, Pictures, show-Settings-in-header. Media manager stays. |
| Stream | `/admin/stream` | Preview, Stream URL, show grow name, overlay layout/stream/scale, OBS URL, Twitch key + Start/Stop + status |
| Timelapse | `/admin/timelapse` | Pause, timezone, interval, three trigger times, length, quality |
| GGS | `/admin/ggs` | Sidecar health, live devices, energy public/private €/kWh, per-outlet watts |
| Archives | `/admin/archives` | Complete Grow form, then existing archive list. Per-archive edit stays `/admin/archives/[id]`. |

Public header **Settings** stays `{href: "/admin", label: "Settings"}`. Sign-out unchanged. Login still renders on `/admin` when logged out; other `/admin/*` pages redirect to `/admin` like `/admin/archives` already does.

No new public routes. `/overlay` and `/overlay/capture` stay.

### Hash redirects

On Grow (`/admin`) only, a small client script maps leftover hashes:

| Hash | Destination |
|---|---|
| `#stream` `#overlay` `#twitch` | `/admin/stream` |
| `#timelapse` | `/admin/timelapse` |
| `#energy` | `/admin/ggs` |
| `#archive` | `/admin/archives` |
| `#general` `#lifecycle` `#climate` `#status` `#notes` `#hardware` `#socials` `#pictures` | stay, in-page anchors on Grow |

---

## Streaming page

16:9 preview on top, then three cards.

**Preview** renders `OverlayHud` on the Stream page (admin session). `overlayStream="include"`, `lockStream`, `streamUrl={grow.streamUrl}`, layout and scale from the grow. Same HUD as OBS, camera forced on. Not an iframe of public `/overlay` (Transparent would hide the tent). Not `/overlay/capture` (no capture token in the admin UI).

Empty `streamUrl`: copy “Save a Stream URL” — no black player.

Public `/overlay` still follows Transparent vs Include. OBS URL is unchanged. Optional `GROWCAST_RESTREAM_STREAM_URL` is **sidecar encoder only** (internal MediaMTX). Admin preview never uses it.

**Stream card:** Stream URL, show grow name above stream. Save writes those grow fields.

**Overlay card:** layout radios, transparent/include radios, HUD scale, read-only OBS URL. Save writes overlay grow fields.

**Twitch card:** existing RestreamPanel (key, Start/Stop, status from sidecar files).

Stream and Overlay can share one Stream-page save; Twitch stays its own actions.

---

## Capture token

File: `data/restream/capture.token` (mode 600), next to `twitch.key`. Never grow JSON, never logs, never the Stream page.

Resolution order for GrowCast capture gate **and** the sidecar:

1. `GROWCAST_RESTREAM_TOKEN` env if non-empty (override)
2. else the capture.token file

If neither exists, GrowCast generates 32 cryptographically random bytes, base64url, writes the file. Triggers: Stream page load, Twitch Start, capture-page authorize. Sidecar does not generate; it polls the file each loop like `twitch.key`. Until the file (or env) exists it logs `token=missing` and stays error, same as today.

Existing hosts with only env keep working (override). New hosts never edit `.env.local` for this.

Sidecar `/overlay/capture?token=` stays fail-closed. Redact token in sidecar logs.

---

## Other pages

**Grow** — one Save → grow JSON only. Does not write timelapse or energy. No stream/overlay/Twitch/timelapse/energy/complete-grow panels.

**Timelapse** — one Save → timelapse settings file only. Missing plugin: same empty copy as today.

**GGS** — read-only health from live climate JSON (last update, online). Device list from the same payload. Energy Save → energy settings only. No devices yet: tariffs still editable; watt rows appear when live devices exist. Copy if sidecar has never posted: “sidecar not reporting”.

**Archives** — Complete Grow (harvest date, yield, confirm) then the list. Completing still cannot be undone from the UI.

---

## Data and actions

Split `saveAdminSettings` so each page cannot clobber another file:

- Grow save → `updateCurrentGrow` only
- Timelapse save → `saveTimelapseSettings` only
- Stream save → grow fields for stream/overlay/showGrowName only
- Energy save → `writeEnergySettings` only
- Complete Grow / Twitch key / start / stop — existing actions; redirects go to the page you were on (`/admin/archives`, `/admin/stream`)

`AdminChrome` `SETTINGS_SECTION_LINKS` becomes five `{href, label}` page links. Active state is pathname, not hash.

---

## Errors

- Auth failures: same notices as today
- Stale grow id: same `stale_grow` notice on the page that posted
- Bad HLS in preview: player/iframe failure inside OverlayHud, not a 500
- Sidecar down / stale heartbeat: Twitch status Off (existing rule)
- Missing capture token file: sidecar error until GrowCast writes it; Start from Stream page writes it first
- Capture without token: `notFound()` as today

---

## Tests

- Public nav still has Settings → `/admin` and no Capture/Twitch
- Admin chrome lists Grow/Stream/Timelapse/GGS/Archives routes, not 14 hashes
- Grow form has no stream/overlay/twitch/timelapse/energy/complete-grow fields
- Stream page OverlayHud is include+lockStream and uses `grow.streamUrl`, not `GROWCAST_RESTREAM_STREAM_URL`
- Capture token: create file, 600, env overrides file, capture gate uses resolved token, sidecar source reads file (and env override), no token in Stream UI
- Archives page includes Complete Grow
- Energy save does not write grow JSON; grow save does not write energy
- Hash map: `#twitch` → `/admin/stream` (string present in the Grow client redirect helper)
- Compose still does not interpolate `GROWCAST_RESTREAM_TOKEN:` into restream `environment:`

---

## Implementation notes

- Reuse `AdminPanel` / existing field components. Do not restyle the admin theme.
- Preview is a 16:9 frame; OverlayHud already fills its parent.
- Ensure `data/restream/` is created with the same uid 1001 write path as `twitch.key`.
