# Program alert chrome, independent scale, and watermark clearance

**Date:** 2026-09-08  
**Branch:** `ggs-overlay`  
**Status:** approved design, not implemented

Program alerts reuse the HUD glass card (`OVERLAY_PANEL_CLASS`) and sit **bottom-right** on left-rail, which covers the GrowCast watermark (`right-6 bottom-6`, `z-10`). HUD scale (50–200%) does not apply to the alert layer. v1 restyles the toast, moves it off the watermark corner, and adds a separate scale slider.

This document **replaces** the 2026-09-07 music/alerts spec on program-alert **chrome and placement** only (that spec’s bottom-right / top-center HUD-panel toast). Queue, sting, EventSub, mixer POST, and music are unchanged.

Surfaces stay the 1920×1080 **program scene** only (Twitch capture + Broadcast preview). Public `/overlay` is unchanged.

---

## Non-goals

- Per-kind accent colors, slide-in / motion beyond the existing 6s FIFO
- Operator corner picker, collision math, or a watermark safe-rect engine
- Alerts on public `/overlay`, `/`, Energy, Gallery, Past Grows
- Changing HUD scale, watermark position, EventSub, mixer Send-alert POST, sting, or queue rules
- New routes or a second overlay URL

---

## Product

| Decision | Choice |
|---|---|
| Chrome | Kind toast: green accent bar, kind chip, headline |
| Accent | GrowCast green (`#22c55e`) for every kind |
| Copy | Chip from `kind`; headline from `body`; no extra verb line |
| Placement | Left-rail → **top-right**; bottom-bar → **top-left** |
| Watermark | Unchanged corner and size; never shares the alert corner; not scaled |
| Scale | Independent `alertScalePct`, Alerts rack slider, 50–200% step 5, default 100 |
| 100% size | The approved kind-toast mockup (chip 12px, headline 28px, min-width 340px) |
| Scale origin | Same as placement corner, so the toast grows into the plant |
| Queue | Unchanged: one on screen, 6s, FIFO, cap 15 |

---

## On-stream chrome

Same `{kind, title, body}` payload. `title` is unused on screen (EventSub still writes "Follow" / "Sub" / …; manual still writes "Alert").

| Kind | Chip | Headline |
|---|---|---|
| `follow` | Follow | `body` (username) |
| `sub` | Sub | `body` (username) |
| `raid` | Raid | `body` (`Ada` or `Ada · 12`) |
| `bits` | Bits | `body` (`Ada 100`) |
| `manual` | Alert | `body` (mixer text) |

Markup (not HUD panel class):

- Dark toast (`rgba(9,9,11,0.86)`), 14px radius, 1px white 8% border
- 6px GrowCast-green bar on the left
- Chip: 12px, weight 700, letter-spacing, uppercase, green `#4ade80`
- Headline: 28px, weight 650, zinc-50, wraps; toast max-width 28rem so a long manual line does not run into the HUD or the watermark corner

Layer: `pointer-events-none`, `z-20`. Watermark stays `z-10`. They do not occupy the same corner, so z-order is not the clearance mechanism.

Placement CSS:

| Layout | Toast | Transform origin |
|---|---|---|
| `left-rail` | `top-8 right-8` | `top right` |
| `bottom-bar` | `top-8 left-8` | `top left` |

GrowCast watermark (unchanged): left-rail `right-6 bottom-6`; bottom-bar `right-6 top-6`.

---

## Scale

`alertScalePct` is **not** `overlayScalePct`. HUD scale still wraps only the left rail / bottom bar.

- Parser: reuse `parseOverlayScalePct` (min 50, max 200, step 5, junk/missing → 100)
- Apply: `transform: scale(pct/100)` on the toast wrapper; `none` at 100
- Origin: `top right` on left-rail, `top left` on bottom-bar
- Live update: add `alertScalePct` to the existing `/api/overlay/program-audio` JSON (already reads `alerts.json` for `stingEnabled`). `OverlayAlertLayer` polls that document every 2s with the same capture-token / admin-cookie auth as `ProgramAudio`. Poll failure → keep last good scale; first paint 100 until a successful read
- Capture sidecar Chromium does not restart when the operator saves the slider

---

## Settings and booth

File `data/restream/alerts.json` gains `alertScalePct`. Mode 600, off grow JSON, as today.

```json
{
  "follow": true,
  "sub": true,
  "raid": true,
  "bits": true,
  "stingEnabled": true,
  "alertScalePct": 100
}
```

Alerts rack: existing Twitch toggles, Alert sound, plus a range input named `alertScalePct` (same slider pattern as Overlay scale, label **Alert scale**). The slider is enabled without Twitch Connect. `saveAlertsSettingsAction` writes `parseOverlayScalePct(formData.get("alertScalePct"))` with the booleans. Missing file / missing field reads as 100.

Mixer Send alert stays `fetch` POST JSON. Empty body still does not enqueue.

---

## Components

| Piece | Change |
|---|---|
| `lib/overlay-alert.ts` | `alertPlacement` returns `top-right` / `top-left`. Add `alertToastCopy(alert)` → `{chip, headline}`. |
| `lib/overlay-scale.ts` | Add `overlayAlertScaleStyle(scalePct, layout)` (origin from placement). Keep `overlayHudScaleStyle` as-is. |
| `lib/restream/alerts-settings.ts` | `alertScalePct` on the settings type; parse via `parseOverlayScalePct`. |
| `lib/restream/program-http.ts` | Include `alertScalePct` in program-audio JSON. |
| `components/overlay-alert-layer.tsx` | Kind-toast markup; placement + origin; 2s scale poll. Drop `OVERLAY_PANEL_CLASS`. |
| `app/admin/alerts-panel.tsx` | Alert scale slider. |
| `app/admin/actions.ts` | Persist `alertScalePct` from the form. |
| Watermark, HUD, EventSub, mixer POST, SSE hub | Unchanged. |

No new routes. `ProgramScene` still mounts `OverlayAlertLayer` as a HUD sibling.

---

## Errors

- Missing or junk `alertScalePct` → 100
- Slider posts a bad number → clamp/snap, still write the file
- Long `body` → wrap inside the toast max-width
- Scale poll 4xx/network → last good scale (or 100 if none yet)
- Empty manual send → no enqueue (existing)
- Public `/overlay` never loads this layer

---

## Tests

Extend existing files:

- `alertPlacement`: left-rail → `top-right`, bottom-bar → `top-left`
- `alertToastCopy`: chip from kind, headline from body for each kind
- `parseAlertsSettings`: default 100; `77` → 75; `30` → 50; `999` → 200
- Program-audio JSON includes `alertScalePct`
- Layer source: kind-toast classes, scale origin, poll path; **not** `OVERLAY_PANEL_CLASS`; **not** `bottom-8 right-8` or `top-8 left-1/2`
- Alerts rack includes `name="alertScalePct"`
- Overlay chrome: watermark still `right-6 bottom-6` / `top-6`; HUD scale still only on the rail
- `npm test` and `npm run build` before push
