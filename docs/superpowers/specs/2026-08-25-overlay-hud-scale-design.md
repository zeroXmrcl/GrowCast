# Overlay HUD scale

**Date:** 2026-08-25  
**Branch:** `feat/obs-overlay`  
**Status:** architecture approved; slider 50–200% at 5% steps locked

Settings slider that shrinks or grows the overlay HUD. OBS Browser Source stays 1920×1080. The tent stream (OBS camera or included iframe) does not scale.

---

## Non-goals

- Query-param scale (`?scale=`)
- Changing OBS canvas / 720p presets
- Independent rail-width or font-size controls
- Scaling the stream iframe
- Per-block size

---

## Product

| Decision | Choice |
|---|---|
| What scales | HUD stack only (identity, climate, gear, energy) |
| Control | Settings range input, 50–200%, step 5 |
| Default | 100 (today’s size) |
| Persist | `overlayScalePct` on the grow record |
| OBS URL | Unchanged |
| Stream | Full frame in both transparent and include-stream modes |

---

## Architecture

Same `/overlay` poll of `GET /api/data/current-grow`. `parseOverlayScalePct` clamps to 50–200 and snaps to multiples of 5; missing/junk → 100.

`OverlayShell` sets `transform: scale(overlayScalePct / 100)` on the HUD positioning div, not the iframe. `transform-origin`: `top left` for left rail, `bottom left` for bottom bar.

---

## Settings

Overlay panel, below stream radios:

- Label: HUD scale
- Range `name="overlayScalePct"` min 50 max 200 step 5
- Live `N%` readout
- Hint: shrinks the HUD; Browser Source stays 1920×1080

---

## Empty / error

- Missing / `NaN` / non-numeric → 100
- 77 → 75; 201 → 200; 49 → 50
- Omitted on `updateCurrentGrow` → keep current
- `prefers-reduced-motion` does not disable scale (it is a size, not motion)

---

## Tests

- parse: default 100; snap 5; clamp 50/200; strings from FormData
- persist on grow JSON; junk on disk → 100
- Settings form parse/save
- parseOverlayGrowBody reads scale
- Shell uses overlayHudScaleStyle; iframe is not inside the scaled node
- Settings has `name="overlayScalePct"` and no `?scale=`
