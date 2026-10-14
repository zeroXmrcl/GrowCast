# AI Assessment widget

**Date:** 2026-10-14
**Status:** visual approved in the mockup session; spec awaiting review

The dashboard AI Assessment becomes a two-column board section. The score is a ring. The written assessment sits on the left. The day sits on the right. Motion plays once, then rests. Hover only dims the other mosaic rows.

Mockups from the session live under `.superpowers/brainstorm/` (gitignored). The approved screen is the fitted board: prose beside the day, hairline aligned with Status and Vitals.

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
| Footer | 30-day score ticks across both columns, under a top hairline. No heading |
| Title | No "AI Assessment" heading. The ring is the mark |
| Demo | When the payload is the in-memory sample, the word Demo sits beside the rating |
| Empty | Key set, nothing saved: one line, no ring and no mosaic |

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

1. Name on the left. On the right, the AI range, then the percent in range. When the verdict is `slightly_off` or `off`, the note follows the percent. `in_range` and `unknown` do not repeat the note. Percent color is `#10b981` for `in_range`, `#f59e0b` for `slightly_off`, `#ef4444` for `off`, and the muted zinc text color for `unknown`. A null percent is omitted.
2. The mosaic for that metric, full width of the column. Cells stay the real 5-minute slots (`AI_SUMMARY_MOSAIC_SLOTS`), not a downsampled mock. Colors stay grey / green / amber / red.

The rows spread to the height of the left column so the day meets the bottom of the prose.

## Footer

The existing 30-day score cells, one row, no label and no "no score" sentence. Empty days stay the neutral cell. The band is full width, with the same horizontal padding as the columns.

## Motion

Easing is `cubic-bezier(0.16, 1, 0.3, 1)`.

- Ring: the stroke draws once, 900ms, from empty to the score.
- Mosaic rows: each slides in from the left once, 520ms, staggered by 45ms per row.
- Score ticks: each grows from the center once, 480ms, staggered by 14ms per day.
- Hover, pointer over the mosaic: other rows drop to 38% opacity in 180ms. The row under the pointer stays solid. Leaving the mosaic restores every row. Hover does not move the card.
- `prefers-reduced-motion: reduce`: no draw, slide, or tick animation. Everything is visible immediately. Hover dim is instant, with no transition.

## Empty and demo

The card still renders only when `aiSummaryWidgetEnabled()` is true.

When that is true and there is no summary, the section shows one line: "No assessment yet. The daily job runs around 08:00 (Europe/Berlin)." No ring, no columns, and no mention of the API key.

Demo mode does not change this layout. The only addition is the Demo label next to the rating.

## Files

- `components/ai-summary-card.tsx` — the layout, motion, and the dropped chrome
- `tests/ai-summary-surface.test.ts` — stop requiring the heading string `AI Assessment`; require the summary, a recommendation, the mosaic, and the absence of the color-legend sentence

No change to `lib/ai-summary/public.ts`, the public route, or the admin panel.

## Tests

- A saved summary renders score, headline, summary, plant line, recommendation text, metric ranges, and a mosaic cell row.
- An `in_range` metric does not render its note. A `slightly_off` metric does.
- The legend sentence and the "24h mosaic" label are absent.
- `demo` renders the word Demo. A real summary does not.
- A null summary renders the single empty line and no ring.
