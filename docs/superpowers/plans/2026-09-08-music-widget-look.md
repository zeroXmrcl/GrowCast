# Music Widget Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold playlist FFT bins around the center and add a Player HUD look where those bars are the progress row, with Wave (today’s chrome) still selectable.

**Architecture:** Same Web Audio analyser. `foldFrequencyBins` maps bass to the middle. `musicLook` / `waveBars` persist on `audio.json` and ride the 2s program-audio poll. `ProgramAudio` publishes title + times on the graph context. `OverlayMusicWave` draws Wave (filled path) or Player (bars + tick).

**Tech Stack:** Next.js 16 App Router, React 19, Canvas 2D, Web Audio `AnalyserNode`, node:test.

**Spec:** `docs/superpowers/specs/2026-09-08-music-widget-look-design.md`

**Test runner (single file):**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/<file>.test.ts
```

Do not use `npm test -- tests/foo`. Do not commit the spec or this plan unless the user asks.

---

## File map

| File | Responsibility |
|---|---|
| `lib/program-music-wave.ts` | `parseMusicLook`, `parseWaveBars`, `foldFrequencyBins`, `playlistTrackTitle` |
| `lib/restream/audio.ts` | `musicLook`, `waveBars` on `RestreamAudio` |
| `lib/restream/program-http.ts` | Include both in program-audio JSON |
| `app/admin/actions.ts` | URL save writes look+bars; mixer preserves them |
| `components/wave-bars-input.tsx` | Bars slider 8–48 step 4 |
| `app/admin/music-panel.tsx` | Wave / Player radios + bars slider |
| `components/program-audio-graph.tsx` | title, currentTime, duration, musicLook, waveBars |
| `components/program-audio.tsx` | Parse + publish those fields |
| `components/overlay-music-wave.tsx` | Folded draw; both looks |
| Tests listed per task | |

---

### Task 1: Look / bars / fold / title helpers

**Files:**
- Modify: `lib/program-music-wave.ts`
- Modify: `tests/program-music-wave.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/program-music-wave.test.ts` (add imports):

```ts
import {
    DEFAULT_MUSIC_LOOK,
    DEFAULT_WAVE_BARS,
    WAVE_BARS_MAX,
    WAVE_BARS_MIN,
    WAVE_BARS_STEP,
    foldFrequencyBins,
    parseMusicLook,
    parseWaveBars,
    playlistTrackTitle,
} from "../lib/program-music-wave.ts";

describe("parseMusicLook", () => {
    it("defaults to player and only accepts wave or player", () => {
        assert.equal(DEFAULT_MUSIC_LOOK, "player");
        assert.equal(parseMusicLook(undefined), "player");
        assert.equal(parseMusicLook("wave"), "wave");
        assert.equal(parseMusicLook("player"), "player");
        assert.equal(parseMusicLook("eq"), "player");
        assert.equal(parseMusicLook(""), "player");
    });
});

describe("parseWaveBars", () => {
    it("defaults to 24, snaps to 4, clamps 8–48", () => {
        assert.equal(DEFAULT_WAVE_BARS, 24);
        assert.equal(WAVE_BARS_MIN, 8);
        assert.equal(WAVE_BARS_MAX, 48);
        assert.equal(WAVE_BARS_STEP, 4);
        assert.equal(parseWaveBars(undefined), 24);
        assert.equal(parseWaveBars(null), 24);
        assert.equal(parseWaveBars("wide"), 24);
        assert.equal(parseWaveBars(25), 24);
        assert.equal(parseWaveBars(7), 8);
        assert.equal(parseWaveBars(99), 48);
        assert.equal(parseWaveBars("32"), 32);
    });
});

describe("foldFrequencyBins", () => {
    it("puts left-heavy energy in the middle with symmetric wings", () => {
        const bins = new Uint8Array(16);
        bins[0] = 255;
        bins[1] = 200;
        bins[2] = 40;
        const out = foldFrequencyBins(bins, 8);
        assert.equal(out.length, 8);
        const mid = 3.5;
        // center pair higher than edges
        assert.ok(out[3] >= out[0]);
        assert.ok(out[4] >= out[7]);
        assert.equal(out[0], out[7]);
        assert.equal(out[1], out[6]);
        assert.deepEqual(foldFrequencyBins(new Uint8Array(), 8), [0, 0, 0, 0, 0, 0, 0, 0]);
    });
});

