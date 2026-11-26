# Music widget look (center EQ + player chrome)

**Date:** 2026-09-08  
**Branch:** `ggs-overlay`  
**Status:** approved design, not implemented

The HUD Music card is a left-weighted frequency blob: FFT bins run left→right so bass piles on the left. v1 chrome is label + wave only. This pass **folds bins around the center** (Jarvis / voice-assistant) and adds a **Player** look where that EQ row **is** the progress bar. Today’s **Wave** card stays selectable.

Same analyser, same playlist-only rule, same smoothness slider.

---

## Non-goals

- Wave / player on stream URL / Icecast
- Now-playing on public `/overlay`
- Second `<audio>` or a pre-decoded full-track waveform
- Seeking from the overlay (display only)
- Icecast metadata titles
- Separate HUD scale for the Music card

---

## Product

| Decision | Choice |
|---|---|
| Engine | Center-fold frequency bins (bass middle, treble both wings) |
| Looks | `wave` (today’s chrome) or `player` (mini player) |
| Default look | **player** |
| Player EQ | Bars **are** the progress row: played bright, remaining dim, playhead tick |
| Default bars | **24** |
| Bars range | 8–48, step 4, Music rack slider |
| Title | Playlist filename, strip extension and leading `NN.` / `NN - ` |
| Time | `m:ss / m:ss` from the program `<audio>` |
| Smoothness | Existing `waveSmoothPct` |
| Visibility | Playlist actually playing only |

---

## Looks

**Wave** — HUD glass, label **Music**, filled mirrored path from folded bins. No title, no time, no tick. `waveBars` is the number of path samples (folded bin count used when drawing).

**Player** — HUD glass, label **Music**, title line, `elapsed / duration`, one row of `waveBars` vertical bars:

- Height from the same folded bins (center-weighted).
- Index `< floor(progress * bars)` → GrowCast green (`#4ade80`, fill ~55% glow ok).
- Remaining → dim zinc (`rgba(161,161,170,0.35)`).
- 2px tick at `progress` of the row width (`#fafafa`).

One look on the stream at a time, chosen in the Music rack.

---

## Persistence

On `data/restream/audio.json` (not grow JSON), next to `waveSmoothPct`:

| Field | Default | Parse |
|---|---|---|
| `musicLook` | `"player"` | `"wave"` or `"player"`; junk → player |
| `waveBars` | `24` | finite number → round to step 4 → clamp 8–48; junk → 24 |
| `waveSmoothPct` | `70` | unchanged |

Mixer pause/volume write **preserves** `musicLook` and `waveBars`. URL/look form writes url + smoothness + look + bars together.

Program-audio JSON includes `musicLook` and `waveBars`. `Cache-Control: no-store`. Poll 2s as today.

---

## Bin fold

`foldFrequencyBins(bins: Uint8Array): number[]`

Use the lower half of the analyser bins (the useful bass/mids). Map bin `0` to the **center**, increasing index to **both wings**. Output length is `waveBars` (resample / average). Empty input → zeros.

Never plot raw `getByteFrequencyData` left-to-right.

---

## Title

`playlistTrackTitle(filename: string): string`

1. Take the basename (no path).
2. Strip a trailing audio extension (`.mp3` `.ogg` `.wav` `.m4a`, case-insensitive).
3. Strip a leading `^\d+[\.\-]\s*` (e.g. `01. ` or `12 - `).
4. Trim. Empty → `""` (Player then omits the title line and does not duplicate the Music label).

---

## Graph context

`ProgramAudioGraphState` becomes:

```ts
{
  active: boolean;
  analyser: AnalyserNode | null;
  title: string;
  currentTime: number;
  duration: number; // NaN/0 if unknown
}
```

`ProgramAudio` sets `title` from the current playlist file, and `currentTime` / `duration` from the media element while playing. `progress = duration > 0 ? clamp(currentTime / duration, 0, 1) : null`.

If `progress` is null: Player draws all bars live-bright, **no tick**.

---

## Components

| Piece | Change |
|---|---|
| `lib/program-music-wave.ts` | `parseMusicLook`, `parseWaveBars`, `foldFrequencyBins`, `playlistTrackTitle`; keep smoothness helpers |
| `lib/restream/audio.ts` | `musicLook`, `waveBars` on the record |
| `lib/restream/program-http.ts` | Include both on program-audio JSON |
| `app/admin/actions.ts` | URL save writes look + bars + smoothness; mixer preserves them |
| `app/admin/music-panel.tsx` | Wave / Player radios; Bars slider |
| `components/wave-bars-input.tsx` | 8–48 step 4, same chrome as smoothness |
| `components/program-audio-graph.tsx` | title, currentTime, duration |
| `components/program-audio.tsx` | Publish title + times |
| `components/overlay-music-wave.tsx` | Both looks; folded bins; Player bars + tick |

Public `/overlay` still has no Music card.

---

## Errors

| Case | Behavior |
|---|---|
| Junk JSON look/bars | player / 24 |
| URL, pause, silence, failed graph | Hide card |
| Unknown duration | Title + all-bright bars, no tick |
| Empty title after strip | No title line |
| Empty bins | Flat zeros |

---

## Tests

- `foldFrequencyBins` on a left-heavy input peaks in the middle and is roughly symmetric
- `playlistTrackTitle("01. Ambrosia Cascade.m4a")` → `Ambrosia Cascade`; `"bed.ogg"` → `bed`; `"../x.mp3"` does not keep a path
- `parseWaveBars`: default 24; 25 → 24; 7 → 8; 99 → 48
- `parseMusicLook`: junk → player; `"wave"` stays wave
- Program-audio JSON includes `musicLook` and `waveBars`
- Mixer pause/volume preserves both
- Music panel source: radios `musicLook`, name `waveBars`
- OverlayMusicWave: `foldFrequencyBins`, both looks, no left-to-right raw plot
- `npm test` and `npm run build`

---

## Implementation notes

v1 of this spec is one pass. Do not add seeking, Icecast, or a second visualizer graph.
