# Homepage Devices card: one line beside Climate

**Date:** 2026-09-02  
**Branch:** `feat/obs-overlay`  
**Status:** approved for implementation

The homepage Devices card wraps to two lines when the tent has Light, Light 2, Fan, Blower, Humidifier, Dehumidifier, and Heater. Climate stays one metrics row, so the `lg` two-column tent row looks uneven. Devices must stay a single line from that breakpoint up.

---

## Non-goals

- OBS overlay gear chips (`components/overlay-gear.tsx`)
- Climate card, live ingest, `mapDeviceTiles` payload, labels, icons, or ON / OFF / `%` / LOW / HIGH copy
- Horizontal scroll
- Short labels (`Humid` / `Dehum`)
- Icon-only or level-only tiles
- Changing `LiveTentRow` breakpoints or the Climate / Devices two-column split

---

## Product

| Decision | Choice |
|---|---|
| Surface | Homepage Devices card only (`LiveDevicesCard`) |
| Tile content | Icon + name + level (unchanged) |
| Long names | Truncate with ellipsis; `title` / `aria-label` stay the full accessible name |
| One-line rule | From `lg` up (same breakpoint as `LiveTentRow` `lg:grid-cols-2`) |
| Below `lg` | Wrapping allowed; full-size tiles; full gap; centered |
| Leftover space | Compact group, centered (empty sides, not stretched tiles) |
| Squeeze order | Preferred gap collapses first; tiles shrink only after that void is gone |
| Device count | Whatever `mapDeviceTiles` returns (2, 7, outlets, …) |

---

## Layout

Preferred tile width: `4.75rem` (today). Preferred gap: `1rem` (`gap-4` / `w-4`).

**`lg` and up**

1. `flex-nowrap` + `justify-center`. No wrap.
2. Between tiles, a `1rem` void (not CSS `gap`, which cannot shrink).
3. Voids shrink first (`flex-shrink` much larger than tiles, `min-width: 0`, `max-width: 1rem`).
4. Tiles are `flex: 0 1 4.75rem`, `max-width: 4.75rem`, `min-width: 0`. They only lose width after voids are ~0.
5. Extra free space stays on the sides (`justify-center`, voids do not grow).

**Below `lg`**

- `flex-wrap` + `gap-4` + `justify-center`.
- Voids are not shown (`hidden` until `lg`).
- Tiles stay `4.75rem`.

Implementation lives in `components/live-devices-card.tsx`. Extract row/item/void class strings and a `liveDeviceRowItems(tiles)` helper (tile, void, tile, …) so the squeeze structure is unit-tested without a browser.

Voids are `aria-hidden` list items so they do not appear in the accessibility tree. Tile `key` stays `tile.id`.

---

## Tile internals

- Outer tile is `w-full min-w-0` so it follows the shrinking `<li>`.
- Label: `w-full truncate text-center`. One line. Hover / screen reader unchanged (`title` and `aria-label` already use `accessibleName`).
- Icon well: keep `h-12 w-12` and `rounded-xl`; add `max-w-full` so a shrunken tile cannot overflow the well.
- Colors, Lucide icons, and level captions stay as they are.

---

## Tests

`tests/live-devices-card.test.ts` (and a small `lib/live-devices-layout.ts` if that keeps the component thin):

- 0 tiles → no row items
- 1 tile → one tile item, no void
- 3 tiles → tile, void, tile, void, tile with void keys derived from the following tile id
- Row classes include `flex-wrap`, `justify-center`, `gap-4`, `lg:flex-nowrap`, `lg:gap-0`
- Void classes include `hidden`, `lg:block`, `w-4`, `max-w-4`, `shrink-[100]`, `grow-0`, `basis-4`
- Item classes include `w-[4.75rem]`, `max-w-[4.75rem]`, `basis-[4.75rem]`, `shrink`, `grow-0`, `min-w-0`
- `components/live-devices-card.tsx` uses the helper and `truncate` on the name
- `components/overlay-gear.tsx` still uses `flex-wrap` and does not gain `lg:flex-nowrap`

---

## Files

| File | Role |
|---|---|
| `lib/live-devices-layout.ts` | Row item helper + layout class strings |
| `components/live-devices-card.tsx` | Use helper; truncate name; shrinking tile |
| `tests/live-devices-card.test.ts` | Structure + class contracts |
| `components/overlay-gear.tsx` | Unchanged; asserted by test |