describe("playlistTrackTitle", () => {
    it("strips path, extension, and a leading track number", () => {
        assert.equal(playlistTrackTitle("01. Ambrosia Cascade.m4a"), "Ambrosia Cascade");
        assert.equal(playlistTrackTitle("12 - Bed.mp3"), "Bed");
        assert.equal(playlistTrackTitle("bed.ogg"), "bed");
        assert.equal(playlistTrackTitle("folder/01. Track.wav"), "Track");
        assert.equal(playlistTrackTitle("../x.mp3"), "x");
        assert.equal(playlistTrackTitle(""), "");
    });
});
```

Remove the unused `mid` local if the assert does not need it — do not leave unused vars.

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-music-wave.test.ts
```

Expected: FAIL (exports missing)

- [ ] **Step 3: Implement helpers**

Add to `lib/program-music-wave.ts`:

```ts
export type MusicLook = "wave" | "player";
export const DEFAULT_MUSIC_LOOK: MusicLook = "player";
export const DEFAULT_WAVE_BARS = 24;
export const WAVE_BARS_MIN = 8;
export const WAVE_BARS_MAX = 48;
export const WAVE_BARS_STEP = 4;

export function parseMusicLook(value: unknown): MusicLook {
    return value === "wave" ? "wave" : DEFAULT_MUSIC_LOOK;
}

export function parseWaveBars(value: unknown): number {
    if (value === undefined || value === null || value === "") {
        return DEFAULT_WAVE_BARS;
    }
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) {
        return DEFAULT_WAVE_BARS;
    }
    const clamped = Math.min(WAVE_BARS_MAX, Math.max(WAVE_BARS_MIN, n));
    return Math.round(clamped / WAVE_BARS_STEP) * WAVE_BARS_STEP;
}

export function foldFrequencyBins(bins: Uint8Array, barCount: number): number[] {
    const n = parseWaveBars(barCount);
    const out = new Array<number>(n).fill(0);
    if (bins.length === 0) {
        return out;
    }
    const useful = Math.max(1, Math.floor(bins.length / 2));
    const mid = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
        const dist = mid === 0 ? 0 : Math.abs(i - mid) / mid;
        const src = Math.min(useful - 1, Math.floor(dist * useful));
        out[i] = bins[src] ?? 0;
    }
    return out;
}

export function playlistTrackTitle(filename: string): string {
    const base = filename.replace(/^.*[/\\]/, "");
    const noExt = base.replace(/\.(mp3|ogg|wav|m4a)$/i, "");
    return noExt.replace(/^\d+[.\-]\s*/, "").trim();
}
```

- [ ] **Step 4: Tests pass**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-music-wave.test.ts
```

If symmetry asserts fail on odd/even `n`, fix the test to `assert.equal(out[0], out[n-1])` after implementing, not the fold (the fold must stay center=bass).

- [ ] **Step 5: Commit**

```bash
git add lib/program-music-wave.ts tests/program-music-wave.test.ts
git commit -m "feat(program): fold playlist FFT bins around the center"
```

---

### Task 2: Persist look and bars on audio.json

**Files:**
- Modify: `lib/restream/audio.ts`
- Modify: `tests/restream-audio.test.ts`
- Modify: every `writeRestreamAudio({...})` / `RestreamAudio` literal that TypeScript will reject (tests + `app/admin/actions.ts` only if you touch it here — prefer Task 3 for actions)

- [ ] **Step 1: Failing tests**

In `tests/restream-audio.test.ts` extend the defaults test:

```ts
assert.equal(EMPTY_RESTREAM_AUDIO.musicLook, "player");
assert.equal(EMPTY_RESTREAM_AUDIO.waveBars, 24);
assert.equal(parseRestreamAudio(null).musicLook, "player");
assert.equal(parseRestreamAudio({musicLook: "wave"}).musicLook, "wave");
assert.equal(parseRestreamAudio({musicLook: "eq"}).musicLook, "player");
assert.equal(parseRestreamAudio({waveBars: 25}).waveBars, 24);
assert.equal(parseRestreamAudio({waveBars: 7}).waveBars, 8);
```

Add:

```ts
it("keeps musicLook and waveBars when rewriting pause and volume", async () => {
    await withTempDataDir(async () => {
        await writeRestreamAudio({
            url: "https://radio.example/stream",
            volume: 0.4,
            paused: false,
            waveSmoothPct: 40,
            musicLook: "wave",
            waveBars: 32,
        });
        const existing = await readRestreamAudio();
        await writeRestreamAudio({
            url: existing.url,
            volume: 0.2,
            paused: true,
            waveSmoothPct: existing.waveSmoothPct,
            musicLook: existing.musicLook,
            waveBars: existing.waveBars,
        });
        const next = await readRestreamAudio();
        assert.equal(next.musicLook, "wave");
        assert.equal(next.waveBars, 32);
        assert.equal(next.waveSmoothPct, 40);
    });
});
```

Update existing `writeRestreamAudio` literals in this file to include `musicLook: "player", waveBars: 24` (or whatever the test needs). `writeRestreamAudio` re-parses, so omitted keys become defaults at runtime — still add them so the type matches.

- [ ] **Step 2: Run `tests/restream-audio.test.ts` — expect FAIL**

- [ ] **Step 3: Implement**

`lib/restream/audio.ts`:

```ts
import {parseMusicLook, parseWaveBars, parseWaveSmoothPct, type MusicLook} from "@/lib/program-music-wave";

