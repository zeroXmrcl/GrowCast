# Camera look (program cam grade)

**Date:** 2026-09-08  
**Branch:** `ggs-overlay`  
**Status:** approved design, not implemented

Grade the **live camera picture** on the 1080p program: brightness, contrast, saturation, temperature. HUD, alerts, music wave, and the GrowCast watermark stay unfiltered. Broadcast preview can hunt a draft; Twitch follows only after **Apply**.

---

## Non-goals

- Filter on the whole program frame (HUD / toast / watermark)
- Gamma, highlights, shadows, sharpness, LUTs, curves, vignette
- ffmpeg/`eq` in the restream sidecar
- Persist-on-drag (viewers would see the hunt)
- Live draft on Twitch / capture
- Grade on the public site dashboard cam embed
- OBS filters on a camera source that is not GrowCast’s iframe
- Per-scene or per-grow looks

Public `/overlay` with **HUD only** has no cam, so nothing to grade. Public `/overlay` with **HUD + cam** may SSR the **saved** look; it does not receive drafts. Live Apply while that OBS browser source is open without an admin cookie waits until the source reloads. Twitch restream uses `/overlay/capture`, which polls.

---

## Product

| Decision | Choice |
|---|---|
| Target | Camera iframe only |
| Knobs | Brightness, contrast, saturation, temperature |
| Range | Integer **−100…100**, step **1**, **0 = identity** |
| Preview | Live while dragging (booth `/program` only) |
| Twitch | Last **Apply** (capture polls saved JSON) |
| Reset | Zeros sliders, booth draft, **and** saved file |
| UI | **Camera look** panel on Broadcast, right column, above Music |
| Engine | CSS `filter` + temperature overlay on the cam wrap |

---

## Persistence

File: `data/restream/camera-look.json` (next to `audio.json` / `alerts.json`, not grow JSON). Atomic write, mode `600`.

```json
{
  "brightness": 0,
  "contrast": 0,
  "saturation": 0,
  "temperature": 0
}
```

Missing, unreadable, or junk → `EMPTY_CAMERA_LOOK` (all zeros). Each field: finite number → round to integer → clamp −100…100; otherwise 0.

---

## CSS mapping

Never interpolate user strings into `style`. Build from the four numbers only.

**Filter** (omit a function when its value is 0; empty string when all three are 0):

| Knob | CSS |
|---|---|
| brightness `b` | `brightness(1 + b/100)` |
| contrast `c` | `contrast(1 + c/100)` |
| saturation `s` | `saturate(1 + s/100)` |

So `+12` brightness is `brightness(1.12)`; `−100` saturation is grayscale; `+100` contrast is `contrast(2)`.

**Temperature** is **not** `hue-rotate` on the whole frame (that would tint HUD if mis-applied, and it distorts greens). Sibling overlay on the cam wrap only:

| `t` | Overlay |
|---|---|
| `0` | `display: none` (or opacity 0) |
| `t > 0` (warm) | background `#ff8c4b`, `mix-blend-mode: soft-light`, `opacity: min(0.5, t/200)` |
| `t < 0` (cool) | background `#4b8cff`, same blend, `opacity: min(0.5, abs(t)/200)` |

Overlay is `pointer-events: none`, `absolute inset-0`, same wrap as the iframe, **under** HUD (`z-0` wrap, HUD/watermark `z-10`).

---

## Surfaces

| Surface | What it shows |
|---|---|
| `/program` (Broadcast iframe) | Draft from `postMessage` while hunting; otherwise saved poll |
| `/overlay/capture` (Twitch) | Saved poll only, capture token. Never draft. |
| `/overlay` HUD + cam | Saved look from server render. No draft. |
| `/overlay` HUD only | No cam wrap |
| Public dashboard stream iframe | Raw cam URL, never graded |

---

## Data flow

```
Camera look sliders (admin)
    │  input → postMessage → /program iframe   (draft, booth only)
    │  Apply → POST /api/admin/camera-look     (saved JSON)
    │  Reset → zeros local + postMessage + POST zeros
    ▼
data/restream/camera-look.json
    │
    ├─ GET /api/overlay/program-camera  (admin cookie or capture token)
    │     /program and /overlay/capture poll every 2s
    └─ overlay/page.tsx reads the file at render (HUD + cam SSR)
```

**Draft message** (parent `ProgramMonitor` → child `/program`):

```json
{
  "type": "growcast-camera-look",
  "brightness": 12,
  "contrast": 18,
  "saturation": 10,
  "temperature": 8
}
```

