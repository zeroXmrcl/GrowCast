# Live tent climate + devices display

**Date:** 2026-08-22  
**Branch:** `GrowCast-GGS`  
**Status:** draft for operator review (not implemented)

Public homepage shows live GGS climate and plugged-in devices. Spider Farmer credentials stay on the sidecar. This spec is **display only** — no controls, no new ingest API.

---

## 1. Goal

Visitors on the GrowCast homepage see tent temperature, humidity, and VPD change in real time, plus which attached devices are running. Unplugged devices stay hidden; plugging one in makes its tile appear without a page refresh.

### Non-goals

- Admin climate day/night form
- On/off or dimming from the website
- Historical charts
- CO₂ / PPFD / soil until those fields are non-null in the payload
- Light-controller MQTT as a second device (still not on the cloud account)
- Homepage redesign beyond one new row of two cards

---

## 2. Layout

Keep the existing top row: stream (2/3) + Details (1/3).

**New row directly under that**, two equal columns:

| Climate | Devices |
|---|---|

Existing Status | Vitals row stays **below** this new row, unchanged.

On viewports below `lg` (same breakpoint as the rest of the homepage): stack Climate, then Devices.

Admin `DayOrNight` temperature/humidity in Details is **not** live data. Do not copy live values there. Those rows remain hidden while admin targets are 0 (current grow).

Same card chrome as Status / Vitals: `rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950`.

---

## 3. Data

### Source

One client island owns the row.

1. `GET /api/data/live-climate` for first paint (`Cache-Control: no-store`).
2. `EventSource` on `GET /api/data/live-climate/stream` (`event: snapshot` and `event: heartbeat`).
3. Shared snapshot in one hook: `useLiveClimate`. Both cards read it. One connection, not two.

No polling. No extra public routes.

### Empty (never had a snapshot)

`updatedAt === null` or `devices.length === 0`: **do not render the row**. Homepage matches today’s layout. When the first snapshot arrives (GET or SSE), the row appears without a full reload.

### Fresh vs stale

Server already sets `stale` / `online` using 120s. Client also treats “no SSE event for 120s” as stale.

| State | Climate badge | Numbers / tiles |
|---|---|---|
| Fresh | `LIVE` (green, `text-emerald-600 dark:text-emerald-400`) | Current snapshot |
| Stale | `stale · {relative}` grey | **Keep last** numbers and tiles |
| GET failed, no snapshot | Row hidden | — |
| Stream drops after a good GET | Stale | Keep last |

Relative time from `updatedAt`: `8s ago`, `2m ago` (integer seconds until 60s, then minutes). EventSource reconnects natively; a later snapshot restores `LIVE`.

---

## 4. Climate card

Header: `Climate` left; status right (`LIVE` or `stale · …`). Devices card has **no** second LIVE badge.

Body: **three equal columns** — Temp, Humidity, VPD.

| Metric | Format | Source |
|---|---|---|
| Temp | `25.3°` (one decimal) | `sensor.tempC` |
| Humidity | `47%` (rounded integer) | `sensor.humidityPct` |
| VPD | `1.71` (two decimals, kPa implied) | **computed on the client** |

If a sensor field is null, that column shows `—`.

Use the **first CB device that has a numeric `tempC` or `humidityPct`**. If none, all three columns `—`.

Numbers update in place on each snapshot. No color bands, no charts, no day/night targets.

### VPD (do not use Spider Farmer `sensor.vpd`)

Air VPD from tent air temperature (°C) and relative humidity (%). No leaf-temperature offset.

Magnus–Tetens saturation vapor pressure (kPa):

```
es = 0.6108 * exp((17.27 * T) / (T + 237.3))
vpd = es * (1 - RH / 100)
```

`T` is `tempC`, `RH` is `humidityPct`. If either is null or not finite, VPD is null (`—`).

Pure function `airVpdKPa(tempC, humidityPct): number | null` in `lib/` so it can be unit-tested without the DOM.

Ignore `sensor.vpd` from the API.

---

## 5. Devices card

Header: `Devices`.

Body: wrapping row of **icon tiles**, one per actuator in `devices[].actuators` for the same climate source device (the CB used above). If that device has no actuators, render the card with no tiles (row still visible because climate has data).

### Visibility

- Actuator **absent** from the array → no tile (unplugged).
- Actuator **present**, `on === false` → grey idle tile (plugged in, not running).
- Actuator **present**, `on === true` → orange running tile.
- Later snapshot **adds** an id → insert tile (no page reload).
- Later snapshot **removes** an id → remove tile.

Humidifier liveness is already normalized in ingest (`on` iff `level > 0`). The UI uses `on` only.

### Look (outline tiles)

Quiet rounded square (~48px), outline SVG (~26px, stroke 1.8, no fill).

| State | Tile well | Stroke | Caption |
|---|---|---|---|
| Running | `#fff7ed` / dark equivalent | `#ea580c` | normal zinc text |
| Idle | zinc-100 / zinc-800 | `#a1a1aa` | muted zinc |

Label under the icon. Under the label: `level` as `{n}%` when `level` is a finite number; else `on` / `off`.

### Kind → icon

| `kind` / `id` | Label | Icon |
|---|---|---|
| `light` | Light | sun |
| `light` + id `light2` | Light 2 | sun |
| `fan` | Fan | fan |
| `blower` | Blower | blower / intake |
| `humidifier` | Humidifier | droplet |
| `dehumidifier` | Dehumidifier | droplet with slash |
| `heater` | Heater | flame |
| `outlet` | `Outlet {n}` from id `outlet-n` | plug |

Inline SVGs in the component (or a tiny `device-icons.tsx`). No extra icon package. SVGs are decorative (`aria-hidden`); the tile has `title` / accessible name `{label}: on 11%` / `{label}: off`.

No visitor controls.

---

## 6. Components and files

All on GrowCast (`GrowCast-GGS` branch). No sidecar changes except none required for display. VPD ignore is client-only.

| File | Role |
|---|---|
| `lib/air-vpd.ts` | `airVpdKPa` |
| `lib/live-climate-view.ts` | Pick CB snapshot, map actuators for the view, relative time, badge state |
| `hooks/use-live-climate.ts` | GET + EventSource; expose `{ snapshot, stale }` |
| `components/live-tent-row.tsx` | Client island: hide if empty; grid of two cards |
| `components/live-climate-card.tsx` | Three metrics + badge |
| `components/live-devices-card.tsx` | Icon tiles |
| `components/device-icons.tsx` | SVG set keyed by kind/id |
| `app/(site)/page.tsx` | Render `<LiveTentRow />` between the stream row and Status/Vitals |

`useLiveClimate` uses `EventSource` in `useEffect`, aborts/closes on unmount. Parse `event.data` JSON as the existing public snapshot type from `lib/ggs-live.ts`. Heartbeats refresh `updatedAt` for the relative clock even when climate did not change.

Homepage stays a Server Component; only `LiveTentRow` is `"use client"`.

---

## 7. Testing

Node tests (existing `npm test` harness):

- `airVpdKPa(25.3, 47.1)` ≈ `1.71` (±0.05); null in → null out; ignore any SF vpd in fixtures.
- View mapper: missing actuator ids omitted; `on: false` still listed; `on: true` listed as running.
- Empty snapshot → row not rendered (component test or mapper `shouldShowLiveRow`).

Do not require a browser for VPD or mapping tests.

---

## 8. Out of this change

- Reverse-proxy `proxy_buffering off` remains an operator note from the backend work.
- Official app vs sidecar MQTT session (already decided: GrowCast wins).
- Binding the LC to the cloud account.