export type RestreamAudio = {
    url: string;
    volume: number;
    paused: boolean;
    waveSmoothPct: number;
    musicLook: MusicLook;
    waveBars: number;
};

export const EMPTY_RESTREAM_AUDIO: RestreamAudio = {
    url: "",
    volume: 0.7,
    paused: false,
    waveSmoothPct: 70,
    musicLook: "player",
    waveBars: 24,
};
```

In `parseRestreamAudio` return those two via `parseMusicLook(raw.musicLook)` and `parseWaveBars(raw.waveBars)`.

Fix any other test file that constructs `RestreamAudio` objects so `npm run build` / tests still typecheck. At minimum: `tests/program-audio-http.test.ts`, `tests/restream-audio.test.ts`.

- [ ] **Step 4: Tests pass**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/restream-audio.test.ts tests/program-audio-http.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/restream/audio.ts tests/restream-audio.test.ts tests/program-audio-http.test.ts
git commit -m "feat(restream): persist music look and bar count"
```

---

### Task 3: Program-audio JSON + mixer/URL actions

**Files:**
- Modify: `lib/restream/program-http.ts`
- Modify: `components/program-audio.tsx` (`ProgramAudioBody` + `parseProgramAudioBody`)
- Modify: `app/admin/actions.ts`
- Modify: `tests/program-audio-http.test.ts`
- Modify: `tests/mixer-strip.test.ts`

- [ ] **Step 1: Failing tests**

In `tests/program-audio-http.test.ts` playlist 200 body, assert:

```ts
assert.equal(body.musicLook, "player");
assert.equal(body.waveBars, 24);
```

Add a case (or extend the smoothness one): after `writeRestreamAudio({..., musicLook: "wave", waveBars: 32})`, JSON has those values.

In `tests/mixer-strip.test.ts` URL-save wiring `it`:

```ts
assert.match(actions, /parseMusicLook\(formData.get\("musicLook"\)\)/);
assert.match(actions, /parseWaveBars\(formData.get\("waveBars"\)\)/);
assert.match(actions, /musicLook: existing\.musicLook/);
assert.match(actions, /waveBars: existing\.waveBars/);
```

- [ ] **Step 2: Run those two files — expect FAIL**

- [ ] **Step 3: Implement**

`programAudioGetResponse` JSON body adds:

```ts
musicLook: audio.musicLook,
waveBars: audio.waveBars,
```

`ProgramAudioBody` in `components/program-audio.tsx` adds `musicLook` and `waveBars`. Parse with `parseMusicLook` / `parseWaveBars`.

`saveProgramAudioAction` (mixer) spread-preserve:

```ts
await writeRestreamAudio({
    url: existing.url,
    volume,
    paused: formData.get("paused") === "on",
    waveSmoothPct: existing.waveSmoothPct,
    musicLook: existing.musicLook,
    waveBars: existing.waveBars,
});
```

`saveProgramAudioUrlAction`:

```ts
await writeRestreamAudio({
    url,
    volume: existing.volume,
    paused: existing.paused,
    waveSmoothPct: parseWaveSmoothPct(formData.get("waveSmoothPct")),
    musicLook: parseMusicLook(formData.get("musicLook")),
    waveBars: parseWaveBars(formData.get("waveBars")),
});
```

