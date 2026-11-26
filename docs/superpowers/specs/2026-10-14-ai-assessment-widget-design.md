# AI Assessment widget

**Date:** 2026-10-14
**Status:** layout locked and implemented

The dashboard AI Assessment becomes a two-column board section. The score is a ring. The written assessment sits on the left. The day sits on the right. The last 30 scores sit under both, between the first and last day. Motion plays once, then rests. Hover dims the other mosaic rows and shows the slice or day under the pointer.

Mockups from the session live under `.superpowers/brainstorm/` (gitignored). The approved screen is the fitted board: prose beside the day, hairline aligned with Status and Vitals, score cells between the end dates.

## Goals

- Show the whole saved assessment, not only the score and a headline.
- Use the same half-and-half hairline as the Status | Vitals row above the card.
- Play the ring and the mosaic once on load. Do not loop them.
- Drop the chrome sentences that are not part of the assessment.

## Non-goals

- A new assessment API, schema, or prompt
- Changing when the card is hidden (`XAI_API_KEY` or `AI_SUMMARY_DEMO`)
- Changing demo data, the scheduler, or admin regenerate
- A legend, a section title, or a second chart library

## Product lock

| Topic | Decision |
|---|---|
| Where | Dashboard only, the existing `growcast-area-ai` section |
| Split | `lg` and up: two equal columns. The right column has a left hairline, same breakpoint as Status \| Vitals |
| Narrow | One column. The day block gets a top hairline instead of a left one |
| Left | Ring, rating, headline, meta, summary, plant note, up to three recommendations |
| Right | One row per climate metric. The mosaic bar uses the full column width |
| Slots | 48 cells, one per 30 minutes. Stored digits stay 5-minute and are folded for display |
| Footer | 30 daily score cells between the first and last day. No word label |
| Title | No "AI Assessment" heading. The ring is the mark |
| Demo | When the payload is the in-memory sample, the word Demo sits beside the rating |
| Empty | Key set, nothing saved: one line, no ring and no mosaic |
| Notes | Verdict notes are not rendered. The summary and the recommendations keep that meaning |

## Left column

Top row: a 76px ring, then text.

- The ring stroke is the existing score color (`scoreFill`). Track is the board hairline color. The number sits in the center.
- Beside it: rating (`fair`), then the headline on its own line, then the meta line.
- Meta is `date · stage · Day N · confidence N`. Date uses `formatDateDisplay` (`14.10.2026`), not the raw `YYYY-MM-DD`. Omit a meta piece when it is null. Confidence is always present on a saved assessment.
- Summary paragraph under that, full width of the left column.
- Plant line only when `plantObservation` is non-empty: the word Plant, then the sentence.
- Recommendations are the stored lines, at most three, each prefixed with an en dash. No "Recommendations" heading. Omit the list when it is empty.

## Right column

Five rows, metric order unchanged: Temp, RH, VPD, CO₂, PPFD.

Each row is two lines:

1. Name on the left. On the right, the AI range, then the percent in range. The verdict note is not shown here. "Afternoon peaks", "high at night", and the other notes stay off the row. Percent color is `#10b981` for `in_range`, `#f59e0b` for `slightly_off`, `#ef4444` for `off`, and the muted zinc text color for `unknown`. A null percent is omitted.
2. The mosaic for that metric, full width of the column. Each bar is 48 cells, one per 30 minutes, across the same 24-hour window. Colors stay grey / green / amber / red.

The stored mosaic stays 288 five-minute digits. The card folds each group of six into one cell. The cell is empty only when all six are empty. Otherwise it shows the worst sample in that half hour: outside beats close, and close beats in range. A tie keeps the later sample, and a sided digit (`4`–`7`) wins over a legacy `2` or `3`. The hover time is the start of that half hour.

The rows spread to the height of the left column so the day meets the bottom of the prose.

## Tile hover

Each mosaic cell is its own target. One detail card is shared by the row. It sits just above the hovered slice, centered on that slice, not on the pointer. Moving along a row slides that same card to the next slice in 160ms with the same easing. It does not fade out between slices. Leaving the mosaic hides it. Entering again places it on the new slice with no slide in from the previous one. `prefers-reduced-motion` jumps the card instead of sliding it.

