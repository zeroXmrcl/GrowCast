# OBS plant-stream overlay

**Date:** 2026-08-25  
**Branch:** `GrowCast-GGS`  
**Status:** approved for implementation

A public, unlisted GrowCast page that plant streamers add as an OBS Browser Source. It paints a transparent HUD over the tent camera: climate, plant/day, gear, and energy. Layout is left rail (default) or bottom bar, chosen in Settings.

---

## Non-goals

- A separate overlay repo or hosted SaaS for streamers without GrowCast
- Twitch Extension (player overlay, Twitch review)
- Overlay item in the public site header or `navItemsFor`
- Token / unlisted path / admin-cookie auth for `/overlay` (the URL is public, same numbers as the dashboard)
- Putting the tent still or HLS on the overlay (the stream **is** the camera)
- Energy graphs, 7d/30d/grow windows, or tariff editor on the overlay
- Count-up number animations
- Query-param layout override (`?layout=`) in v1 — Settings is the only switch
- Changing live climate SSE, Energy math, or Cloudflare Tunnel config

---

## Product

| Decision | Choice |
|---|---|
| Where it lives | GrowCast route `/overlay`, not a new project |
| Who can open it | Public URL; not linked from public nav |
| How it is used | OBS Browser Source, 1920×1080, transparent, do not shut down when not visible |
| Layouts | `left-rail` (default) and `bottom-bar` |
| Switch | Settings: radio + copy-paste OBS URL |
| Data | Climate + plant/day + gear on/off/% + live watts and today kWh/€ |
| Missing feeds | Drop those blocks; remaining HUD eases into place |

---

## Architecture

`/overlay` is **not** under `app/(site)/`. Root layout still provides fonts and `html`/`body`. Overlay layout owns a full-viewport transparent page: no `SiteHeader`, no `SITE_FRAME_CLASS`.

```
app/overlay/layout.tsx     transparent chrome-free shell
app/overlay/page.tsx       server wrapper → client HUD
components/overlay-*       shell, identity, climate, gear, energy
lib/overlay-motion.ts      durations / easing (single source)
```

OBS loads `https://<public-host>/overlay`. The tent cam is a separate OBS source underneath.

---

## Settings and grow record

Add `overlayLayout` to `GrowRecord` / `GrowUpdateInput` / empty grow defaults:

- Type: `"left-rail" | "bottom-bar"`
- Default / junk / missing: `"left-rail"`
- Persist in `current-grow.json`
- Included on `GET /api/data/current-grow` so the overlay can pick up a Settings save without restarting OBS

Settings UI (existing grow form, not a public tab):

- Overlay layout: Left rail | Bottom bar
- Read-only OBS URL built from the same public origin helper as CSRF / `metadataBase` (`publicRequestOrigin` / `shareCardMetadataOrigin`), e.g. `https://grow.0xmarcel.com/overlay`
- Short note: Browser Source 1920×1080, transparent, keep running when not visible

`navItemsFor` does not gain an Overlay entry.

---

## Components

| Unit | Role | Presence |
|---|---|---|
| `OverlayShell` | 100vw × 100vh, transparent, layout class from `overlayLayout` | Always |
| `OverlayIdentity` | Plant name + day (`getDaysSince(seededAt)` in `APP_TIMEZONE`) | Always (grow always exists) |
| `OverlayClimate` | LIVE/STALE, temp, humidity, VPD | Only while `shouldShowLiveRow(snapshot)` |
| `OverlayGear` | Same chips as dashboard (`mapDeviceTiles`) | Same as climate |
| `OverlayEnergy` | `nowWatts`, today `windows.today.kWh` / `costEur` | Energy DTO present and `empty !== true` |

Reuse existing formatters (`formatTempC`, `formatHumidityPct`, `formatVpd`, `formatWatts`, `formatKwh`, `formatEur`) and `climateBadge` / `isClimateStale`.

---

## Data flow

1. Overlay client polls `GET /api/data/current-grow` every few seconds (identity + `overlayLayout`).
2. Climate/gear: `useLiveClimate` (JSON + SSE, JSON poll on 503/error). Unmount climate+gear when `shouldShowLiveRow` is false.
3. Energy: `fetchEnergyDto` on `ENERGY_POLL_MS` (60s). Unmount energy when parse fails or `empty` is true. `nowWatts` may be null while today window exists — still show the block, watts as "—".
4. No new authenticated endpoints.

---

## Motion

Constants in `lib/overlay-motion.ts` (exact values, not magic numbers in JSX):

| Token | Value |
|---|---|
| Enter duration | 220ms |
| Leave duration | 160ms |
| Stagger | 40ms (identity → climate → gear → energy) |
| Slide | 10px (rail: +x from left; bar: +y from below) |
| Easing enter | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Easing leave | `cubic-bezier(0.4, 0, 1, 1)` |
| Chip color | 150ms |
| LIVE dot | slow opacity pulse (~2s), not the panel |
| Numbers | tabular-nums; **no** count-up |

Enter: fade + slide. Leave: reverse, faster, then unmount. Flex/grid `gap` so siblings ease when a neighbor is gone — no 200px snap.

`prefers-reduced-motion: reduce` → opacity only, stagger 0, no pulse.

---

## Empty / error

- No GGS live row → climate + gear leave together; identity (and energy if any) stay.
- No Energy DTO / `empty` → energy leaves; climate/gear stay if live.
- SSE stale but still a row → climate stays mounted, badge STALE, pulse off.
- Energy fetch error: keep the last good DTO if one exists; unmount energy only when there has never been a DTO, or a successful response has `empty: true`.
- Overlay page itself never shows site 404 for a missing still; HUD with identity only is valid.

---

## Visual (HUD)

Dark glass panels (`rgba(9,9,11,0.72)`), zinc type, green LIVE, same on/off chip language as the dashboard. No marketing header, no domain string, no GrowCast footer. Page background **transparent** (`html, body { background: transparent }`) so OBS shows the camera through holes.

Left rail: stacked column, inset from the left edge.  
Bottom bar: one strip along the bottom with identity, climate, gear, energy in a row (missing slots omitted, remaining items ease).

---

## Tests

- Parse `overlayLayout`: missing/junk → `left-rail`; `"bottom-bar"` round-trips.
- Presence helpers (or the overlay state reducer): live snapshot → climate/gear on; empty public snapshot → off; energy `empty: true` → energy off; good DTO → energy on.
- `navItemsFor` never includes `/overlay`.
- `app/overlay/layout.tsx` does not import `SiteHeader` or `SITE_FRAME_CLASS` (source read).
- Motion module exports the durations above; overlay components import those constants.
- Settings parse/save includes `overlayLayout` with the existing grow form tests extended — no hardcoded PNG bytes, no reimplementation of climate math.

---

## File map (expected)

| File | Change |
|---|---|
| `app/overlay/layout.tsx` | Create, transparent shell |
| `app/overlay/page.tsx` | Create |
| `components/overlay-shell.tsx` (and small overlay pieces) | Create |
| `lib/overlay-motion.ts` | Create |
| `lib/db.ts` | `overlayLayout` on grow |
| `lib/admin/parse-grow-form.ts` / `save-settings.ts` / settings fields | Layout control + OBS URL |
| `lib/site-nav.ts` | Unchanged (no Overlay item) |
| `tests/overlay-*.test.ts` plus existing grow/settings/nav tests | Extend |

---

## Out of scope follow-ups (explicit, not v1)

Twitch Extension, unlisted token URL, query-param layout, Energy graphs on the HUD, extracting a standalone overlay app.