- [ ] **Step 4: Tests pass**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-audio-http.test.ts tests/mixer-strip.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/restream/program-http.ts components/program-audio.tsx app/admin/actions.ts tests/program-audio-http.test.ts tests/mixer-strip.test.ts
git commit -m "feat(program): poll music look and bar count"
```

---

### Task 4: Music rack radios + bars slider

**Files:**
- Create: `components/wave-bars-input.tsx`
- Modify: `app/admin/music-panel.tsx`
- Modify: `app/admin/stream/page.tsx` (pass `musicLook` + `waveBars`)
- Modify: `tests/mixer-strip.test.ts`

- [ ] **Step 1: Failing wiring asserts** in the existing Music panel `it`:

```ts
assert.match(page, /musicLook=\{audio\.musicLook\}/);
assert.match(page, /waveBars=\{audio\.waveBars\}/);
assert.match(panel, /name="musicLook"/);
assert.match(panel, /value="wave"/);
assert.match(panel, /value="player"/);
assert.match(panel, /WaveBarsInput/);
const bars = src(path.join("components", "wave-bars-input.tsx"));
assert.match(bars, /name="waveBars"/);
assert.match(bars, /WAVE_BARS_MIN/);
assert.match(bars, /Bars/);
```

- [ ] **Step 2: Run `tests/mixer-strip.test.ts` — expect FAIL**

- [ ] **Step 3: Implement**

Create `components/wave-bars-input.tsx` mirroring `components/wave-smooth-input.tsx`:

- client component, `defaultValue: number`
- label **Bars**, readout `{value}`
- `name="waveBars"` range min 8 max 48 step 4
- `onChange` → `parseWaveBars`

`MusicPanel` props add `musicLook` and `waveBars`. Inside the URL form, before smoothness:

```tsx
<div>
  <p className="mb-2 text-xs font-semibold uppercase text-(--admin-subtle)">Look</p>
  <label className="mr-4 text-sm">
    <input type="radio" name="musicLook" value="wave" defaultChecked={musicLook === "wave"} />
    Wave
  </label>
  <label className="text-sm">
    <input type="radio" name="musicLook" value="player" defaultChecked={musicLook !== "wave"} />
    Player
  </label>
</div>
<WaveBarsInput defaultValue={waveBars} />
```

Use existing admin radio chrome if a nearby panel already has radios (`stream-fields.tsx` label+input pattern). Keep it compact.

`stream/page.tsx`:

```tsx
<MusicPanel
    files={...}
    url={audio.url}
    waveSmoothPct={audio.waveSmoothPct}
    musicLook={audio.musicLook}
    waveBars={audio.waveBars}
/>
```

- [ ] **Step 4: Tests pass**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/mixer-strip.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add components/wave-bars-input.tsx app/admin/music-panel.tsx app/admin/stream/page.tsx tests/mixer-strip.test.ts
git commit -m "feat(admin): add Music look switch and bars slider"
```

---

### Task 5: Graph context + ProgramAudio publish

**Files:**
- Modify: `components/program-audio-graph.tsx`
- Modify: `components/program-audio.tsx`
- Modify: `tests/program-scene.test.ts`

- [ ] **Step 1: Failing source tests** in `tests/program-scene.test.ts` audio wiring `it`:

```ts
const graph = src(path.join("components", "program-audio-graph.tsx"));
assert.match(graph, /title:/);
assert.match(graph, /currentTime:/);
assert.match(graph, /duration:/);
assert.match(graph, /musicLook:/);
assert.match(graph, /waveBars:/);
assert.match(audio, /playlistTrackTitle/);
assert.match(audio, /currentTime/);
assert.match(audio, /setGraph\(/);
```

- [ ] **Step 2: Run `tests/program-scene.test.ts` — expect FAIL**

- [ ] **Step 3: Implement**

`ProgramAudioGraphState`:

```ts
import type {MusicLook} from "@/lib/program-music-wave";
import {DEFAULT_MUSIC_LOOK, DEFAULT_WAVE_BARS} from "@/lib/program-music-wave";

export type ProgramAudioGraphState = {
    active: boolean;
    analyser: AnalyserNode | null;
    title: string;
    currentTime: number;
    duration: number;
    musicLook: MusicLook;
    waveBars: number;
};
```

EMPTY: `title: ""`, `currentTime: 0`, `duration: 0`, `musicLook: DEFAULT_MUSIC_LOOK`, `waveBars: DEFAULT_WAVE_BARS`.

Every `setGraph({...})` in `program-audio.tsx` must pass **all** fields (or spread previous). When not playing:

```ts
setGraph({
    active: false,
    analyser: graphRef.current?.analyser ?? null,
    title: "",
    currentTime: 0,
    duration: 0,
    musicLook: body?.musicLook ?? DEFAULT_MUSIC_LOOK,
    waveBars: body?.waveBars ?? DEFAULT_WAVE_BARS,
});
```

When playing, after attach:

```ts
const file = body?.files[playlistIndex % Math.max(body.files.length, 1)] ?? "";
const publish = () => {
    setGraph({
        active: true,
        analyser: graph.analyser,
        title: playlistTrackTitle(file),
        currentTime: el.currentTime,
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        musicLook: body?.musicLook ?? DEFAULT_MUSIC_LOOK,
        waveBars: body?.waveBars ?? DEFAULT_WAVE_BARS,
    });
};
```