Child ignores the event unless `event.origin === window.location.origin` and `type` matches. Payload is parsed with the same clamp as the file. If the iframe is not loaded yet, keep the latest draft and send it on `load`.

Capture Chromium is not that iframe’s parent; it never receives the message.

After a successful Apply, booth may keep using the draft (it matches saved); the next poll converges. After a failed Apply, draft stays, notice shows, saved file (Twitch) unchanged.

---

## HTTP

**GET `/api/overlay/program-camera`**

- Auth: admin session **or** capture token (`x-growcast-capture` / `?token=`), same helper as program-audio.
- Unauthenticated → **404** (not 401).
- `Cache-Control: no-store`.
- Body: the four integers (never filesystem paths).

**POST `/api/admin/camera-look`**

- Admin session + same-origin CSRF.
- JSON body `{brightness, contrast, saturation, temperature}`.
- Bad JSON / non-object → 400, file unchanged.
- Success → 200 `{ok: true}`; write clamped values.
- `fetch` from the panel, **not** a navigation / server-action redirect.

---

## Components

| Piece | Role |
|---|---|
| `lib/restream/camera-look.ts` | Type, empty, parse/clamp, `cameraLookFilterCss`, `cameraLookTemperatureStyle`, read/write |
| `lib/restream/paths.ts` | `restreamCameraLookFile()` |
| `lib/restream/program-http.ts` | `programCameraGetResponse` |
| `app/api/overlay/program-camera/route.ts` | GET |
| `app/api/admin/camera-look/route.ts` | POST |
| `components/overlay-shell.tsx` | Cam wrap (`z-0`): iframe with **filter**, sibling temperature overlay; `look` prop. HUD/watermark stay outside the wrap |
| `components/overlay-hud.tsx` | Pass `look` through to OverlayShell |
| `components/program-camera-look.tsx` | Client: poll saved; on `/program` listen for draft; pass look into shell (via scene) |
| `components/program-scene.tsx` | Host the look client; OverlayHud/shell receive current look |
| `app/admin/camera-look-panel.tsx` | Four sliders, Reset, Apply, notice |
| `app/admin/program-monitor.tsx` | `postMessage` draft to `/program` on slider events and iframe `load` |
| `app/admin/stream/page.tsx` | Render Camera look above Music |

`OverlayShell` stays the only place that embeds `streamUrl`. Look is a prop so overlay SSR and program client can both feed it.

Program wiring: `ProgramScene` owns look state (poll + optional draft) and passes `look` into `OverlayHud` → `OverlayShell`. `lockStream` still forces `overlayStream="include"`. Capture passes `captureToken` into the look poll headers like program-audio. Draft `postMessage` listener is registered only when `captureToken` is absent (`/program`).

Admin sliders: same chrome as Wave smoothness (uppercase label, tabular readout). Temperature readout: `0` / `+8 warm` / `−8 cool`.

---

## Errors

| Case | Behavior |
|---|---|
| Missing / junk JSON | All zeros |
| GET without auth | 404 |
| POST CSRF / logged out | 403/401 as other admin JSON POSTs; draft stays |
| POST junk body | 400, file unchanged |
| Apply network fail | Notice on the panel; draft stays; Twitch last good save |
| No cam (empty `streamUrl`, HUD-only) | Sliders still save; wrap not rendered |
| `postMessage` wrong origin or type | Ignore |
| Iframe not ready | Queue latest draft; flush on `load` |

---

## Tests

- `parseCameraLook`: default zeros; 12.4 → 12; −200 → −100; 999 → 100; junk keys ignored
- `cameraLookFilterCss` with brightness/contrast/saturation 0 omits those functions; `+12` brightness contains `brightness(1.12)`; never interpolates raw CSS from input
- Temperature style: `0` hidden; `+40` warm `#ff8c4b` opacity 0.2; `−100` cool `#4b8cff` opacity 0.5
- OverlayShell source: `filter` on the cam **iframe**; temperature overlay sibling inside the wrap; HUD/watermark not inside that wrap
- GET 404 without auth; 200 with admin or capture token; body has four ints and no data-dir path
- POST rejects cross-origin; round-trips a write; junk does not write
- Panel source: four range inputs −100…100, Apply, Reset, `postMessage` / `growcast-camera-look`
- Program monitor forwards draft; capture page has no `growcast-camera-look` sender
- Program look client polls `/api/overlay/program-camera` and listens for the draft type only when not capture
- `npm test` and `npm run build`

---

## Implementation notes

v1 is one pass: helpers + HTTP + shell wrap + booth draft + Broadcast panel. No ffmpeg path, no extra knobs.
