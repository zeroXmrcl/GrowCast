# Program playlist music wave (HUD card)

**Date:** 2026-09-08  
**Branch:** `ggs-overlay`  
**Status:** approved design, not implemented

The 1080p program scene plays playlist files from a hidden `<audio>` with no on-stream cue that music is moving. v1 adds a **mirrored GrowCast-green waveform** in a **Music** glass card on the HUD, analysed from that same element so Twitch picture and sound stay together.

Playlist files only. No Icecast/URL visualizer.

---

## Non-goals

- Wave on stream URL / Icecast (CORS; zeros)
- Separate wave scale slider (HUD scale already covers the card)
- Now-playing filename on the overlay
- Pre-decoded full-track waveform
- Shared sample clock between booth and capture
- Wave on public `/overlay`
- Second `<audio>` for the visualizer

---

## Product

| Decision | Choice |
|---|---|
| Look | Mirrored filled waveform, GrowCast green (`#4ade80` fill ~55%, `#22c55e` stroke) |
| Chrome | HUD glass card, label **Music**, same `OVERLAY_PANEL_CLASS` as climate/energy |
| Placement | Last tile in the HUD (after energy). Left-rail column or bottom-bar row |
| Visibility | Only while a local playlist file is **actually playing** |
| Scale | HUD `overlayScalePct` only |
| Sync | Same Chromium `<audio>` that Pulse records |
| Smoothness | `AnalyserNode.smoothingTimeConstant`, Music rack slider, live |

Hide the card (rail packs up) when: paused, kind is `url` or `silence`, empty `src`, playback error, or `AudioContext` stays suspended.

---

## Smoothness

Mirrored wave is drawn from **frequency** bins (`getByteFrequencyData`), not raw oscilloscope samples. The analyser’s `smoothingTimeConstant` (0–1) is a moving average of those bins: **0** is twitchy, **higher** is slower / less sharp. MDN default is 0.8. Value **1** freezes the picture — never persist 1.

| Setting | Value |
|---|---|
| Field | `waveSmoothPct` on `data/restream/audio.json` (not grow JSON) |
| UI | Music rack range, label **Wave smoothness**, 0–100, step 5 |
| Default | **70** (0.70) |
| Apply | `analyser.smoothingTimeConstant = min(0.95, pct / 100)` |
| Live | Include `waveSmoothPct` on the existing 2s program-audio JSON; `ProgramAudio` writes it onto the analyser |

Junk / missing → 70. Same snap/clamp pattern as overlay scale (min 0, max 100, step 5).

---

## Audio graph

`ProgramAudio` owns the one `<audio>`. On first playlist play, **once**:

`AudioContext` → `createMediaElementSource(audio)` → `AnalyserNode` → `destination`

Must connect **destination** or Pulse/Twitch goes silent. Never call `createMediaElementSource` twice on the same element. `audioContext.resume()` on play; if it stays suspended, `active` stays false (no card).

Analyser: `fftSize` 256 (128 bins — enough for a short HUD card). Time-domain APIs unused.

`ProgramScene` wraps a small React context. `ProgramAudio` publishes `{active, analyser}`. `OverlayMusicWave` rAF-reads bins while `active`, draws a mirrored filled path (bins as magnitudes above and below the midline).

Booth preview and capture each have their own graph. That is enough: capture paints what it hears.

---

## Components

| Piece | Change |
|---|---|
| `lib/program-music-wave.ts` | `programMusicWaveActive({kind, paused, src})`, `parseWaveSmoothPct`, `waveSmoothTimeConstant(pct)` |
| `lib/restream/audio.ts` | `waveSmoothPct` on `RestreamAudio` |
| `lib/restream/program-http.ts` | Include `waveSmoothPct` in program-audio JSON |
| `lib/overlay-motion.ts` | `OVERLAY_ORDER_MUSIC = 4` (after energy) |
| `components/program-audio.tsx` | Graph once; context; apply smoothness from poll |
| `components/overlay-music-wave.tsx` | Card + canvas; render only if `active` |
| `components/overlay-hud.tsx` | Optional `extra` slot in the rail after energy |
| `components/program-scene.tsx` | Provider, pass wave as `extra`, keep `ProgramAudio` |
| `app/admin/music-panel.tsx` | Smoothness slider (needs current audio record) |
| `app/admin/actions.ts` | Persist `waveSmoothPct` on the URL-save form **or** a tiny dedicated save — keep volume/pause on the mixer. Prefer the Music URL form so mixer stays play/volume/alert. Hidden `waveSmoothPct` must not wipe URL; include the slider on the existing URL form and write url + smoothness together. Mixer `saveProgramAudioAction` must **preserve** `waveSmoothPct` when writing pause/volume. |
| Public `/overlay` | Does not pass `extra`; no `ProgramAudio` |

---

## Errors

- Second `createMediaElementSource` → don’t; reuse the first
- Context suspended → no card
- Playlist error / URL fallback → no card
- Smoothness poll fail → last good pct (start 70)
- Public overlay never loads the wave

---

## Tests

- `programMusicWaveActive`: true only for `playlist` + not paused + non-empty src; false for url, silence, paused, empty src
- `parseWaveSmoothPct`: default 70; 77 → 75; −1 → 0; 999 → 100
- `waveSmoothTimeConstant(100) === 0.95`; `waveSmoothTimeConstant(70) === 0.7`
- Program-audio JSON includes `waveSmoothPct`
- Mixer pause/volume write preserves `waveSmoothPct`
- OverlayHud source has `extra`; overlay page does not pass it
- ProgramScene passes `OverlayMusicWave`; ProgramAudio matches `createMediaElementSource`, `AnalyserNode`, `destination`, `smoothingTimeConstant`
- Public overlay still has no `ProgramAudio` / `OverlayMusicWave`
- `OVERLAY_ORDER_MUSIC === 4`
- `npm test` and `npm run build`