The card does not repeat the metric name. It shows the slot start in Europe/Berlin, then one word:

| Cell | Color | Word |
|---|---|---|
| In range | `#10b981` | OK |
| Outside, but within 25% of the range width | `#f59e0b` | ABOVE or BELOW |
| Further outside | `#ef4444` | ABOVE or BELOW |
| No sample | none | time only |

The word uses that color. ABOVE means the slot was over the AI max. BELOW means it was under the AI min. The card does not show the reading, the unit, or the verdict note.

The mosaic string has to keep the side, because the old digits cannot. New rows use `0` empty, `1` in range, `4` below and close, `5` above and close, `6` below and outside, `7` above and outside. Already saved rows stay `0`–`3`, where `2` is close and `3` is outside with no side. Those legacy cells keep amber and red, and the card shows only the time. `cellForValue` writes `4`–`7` from now on and does not write `2` or `3`.

The card's text is also the cell `title`. Cells are not tab stops.

## Footer

The band is full width, with the same horizontal padding as the columns. No heading. The words "Score", "30 days", and "30-day score" are not shown. There is no "no score" sentence.

One row: the first day's date, then the 30 cells, then the last day's date. Dates use `formatDateDisplay`. The window is the existing 30 days ending on the newest `scoreHistory` date. If that history is empty, the band is omitted.

Cells keep the current size, radius, and score colors. Empty days stay the neutral cell.

Hover uses the same gliding card as a mosaic row, and the glide stays inside this row. Moving here from a climate slice places the card on the day with no slide from that slice. The card shows the day's date, then the score in `scoreFill`. An empty day shows the date only. It does not say "score". The `title` matches the card. Cells are not tab stops.

## Motion

Easing is `cubic-bezier(0.16, 1, 0.3, 1)`.

- Ring: the stroke draws once, 900ms, from empty to the score.
- Mosaic rows: each slides in from the left once, 520ms, staggered by 45ms per row. When that animation ends, it is cleared. Hover must not set or restore it, or the slide plays again.
- Score ticks: each grows from the center once, 480ms, staggered by 14ms per day. Hover along the score row glides the same way as a mosaic row, 160ms, and does not replay the grow.
- Hover, pointer over the mosaic: other rows drop to 38% opacity in 180ms. The row under the pointer stays solid. Leaving the mosaic restores every row. Hover does not move the card.
- `prefers-reduced-motion: reduce`: no draw, slide, tick, or detail-card glide. Everything is visible immediately. Hover dim is instant, with no transition. The detail card still appears, on the slice, without moving between slices.

## Empty and demo

The card still renders only when `aiSummaryWidgetEnabled()` is true.

When that is true and there is no summary, the section shows one line: "No assessment yet. The daily job runs around 08:00 (Europe/Berlin)." No ring, no columns, and no mention of the API key.

Demo mode does not change this layout. The only addition is the Demo label next to the rating.

## Files

- `components/ai-summary-card.tsx` — the layout, motion, the 30-minute fold, and the dropped chrome
- `lib/ai-summary/mosaic.ts` — `cellForValue` writes `4`–`7`; a fold of six stored digits into one displayed cell
- `lib/ai-summary/types.ts` — `MosaicCell` includes `4`–`7`. Stored rows stay 288 digits
- `tests/ai-summary-core.test.ts` — fold and the new digits, including legacy `2` and `3`
- `tests/ai-summary-surface.test.ts` — stop requiring the heading string `AI Assessment`; require the summary, a recommendation, the mosaic, and the absence of the color-legend sentence

No change to `lib/ai-summary/public.ts`, the public route, or the admin panel.

## Tests

- A saved summary renders score, headline, summary, plant line, recommendation text, metric ranges, and 48 mosaic cells per metric.
- A metric row does not render its verdict note.
- A close-above cell's detail reads ABOVE and does not include the metric name. A legacy `2` or `3` detail is the time only.
- The legend sentence and the "24h mosaic" label are absent.
- `demo` renders the word Demo. A real summary does not.
- A null summary renders the single empty line and no ring.
- The score band shows the first and last day and does not show "Score" or "30-day score". A scored day's detail is the date and the number. An empty day's detail is the date only.