Call `publish` from `attachIfRunning` and a `window.setInterval(publish, 250)` while playing. Clear the interval on cleanup. Do **not** `setState` every rAF.

- [ ] **Step 4: Tests pass**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-scene.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add components/program-audio-graph.tsx components/program-audio.tsx tests/program-scene.test.ts
git commit -m "feat(program): publish track title and time on the audio graph"
```

---

### Task 6: Draw Wave + Player in OverlayMusicWave

**Files:**
- Modify: `components/overlay-music-wave.tsx`
- Modify: `tests/program-scene.test.ts`

- [ ] **Step 1: Failing source tests**

```ts
const wave = src(path.join("components", "overlay-music-wave.tsx"));
assert.match(wave, /foldFrequencyBins/);
assert.match(wave, /musicLook/);
assert.match(wave, /waveBars/);
assert.match(wave, /#4ade80/);
assert.match(wave, /rgba\(161, 161, 170, 0\.35\)/);
assert.match(wave, /currentTime/);
assert.match(wave, /duration/);
assert.doesNotMatch(wave, /drawMirroredWave\(canvas, bins\)/);
```

The last assert forbids plotting **raw** analyser bins. Folded values may still use a local `drawMirroredWave(canvas, folded: number[])`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement draw**

`useProgramAudioGraph()` now also has `title`, `currentTime`, `duration`, `musicLook`, `waveBars`.

In the rAF tick:

```ts
analyser.getByteFrequencyData(bins);
const folded = foldFrequencyBins(bins, waveBars);
if (musicLook === "wave") {
    drawMirroredWave(canvas, folded);
} else {
    const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : null;
    drawPlayerBars(canvas, folded, progress);
}
```

`drawMirroredWave(canvas, values: number[])` — same path as today but `values[i] / 255` (numbers, not Uint8Array).

`drawPlayerBars(canvas, values: number[], progress: number | null)`:

- `clearRect`
- bar width = `width / values.length` with a 1–2px gap
- height = `(values[i] / 255) * height` from the bottom (or from vertical center — **from bottom**, matching the mock)
- fill `#4ade80` if `progress === null || i < Math.floor(progress * values.length)` else `rgba(161, 161, 170, 0.35)`
- if `progress !== null`, 2px `#fafafa` tick at `progress * width`

Player chrome in the JSX:

```tsx
<p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Music</p>
{musicLook === "player" && title ? (
    <p className="mt-1 truncate text-sm font-semibold tracking-tight text-zinc-50">{title}</p>
) : null}
{musicLook === "player" && duration > 0 ? (
    <p className="mt-1 text-xs tabular-nums text-zinc-300">
        {formatClock(currentTime)} / {formatClock(duration)}
    </p>
) : null}
<canvas ... className="mt-1 h-14 w-full" />
```

`formatClock` local: `m:ss` with padded seconds. Unknown/negative → `0:00`.

Keep `OverlayMotionItem show={active}`.

Close over latest `musicLook` / `waveBars` / times in the rAF via refs if the effect deps would restart the loop too often: copy those fields into refs each render, rAF reads refs. Effect deps: `[active, analyser]` only.

- [ ] **Step 4: Tests pass**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-scene.test.ts tests/program-music-wave.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add components/overlay-music-wave.tsx tests/program-scene.test.ts
git commit -m "feat(overlay): draw center-fold wave and player EQ progress"
```

---

### Task 7: Full verification

- [ ] **Step 1:** `npm test` — all pass (previous 503 plus new cases). Fix failures in this task.

- [ ] **Step 2:** `npm run build` — TypeScript succeeds. Pre-existing NFT warning in `next.config.ts` is not this work.

- [ ] **Step 3:** If you changed code, commit `fix(program): music widget look verification`. If not, do not commit.

---

## Spec coverage

| Spec item | Task |
|---|---|
| Center-fold bins | 1, 6 |
| parseMusicLook / parseWaveBars | 1, 2 |
| playlistTrackTitle | 1, 5 |
| audio.json fields + mixer preserve | 2, 3 |
| program-audio JSON | 3 |
| Music rack radios + bars slider | 4 |
| Graph title/time | 5 |
| Wave vs Player draw; bars are progress | 6 |
| Unknown duration: all bright, no tick | 6 |
| Hide when not playlist-playing | unchanged `programMusicWaveActive` |
| No public overlay Music card | unchanged |
| npm test + build | 7 |
