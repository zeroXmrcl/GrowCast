# GrowCast climate history dialog

**Date:** 2026-10-13
**Status:** approved in conversation

Past temperature, humidity, and VPD on the dashboard. A History button on the Climate card opens a dialog over the board. The board does not change height. The points are already on disk when someone visits.

## Goals

- Open past climate from the Climate card without moving the dashboard.
- Show temperature, humidity, and VPD together, with the same range chips as the watts graph.
- Have the series ready on page load. Opening History does not call Spider Farmer.
- Fill the past from Spider Farmer’s history charts, then keep recording from the live readings GrowCast already receives.

## Non-goals

- A chart on the stream overlay, the energy page, or `/grows/[archiveId]`
- A climate archive the visitor can download
- Putting Spider Farmer credentials in the Next.js process or the browser
- Replacing the live snapshot file with a series
- A new chart library. The plot is inline SVG, same step-line language as the watts graph
- A `?window=` query on the dashboard URL

## Product lock

| Topic | Decision |
|---|---|
| Where | Dashboard Climate card only |
| Who | Anyone who can already see the live climate numbers |
| Sensor | The control box `climateMetrics` already uses |
| Open | History button on the Climate heading |
| Surface | Dialog centered on the board. The board dims and stays put |
| Ranges | 24h, 7 days, 30 days, This grow |
| Default chip | 24h. Chip choice is client state. Refresh returns to 24h |
| Ready on visit | Dashboard render includes the four windows from day files |

## Storage

Day files live under the GrowCast data directory, parallel to energy:

`data/climate/current/YYYY-MM-DD.json`

The date is the Europe/Berlin date of the points inside the file.

```json
{
  "date": "2026-10-13",
  "points": [
    { "t": "2026-10-13T13:37:00.000Z", "tempC": 24.8, "humidityPct": 61.4, "vpd": 1.18 }
  ]
}
```

`t` is UTC ISO. `tempC`, `humidityPct`, and `vpd` are finite numbers. Points are sorted by `t`. A write with an existing `t` replaces that point.

The live snapshot in `data/mesh/growcast.ggs.json` stays one current reading.

## Write paths

**Cloud pull.** The sidecar already holds the Spider Farmer login. When the sidecar process starts, and again after it reconnects, it reads that account’s history charts for the control box and posts the points to GrowCast. While the sidecar is connected, it does not poll history on a timer. New points come from the live writer.

The post uses the existing mesh bearer token. The body is the normalized points only. The password never leaves the sidecar.

Temperature and humidity are paired when they share a timestamp. If the charts use different timestamps, samples in the same UTC minute are paired. VPD is the cloud value when that value is finite, otherwise `airVpdKPa(tempC, humidityPct)`. A minute with no temperature or no humidity is dropped.

If the cloud returns a shorter range than the grow, the saved days are whatever came back. This grow still slices the days on disk. It does not invent days the cloud never sent and the live writer never recorded.

**Live writer.** Saving an accepted live snapshot also writes one climate point. The point uses `climateMetrics` for that snapshot, so the stored VPD matches the card, and `updatedAt` as `t`. A snapshot whose metrics are missing temperature, humidity, or VPD writes nothing.

## Read path

Rendering the dashboard reads the day files and attaches four windows to the page. The dialog reads those windows. It does not fetch on open, and an already-open dialog does not poll. A reload sees points written after the last render.

Windows use `Europe/Berlin`, same as energy.

| Chip | Domain | Line |
|---|---|---|
| 24h | now − 24h → now | Every stored point in the span. The line does not extend past now |
| 7 days | midnight six days ago → now | One average per six civil hours |
| 30 days | today plus the previous 29 Berlin dates | One average per date |
| This grow | Berlin date of `seededAt` through today | One average per date |

A bucket with no points is a gap. The step line stops and resumes. It is not drawn as zero.

This grow is omitted when `seededAt` is not a date-only value, and when it is `2001-01-01`.

Min, avg, and max are taken from the stored points in the selected window, not from the averaged buckets. Temperature is one decimal with `°`, humidity is one decimal with `%`, VPD is two decimals. Those are the same formats as the Climate card.

## Dialog

The History control sits on the Climate heading, opposite the title. It uses the watts-graph chip: outlined when closed, filled when open.

The dialog is positioned over the board. The board’s height does not change. A dim layer covers the board. The dialog scales from 0.96 to 1 with its origin at the center of the History button, 360ms, `cubic-bezier(0.16, 1, 0.3, 1)`. The dim fades in over 220ms with the same ease. Closing reverses in 160ms with `cubic-bezier(0.4, 0, 1, 1)`.

Inside the dialog:

- Title “Past climate”
- Chips: 24h, 7 days, 30 days, and This grow when that range exists
- Close, and a click on the dim layer, both dismiss it
- One row per metric. The value is the last stored point in the selected window, formatted like the Climate card. Under it: min – max, then avg, from the stored points in that window
- Three stacked step plots, each with its own scale. Temperature uses the foreground color, humidity a muted zinc, VPD `#ea580c`
- Hairline grid, 10px axis labels, and the watts-graph column tooltip: time and the formatted value
- Shared time axis under the stack

When the selected window has no points, the dialog stays open and shows “No climate history yet”. No line is drawn.

## Archive

Completing a grow copies the climate day files into `data/archives/{archiveId}/climate.json` in the same staging step as `energy.json`. The payload is `{ version: 1, growId, startedAt, endedAt, days }` where each day is the day-file body. `endedAt` is the completion time. `startedAt` is `seededAt` when This grow would be shown, otherwise the timestamp of the earliest saved point.

A failed copy leaves `data/climate/current/` in place. A grow with no climate files still completes. This work does not add a chart to the past-grow page. The file is kept so the days are not discarded.

## Failure

A failed cloud pull does not change day files. The live writer keeps going if live snapshots are still arriving. The dialog shows the saved points.

A live snapshot that is stale can still be charted up to its last good point. Stale does not hide history.

The browser payload is the window series and the stats. It does not include the Spider Farmer login, MQTT secrets, or device serials.

## Tests

- A second write with the same `t` replaces the point. A new `t` is kept.
- A live snapshot with all three metrics appends a point. A snapshot missing any of the three does not.
- 24h returns the stored points in that span and nothing after now.
- 7 days, 30 days, and This grow use the step sizes in the table above. Empty buckets are gaps, not zeros.
- This grow is omitted for a missing `seededAt` and for `2001-01-01`.
- A failed pull leaves the day file bytes unchanged.
- A successful archive contains the days. A failed copy leaves the current files in place.
- History opens the dialog. The board’s height is unchanged. Empty history shows “No climate history yet” and no line.

## Units

| Unit | Does | Depends on |
|---|---|---|
| Sidecar history pull | Reads Spider Farmer history and posts points | Existing sidecar login |
| Climate day store | Merges points into the day file for that Berlin date | Data directory |
| Live writer | Appends one point from `climateMetrics` when a live snapshot is saved | Live ingest, day store |
| Window reader | Builds the four windows and stats for the dashboard | Day files, `seededAt` |
| History dialog | Shows the preloaded windows | Window reader output, Climate card |
