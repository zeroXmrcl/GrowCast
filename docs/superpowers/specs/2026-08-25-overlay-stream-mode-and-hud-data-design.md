# Overlay stream mode and HUD diary/energy

**Date:** 2026-08-25  
**Branch:** `feat/obs-overlay`  
**Status:** architecture approved; remaining sections locked from brainstorm (approach 1)

Settings choice between a transparent OBS HUD and an overlay that embeds the tent stream. Identity and energy show more of the grow record / energy DTO when those fields exist.

---

## Non-goals

- Per-field overlay checkboxes (stage, strain, schedule, grow kWh)
- Query-param overrides (`?stream=`, `?layout=`)
- Extra GGS sensors (CO2, PPFD, soil)
- Energy 7d / 30d windows, graphs, or per-device rows on the overlay
- Health status on the overlay
- Scraping strain out of notes markdown
- Coupling overlay title to the public `showGrowName` checkbox
- New APIs, Overlay nav item, Twitch Extension

---

## Product

| Decision | Choice |
|---|---|
| Stream default | `transparent` (page see-through; OBS camera underneath) |
| Stream opt-in | Settings radio: Transparent \| Include stream |
| Include + empty/unsafe `streamUrl` | No iframe (still transparent) |
| Identity title | Grow `name` when non-empty, else `plant`, else `"Plant"` |
| Identity meta | `Day N · stage · lightSchedule` — omit empty stage/schedule and extra separators |
| Strain | Third line when `details.strain` is set and not equal to the title (trim, case-insensitive) |
| Health | Never shown |
| Extra energy | Grow-to-date kWh/€ column next to Now + Today |
| Missing fields | Drop that line/column; no placeholders except energy `"—"` for null watts/cost (same as today) |
| Discovery | Settings Overlay panel only |

---

## Architecture

Same `/overlay` page and `GET /api/data/current-grow` poll. Two additive pieces:

1. **`overlayStream: "transparent" | "include"`** on `GrowRecord`, next to `overlayLayout`. Missing/junk → `"transparent"`. Settings radios in the existing Overlay section. OBS URL unchanged (no query param). Iframe only when mode is `include` **and** `safeHttpUrlOrEmpty(streamUrl)` is non-empty.

2. **Richer read of fields already stored.** Overlay client maps `details.stage`, `details.lightSchedule`, `details.strain` from the same poll. Energy uses existing DTO `windows.grow`. Climate/gear/SSE/energy poll cadence unchanged.

---

## Grow record and Settings

Add `overlayStream` to `GrowRecord` / `GrowUpdateInput` / `EMPTY_GROW`:

- Type: `"transparent" | "include"`
- Default / junk / missing: `"transparent"`
- Persist in `current-grow.json`
- Parse helper `parseOverlayStream` (same shape as `parseOverlayLayout`)
- `updateCurrentGrow` keeps current value when the field is omitted from the input

Settings Overlay panel (below layout radios):

- Overlay stream: Transparent | Include stream
- Transparent copy: see-through; put the tent camera under this Browser Source in OBS
- Include stream copy: embed the Stream URL full-frame under the HUD (needs a Stream URL)
- OBS URL stays read-only; hint unchanged (1920×1080, keep running when not visible)
- No `?stream=` in the URL or the form

`navItemsFor` still has no Overlay entry.

---

## Components

| Unit | Change |
|---|---|
| `parseOverlayStream` / `overlayStreamEmbeds` | Parse mode; true only for `include` + safe URL |
| `overlayIdentityView` | Pure helper: `{title, metaLine, strain}` |
| `OverlayShell` | Iframe only when `overlayStreamEmbeds` is true |
| `OverlayIdentity` | Title + meta line + optional strain line. No health. |
| `OverlayEnergy` | Add Grow column from `windows.grow` when that window exists |
| `OverlayGrowView` | Adds `overlayStream`, `stage`, `lightSchedule`, `strain` |
| Settings Overlay panel | Stream radios |

No new motion tokens. Stage/strain appearing is an in-panel text change, not an `OverlayMotionItem`. Climate/gear presence unchanged.

---

## Data flow

1. Overlay client keeps polling `GET /api/data/current-grow` every `OVERLAY_GROW_POLL_MS`.
2. `parseOverlayGrowBody` reads layout, stream mode, stream URL, name, plant, seededAt, stage, lightSchedule, strain.
3. Identity helper derives title/meta/strain; health is ignored even if present on the JSON.
4. Energy poll unchanged. Render Grow when `windows.grow` exists; omit that column if the window is missing. `overlayEnergyVisible` unchanged (block still drops when DTO missing/`empty`).
5. Shell computes embed from polled `overlayStream` + `streamUrl` so a Settings save shows up without restarting OBS.

---

## Empty / error

- `overlayStream` missing/junk → transparent, no iframe.
- `include` + empty or unsafe URL → no iframe.
- Empty `name` → title falls back to `plant`, then `"Plant"`.
- Empty stage and schedule → meta is only `Day N`.
- Empty strain, or strain equal to title → no third line.
- Energy DTO without `windows.grow` → Now + Today only.
- Grow window with `costEur: null` → kWh plus `"—"` for cost (same as Today).
- No GGS / empty energy: existing leave motion; identity stays.

---

## Tests

- `parseOverlayStream`: missing/junk → `transparent`; `"include"` round-trips.
- `overlayStreamEmbeds`: transparent+URL false; include+safe URL true; include+empty/unsafe false.
- `normalizeGrowRecord` / `updateCurrentGrow` persist `overlayStream`; junk on disk → transparent.
- Settings form parse + save persist `overlayStream`.
- `parseOverlayGrowBody` reads stream mode + diary fields; junk mode → transparent.
- Identity helper: name beats plant; empty name uses plant; strain hidden when blank or equal to title (case-insensitive); meta omits empty stage/schedule.
- Energy: Grow column uses `windows.grow`; omit when missing.
- Settings source has `name="overlayStream"` and no `?stream=`.
- Shell source gates iframe on `overlayStreamEmbeds` (not URL alone).
- `navItemsFor` still has no `/overlay`.

---

## File map

| File | Change |
|---|---|
| `lib/overlay-stream.ts` | Create: type, parse, embed helper |
| `lib/overlay-identity.ts` | Create: title / meta / strain helper |
| `lib/overlay-grow.ts` | Extra view fields |
| `lib/overlay-energy.ts` | Grow window helper (or inline in component + tiny export) |
| `lib/db.ts` | `overlayStream` on record / update / empty / normalize |
| `lib/admin/parse-grow-form.ts` | Parse stream radio |
| `app/admin/settings-fields.tsx` | Stream radios |
| `app/overlay/page.tsx` | Pass new view fields |
| `components/overlay-shell.tsx` | Gate iframe |
| `components/overlay-identity.tsx` | Richer identity |
| `components/overlay-energy.tsx` | Grow column |
| `components/overlay-hud.tsx` | Pass stream mode + diary fields |
| `tests/overlay-*.test.ts`, grow-store, parse-grow-form, save-settings | Extend |
