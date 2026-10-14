# Program Playlist Music Wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a mirrored GrowCast-green music wave in a HUD Music card on the program scene, analysed from the same playlist `<audio>` Chromium is playing, with a live smoothness slider.

**Architecture:** `ProgramAudio` builds one Web Audio graph (`media → analyser → destination`) and publishes `{active, analyser}` through a React context. `OverlayMusicWave` draws frequency bins as a mirrored filled path inside a HUD glass card. Public `/overlay` does not mount it. Smoothness is `analyser.smoothingTimeConstant` from `audio.json`.

**Tech Stack:** Next.js 16 App Router, React 19, Web Audio `AnalyserNode`, node:test.

**Spec:** `docs/superpowers/specs/2026-09-08-program-music-wave-design.md`

**Test runner (single file):**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/<file>.test.ts
```

Do not use `npm test -- tests/foo`.

---

## File map

| File | Responsibility |
|---|---|
| `lib/program-music-wave.ts` | `programMusicWaveActive`, `parseWaveSmoothPct`, `waveSmoothTimeConstant` |
| `lib/restream/audio.ts` | `waveSmoothPct` on `audio.json` |
| `lib/restream/program-http.ts` | Include `waveSmoothPct` in program-audio JSON |
| `lib/overlay-motion.ts` | `OVERLAY_ORDER_MUSIC = 4` |
| `components/program-audio-graph.tsx` | React context for `{active, analyser, setGraph}` |
| `components/program-audio.tsx` | Graph once; publish active; apply smoothness |
| `components/overlay-music-wave.tsx` | Music card + canvas |
| `components/overlay-hud.tsx` | Optional `extra` after energy |
| `components/program-scene.tsx` | Provider, extra wave, ProgramAudio |
| `components/wave-smooth-input.tsx` | Music-rack slider 0–100 |
| `app/admin/music-panel.tsx` | Slider on the URL form |
| `app/admin/stream/page.tsx` | Pass `waveSmoothPct` |
| `app/admin/actions.ts` | Persist on URL save; mixer preserves it |

---

### Task 1: Wave helpers

**Files:**
- Create: `lib/program-music-wave.ts`
- Create: `tests/program-music-wave.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/program-music-wave.test.ts`:

```ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    DEFAULT_WAVE_SMOOTH_PCT,
    WAVE_SMOOTH_MAX,
    WAVE_SMOOTH_MIN,
    WAVE_SMOOTH_STEP,
    parseWaveSmoothPct,
    programMusicWaveActive,
    waveSmoothTimeConstant,
} from "../lib/program-music-wave.ts";

describe("programMusicWaveActive", () => {
    it("is true only while a local playlist file is playing", () => {
        assert.equal(
            programMusicWaveActive({kind: "playlist", paused: false, src: "/api/overlay/music/a.mp3"}),
            true,
        );
        assert.equal(
            programMusicWaveActive({kind: "playlist", paused: true, src: "/api/overlay/music/a.mp3"}),
            false,
        );
        assert.equal(
            programMusicWaveActive({kind: "playlist", paused: false, src: ""}),
            false,
        );
        assert.equal(
            programMusicWaveActive({kind: "url", paused: false, src: "https://radio.example/stream"}),
            false,
        );
        assert.equal(
            programMusicWaveActive({kind: "silence", paused: false, src: ""}),
            false,
        );
    });
});

describe("parseWaveSmoothPct", () => {
    it("defaults to 70, snaps to 5, clamps 0–100", () => {
        assert.equal(DEFAULT_WAVE_SMOOTH_PCT, 70);
        assert.equal(WAVE_SMOOTH_MIN, 0);
        assert.equal(WAVE_SMOOTH_MAX, 100);
        assert.equal(WAVE_SMOOTH_STEP, 5);
        assert.equal(parseWaveSmoothPct(undefined), 70);
        assert.equal(parseWaveSmoothPct(null), 70);
        assert.equal(parseWaveSmoothPct(""), 70);
        assert.equal(parseWaveSmoothPct("wide"), 70);
        assert.equal(parseWaveSmoothPct(77), 75);
        assert.equal(parseWaveSmoothPct(-1), 0);
        assert.equal(parseWaveSmoothPct(999), 100);
        assert.equal(parseWaveSmoothPct(70), 70);
    });
});

describe("waveSmoothTimeConstant", () => {
    it("maps percent to analyser smoothing and never reaches 1", () => {
        assert.equal(waveSmoothTimeConstant(70), 0.7);
        assert.equal(waveSmoothTimeConstant(0), 0);
        assert.equal(waveSmoothTimeConstant(100), 0.95);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/program-music-wave.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `lib/program-music-wave.ts`:

```ts
export const DEFAULT_WAVE_SMOOTH_PCT = 70;
export const WAVE_SMOOTH_MIN = 0;
export const WAVE_SMOOTH_MAX = 100;
export const WAVE_SMOOTH_STEP = 5;
export const WAVE_SMOOTH_TIME_CONSTANT_MAX = 0.95;

export type ProgramMusicWaveKind = "url" | "playlist" | "silence";

export function programMusicWaveActive(input: {
    kind: ProgramMusicWaveKind;
    paused: boolean;
    src: string;
}): boolean {
    return input.kind === "playlist" && !input.paused && input.src.trim().length > 0;
}

export function parseWaveSmoothPct(value: unknown): number {
    if (value === undefined || value === null || value === "") {
        return DEFAULT_WAVE_SMOOTH_PCT;
    }
    const n = typeof value === "number" ? value : Number(String(value).trim());
    if (!Number.isFinite(n)) {
        return DEFAULT_WAVE_SMOOTH_PCT;
    }
    const clamped = Math.min(WAVE_SMOOTH_MAX, Math.max(WAVE_SMOOTH_MIN, n));
    return Math.round(clamped / WAVE_SMOOTH_STEP) * WAVE_SMOOTH_STEP;
}

export function waveSmoothTimeConstant(pct: number): number {
    return Math.min(WAVE_SMOOTH_TIME_CONSTANT_MAX, parseWaveSmoothPct(pct) / 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/program-music-wave.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/program-music-wave.ts tests/program-music-wave.test.ts
git commit -m "$(cat <<'EOF'
feat(program): add playlist music-wave helpers

Active only while a local file is playing. Smoothness 0–100 maps to analyser time-constant, never 1.
EOF
)"
```

---

### Task 2: Persist `waveSmoothPct` on audio.json

**Files:**
- Modify: `lib/restream/audio.ts`
- Modify: `app/admin/actions.ts`
- Test: `tests/restream-audio.test.ts`
- Modify: `tests/program-audio-http.test.ts` (literals)

- [ ] **Step 1: Write the failing test**

In `tests/restream-audio.test.ts`, extend parse defaults and round-trip:

```ts
        assert.equal(EMPTY_RESTREAM_AUDIO.waveSmoothPct, 70);
        assert.equal(parseRestreamAudio(null).waveSmoothPct, 70);
        assert.equal(parseRestreamAudio({waveSmoothPct: 77}).waveSmoothPct, 75);
```

In the round-trip test, after write `{url: "", volume: 0.62, paused: true, waveSmoothPct: 40}` assert `audio.waveSmoothPct === 40`.

Add:

```ts
    it("keeps waveSmoothPct when rewriting pause and volume", async () => {
        await withTempDataDir(async () => {
            await writeRestreamAudio({
                url: "https://radio.example/stream",
                volume: 0.4,
                paused: false,
                waveSmoothPct: 40,
            });
            const existing = await readRestreamAudio();
            await writeRestreamAudio({
                url: existing.url,
                volume: 0.2,
                paused: true,
                waveSmoothPct: existing.waveSmoothPct,
            });
            const next = await readRestreamAudio();
            assert.equal(next.paused, true);
            assert.equal(next.volume, 0.2);
            assert.equal(next.waveSmoothPct, 40);
            assert.equal(next.url, "https://radio.example/stream");
        });
    });
```

Update `resolveAudioSource` literals to include `waveSmoothPct: 70`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/restream-audio.test.ts`

Expected: FAIL — `waveSmoothPct` undefined.

- [ ] **Step 3: Write minimal implementation**

`lib/restream/audio.ts`:

```ts
import {parseWaveSmoothPct} from "@/lib/program-music-wave";

export type RestreamAudio = {
    url: string;
    volume: number;
    paused: boolean;
    waveSmoothPct: number;
};

export const EMPTY_RESTREAM_AUDIO: RestreamAudio = {
    url: "",
    volume: 0.7,
    paused: false,
    waveSmoothPct: 70,
};
```

In `parseRestreamAudio` return add `waveSmoothPct: parseWaveSmoothPct(raw.waveSmoothPct)` (and on the EMPTY path it already has 70).

`app/admin/actions.ts` `saveProgramAudioAction`:

```ts
        await writeRestreamAudio({
            url: existing.url,
            volume,
            paused: formData.get("paused") === "on",
            waveSmoothPct: existing.waveSmoothPct,
        });
```

`saveProgramAudioUrlAction`:

```ts
        await writeRestreamAudio({
            url,
            volume: existing.volume,
            paused: existing.paused,
            waveSmoothPct: parseWaveSmoothPct(formData.get("waveSmoothPct")),
        });
```

Import `parseWaveSmoothPct` from `@/lib/program-music-wave`.

Add `waveSmoothPct: 70` to every `writeRestreamAudio({...})` in `tests/program-audio-http.test.ts` and remaining restream-audio writes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/restream-audio.test.ts tests/program-audio-http.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/restream/audio.ts app/admin/actions.ts tests/restream-audio.test.ts tests/program-audio-http.test.ts
git commit -m "$(cat <<'EOF'
feat(program): persist wave smoothness on audio.json

Mixer pause/volume keeps the field. URL save writes the slider. Default 70.
EOF
)"
```

---

### Task 3: Expose `waveSmoothPct` on program-audio JSON

**Files:**
- Modify: `lib/restream/program-http.ts`
- Modify: `tests/program-audio-http.test.ts`

- [ ] **Step 1: Write the failing test**

In the first `programAudioGetResponse` success body, add `waveSmoothPct: number` to the cast and `assert.equal(body.waveSmoothPct, 70)`.

Add a case:

```ts
    it("includes waveSmoothPct from audio.json, default 70", async () => {
        await withTempDataDir(async () => {
            const missing = await programAudioGetResponse(
                new Request("http://local/api/overlay/program-audio"),
                {admin: true},
            );
            const missingBody = (await missing.json()) as {waveSmoothPct: number};
            assert.equal(missingBody.waveSmoothPct, 70);

            await writeRestreamAudio({
                url: "",
                volume: 0.5,
                paused: false,
                waveSmoothPct: 40,
            });
            const scaled = await programAudioGetResponse(
                new Request("http://local/api/overlay/program-audio"),
                {admin: true},
            );
            const scaledBody = (await scaled.json()) as {waveSmoothPct: number};
            assert.equal(scaledBody.waveSmoothPct, 40);
        });
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/program-audio-http.test.ts`

Expected: FAIL — `waveSmoothPct` undefined on JSON.

- [ ] **Step 3: Write minimal implementation**

In `programAudioGetResponse` JSON body add `waveSmoothPct: audio.waveSmoothPct`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/program-audio-http.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/restream/program-http.ts tests/program-audio-http.test.ts
git commit -m "$(cat <<'EOF'
feat(program): include waveSmoothPct on program-audio JSON

Capture can apply analyser smoothing without a sidecar restart.
EOF
)"
```

---

### Task 4: HUD extra slot and motion order

**Files:**
- Modify: `lib/overlay-motion.ts`
- Modify: `components/overlay-hud.tsx`
- Test: `tests/overlay-motion.test.ts`
- Test: `tests/overlay-chrome.test.ts`
- Test: `tests/program-scene.test.ts` (later scene still without wave — only HUD extra here)

- [ ] **Step 1: Write the failing tests**

`tests/overlay-motion.test.ts` — import `OVERLAY_ORDER_MUSIC` and change the order array to `[0, 1, 2, 3, 4]` including `OVERLAY_ORDER_MUSIC`.

`tests/overlay-chrome.test.ts` — in “does not load program audio or alerts…”, also `assert.doesNotMatch(overlay, /OverlayMusicWave/);` and `assert.doesNotMatch(overlay, /extra=/);`

Add to overlay chrome HUD test (the OverlayHud file):

```ts
        const hudSrc = readFileSync(path.join(process.cwd(), "components", "overlay-hud.tsx"), "utf8");
        assert.match(hudSrc, /extra\?:/);
        assert.match(hudSrc, /OVERLAY_ORDER_MUSIC/);
```

Put that in the existing “embeds the grow stream” test or the watermark-adjacent HUD read — add to “embeds the grow stream only when overlayStream is include” after `assert.match(hudSrc, /overlayScalePct/);`:

```ts
        assert.match(hudSrc, /extra\?:/);
        assert.match(hudSrc, /\{extra\}/);
        assert.doesNotMatch(hudSrc, /OVERLAY_ORDER_MUSIC/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-motion.test.ts tests/overlay-chrome.test.ts`

Expected: FAIL — `OVERLAY_ORDER_MUSIC` missing; no `extra`.

- [ ] **Step 3: Write minimal implementation**

`lib/overlay-motion.ts` add:

```ts
export const OVERLAY_ORDER_MUSIC = 4;
```

`components/overlay-hud.tsx`:

- Import `type ReactNode` from react
- Props: `extra?: ReactNode` on the component (add to the `OverlayGrowView & {lockStream?: boolean; extra?: ReactNode}`)
- After the energy `OverlayMotionItem`, before `</OverlayShell>`:

```tsx
            {extra}
```

Do **not** wrap `extra` in another motion item here — `OverlayMusicWave` owns `show={active}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-motion.test.ts tests/overlay-chrome.test.ts`

Expected: PASS. OverlayHud still compiles; `extra` is optional so `/overlay` is unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/overlay-motion.ts components/overlay-hud.tsx tests/overlay-motion.test.ts tests/overlay-chrome.test.ts
git commit -m "$(cat <<'EOF'
feat(overlay): add HUD extra slot after energy

Program scene will pass the music wave. Public overlay does not.
EOF
)"
```

---

### Task 5: Graph context, ProgramAudio, wave card, ProgramScene

**Files:**
- Create: `components/program-audio-graph.tsx`
- Create: `components/overlay-music-wave.tsx`
- Modify: `components/program-audio.tsx`
- Modify: `components/program-scene.tsx`
- Test: `tests/program-scene.test.ts`
- Test: `tests/program-audio-http.test.ts` (client wiring)

- [ ] **Step 1: Write the failing tests**

In `tests/program-scene.test.ts` add (or extend the shared-scene test):

```ts
        assert.match(scene, /ProgramAudioGraphProvider/);
        assert.match(scene, /OverlayMusicWave/);
        assert.match(scene, /extra=\{/);
        const wave = src(path.join("components", "overlay-music-wave.tsx"));
        assert.match(wave, /OVERLAY_PANEL_CLASS/);
        assert.match(wave, />Music</);
        assert.match(wave, /getByteFrequencyData/);
        assert.match(wave, /#22c55e/);
        assert.match(wave, /rgba\(74, 222, 128, 0\.55\)|#4ade80/);
        assert.match(wave, /OVERLAY_ORDER_MUSIC/);
        const audio = src(path.join("components", "program-audio.tsx"));
        assert.match(audio, /createMediaElementSource/);
        assert.match(audio, /createAnalyser/);
        assert.match(audio, /destination/);
        assert.match(audio, /smoothingTimeConstant/);
        assert.match(audio, /programMusicWaveActive/);
        assert.match(audio, /fftSize/);
        assert.match(audio, /256/);
        const overlayPage = src(path.join("app", "overlay", "page.tsx"));
        assert.doesNotMatch(overlayPage, /OverlayMusicWave/);
        assert.doesNotMatch(overlayPage, /extra=/);
```

In `tests/program-audio-http.test.ts` program-audio wiring test, add:

```ts
        assert.match(client, /waveSmoothPct/);
        assert.match(client, /createMediaElementSource/);
        assert.match(http, /waveSmoothPct/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/program-scene.test.ts tests/program-audio-http.test.ts`

Expected: FAIL — no `OverlayMusicWave` / `createMediaElementSource`.

- [ ] **Step 3: Write minimal implementation**

Create `components/program-audio-graph.tsx`:

```tsx
"use client";

import {createContext, useContext, useMemo, useState, type ReactNode} from "react";

export type ProgramAudioGraphState = {
    active: boolean;
    analyser: AnalyserNode | null;
};

const EMPTY: ProgramAudioGraphState = {active: false, analyser: null};

const ProgramAudioGraphContext = createContext<
    ProgramAudioGraphState & {setGraph: (next: ProgramAudioGraphState) => void}
>({
    ...EMPTY,
    setGraph: () => undefined,
});

export function ProgramAudioGraphProvider({children}: {children: ReactNode}) {
    const [graph, setGraph] = useState<ProgramAudioGraphState>(EMPTY);
    const value = useMemo(() => ({...graph, setGraph}), [graph]);
    return (
        <ProgramAudioGraphContext.Provider value={value}>{children}</ProgramAudioGraphContext.Provider>
    );
}

export function useProgramAudioGraph(): ProgramAudioGraphState & {
    setGraph: (next: ProgramAudioGraphState) => void;
} {
    return useContext(ProgramAudioGraphContext);
}
```

Create `components/overlay-music-wave.tsx`:

```tsx
"use client";

import {useEffect, useRef} from "react";
import OverlayMotionItem from "@/components/overlay-motion-item";
import {OVERLAY_PANEL_CLASS} from "@/components/overlay-shell";
import {useProgramAudioGraph} from "@/components/program-audio-graph";
import type {OverlayLayout} from "@/lib/overlay-layout";
import {OVERLAY_ORDER_MUSIC} from "@/lib/overlay-motion";

function drawMirroredWave(canvas: HTMLCanvasElement, bins: Uint8Array): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const mid = height / 2;
    const count = bins.length;
    if (count < 2) {
        return;
    }
    ctx.beginPath();
    ctx.moveTo(0, mid);
    for (let i = 0; i < count; i++) {
        const x = (i / (count - 1)) * width;
        const mag = (bins[i] / 255) * mid;
        ctx.lineTo(x, mid - mag);
    }
    for (let i = count - 1; i >= 0; i--) {
        const x = (i / (count - 1)) * width;
        const mag = (bins[i] / 255) * mid;
        ctx.lineTo(x, mid + mag);
    }
    ctx.closePath();
    ctx.fillStyle = "rgba(74, 222, 128, 0.55)";
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
}

export default function OverlayMusicWave({layout}: {layout: OverlayLayout}) {
    const {active, analyser} = useProgramAudioGraph();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!active || !analyser) {
            return;
        }
        const bins = new Uint8Array(analyser.frequencyBinCount);
        let frame = 0;
        function tick() {
            const canvas = canvasRef.current;
            if (canvas && analyser) {
                analyser.getByteFrequencyData(bins);
                drawMirroredWave(canvas, bins);
            }
            frame = window.requestAnimationFrame(tick);
        }
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [active, analyser]);

    return (
        <OverlayMotionItem show={active} order={OVERLAY_ORDER_MUSIC} layout={layout}>
            <section className={OVERLAY_PANEL_CLASS}>
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Music</p>
                <canvas
                    ref={canvasRef}
                    width={280}
                    height={56}
                    className="mt-1 h-14 w-full"
                    aria-hidden="true"
                />
            </section>
        </OverlayMotionItem>
    );
}
```

`components/program-audio.tsx` changes (keep existing poll, sting, src logic):

- Import `programMusicWaveActive`, `parseWaveSmoothPct`, `waveSmoothTimeConstant`, `DEFAULT_WAVE_SMOOTH_PCT` from `@/lib/program-music-wave`
- Import `useProgramAudioGraph` from `@/components/program-audio-graph`
- Add `waveSmoothPct: number` to `ProgramAudioBody` and parse it with `parseWaveSmoothPct(body.waveSmoothPct)` (always a number; if missing, parser returns 70)
- `const {setGraph} = useProgramAudioGraph();`
- `const graphRef = useRef<{context: AudioContext; source: MediaElementAudioSourceNode; analyser: AnalyserNode} | null>(null);`
- After volume/play effect, add:

```ts
    useEffect(() => {
        const el = audioRef.current;
        const playing = programMusicWaveActive({kind, paused: body?.paused ?? true, src});
        if (!el || !playing) {
            setGraph({active: false, analyser: graphRef.current?.analyser ?? null});
            return;
        }
        if (!graphRef.current) {
            const context = new AudioContext();
            const source = context.createMediaElementSource(el);
            const analyser = context.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyser.connect(context.destination);
            graphRef.current = {context, source, analyser};
        }
        const graph = graphRef.current;
        graph.analyser.smoothingTimeConstant = waveSmoothTimeConstant(
            body?.waveSmoothPct ?? DEFAULT_WAVE_SMOOTH_PCT,
        );
        void graph.context.resume().then(() => {
            if (graph.context.state === "running") {
                setGraph({active: true, analyser: graph.analyser});
                return;
            }
            setGraph({active: false, analyser: graph.analyser});
        });
    }, [kind, src, body?.paused, body?.waveSmoothPct, setGraph]);
```

If `setGraph` is unstable, wrap it in `useCallback` in the provider (already via useState setter — **pass `setGraph` from context**; `useState` setter is stable, but the context value’s `setGraph` is the same function if you put `setGraph` from useState directly in the provider instead of wrapping in useMemo with a new object every time).

Fix the provider so `setGraph` is the `useState` dispatcher:

```tsx
export function ProgramAudioGraphProvider({children}: {children: ReactNode}) {
    const [graph, setGraph] = useState<ProgramAudioGraphState>(EMPTY);
    const value = useMemo(
        () => ({active: graph.active, analyser: graph.analyser, setGraph}),
        [graph],
    );
    return (
        <ProgramAudioGraphContext.Provider value={value}>{children}</ProgramAudioGraphContext.Provider>
    );
}
```

`setGraph` from `useState` is stable.

`components/program-scene.tsx`:

```tsx
import OverlayAlertLayer from "@/components/overlay-alert-layer";
import OverlayHud from "@/components/overlay-hud";
import OverlayMusicWave from "@/components/overlay-music-wave";
import ProgramAudio from "@/components/program-audio";
import {ProgramAudioGraphProvider} from "@/components/program-audio-graph";
import type {OverlayGrowView} from "@/lib/overlay-grow";

export default function ProgramScene({
    plant,
    name,
    seededAt,
    overlayLayout,
    overlayScalePct,
    streamUrl,
    stage,
    lightSchedule,
    strain,
    captureToken,
}: Omit<OverlayGrowView, "overlayStream"> & {captureToken?: string}) {
    return (
        <ProgramAudioGraphProvider>
            <div className="relative h-full w-full">
                <OverlayHud
                    plant={plant}
                    name={name}
                    seededAt={seededAt}
                    overlayLayout={overlayLayout}
                    overlayStream="include"
                    lockStream
                    overlayScalePct={overlayScalePct}
                    streamUrl={streamUrl}
                    stage={stage}
                    lightSchedule={lightSchedule}
                    strain={strain}
                    extra={<OverlayMusicWave layout={overlayLayout} />}
                />
                <OverlayAlertLayer layout={overlayLayout} captureToken={captureToken} />
                <ProgramAudio captureToken={captureToken} />
            </div>
        </ProgramAudioGraphProvider>
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/program-scene.test.ts tests/program-audio-http.test.ts tests/overlay-chrome.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/program-audio-graph.tsx components/overlay-music-wave.tsx components/program-audio.tsx components/program-scene.tsx tests/program-scene.test.ts tests/program-audio-http.test.ts
git commit -m "$(cat <<'EOF'
feat(program): draw playlist music wave from the program audio graph

Same Chromium element Pulse records. Card only while a local file is playing.
EOF
)"
```

---

### Task 6: Music rack smoothness slider

**Files:**
- Create: `components/wave-smooth-input.tsx`
- Modify: `app/admin/music-panel.tsx`
- Modify: `app/admin/stream/page.tsx`
- Test: `tests/mixer-strip.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/mixer-strip.test.ts` “wires MusicPanel files and URL save”:

```ts
        assert.match(page, /waveSmoothPct=\{audio\.waveSmoothPct\}/);
        assert.match(panel, /name="waveSmoothPct"/);
        assert.match(panel, /Wave smoothness/);
        assert.match(actions, /parseWaveSmoothPct\(formData.get\("waveSmoothPct"\)\)/);
        assert.match(actions, /waveSmoothPct: existing\.waveSmoothPct/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/mixer-strip.test.ts`

Expected: FAIL — no `waveSmoothPct` on MusicPanel.

- [ ] **Step 3: Write minimal implementation**

Create `components/wave-smooth-input.tsx`:

```tsx
"use client";

import {useState} from "react";
import {
    WAVE_SMOOTH_MAX,
    WAVE_SMOOTH_MIN,
    WAVE_SMOOTH_STEP,
    parseWaveSmoothPct,
} from "@/lib/program-music-wave";

export default function WaveSmoothInput({defaultValue}: {defaultValue: number}) {
    const [value, setValue] = useState(parseWaveSmoothPct(defaultValue));
    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase text-(--admin-subtle)">
                    Wave smoothness
                </p>
                <p className="text-sm tabular-nums text-(--admin-text)">{value}%</p>
            </div>
            <input
                type="range"
                name="waveSmoothPct"
                min={WAVE_SMOOTH_MIN}
                max={WAVE_SMOOTH_MAX}
                step={WAVE_SMOOTH_STEP}
                value={value}
                onChange={(event) => setValue(parseWaveSmoothPct(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-(--admin-border) accent-zinc-300"
            />
        </div>
    );
}
```

`app/admin/music-panel.tsx`:

```tsx
export function MusicPanel({
    files,
    url,
    waveSmoothPct,
}: {
    files: string[];
    url: string;
    waveSmoothPct: number;
}) {
```

Inside the URL form, after the URL field, before Save URL:

```tsx
                    <WaveSmoothInput defaultValue={waveSmoothPct} />
```

Import `WaveSmoothInput` from `@/components/wave-smooth-input`.

`app/admin/stream/page.tsx`:

```tsx
                    <MusicPanel
                        files={await listMusicFiles()}
                        url={audio.url}
                        waveSmoothPct={audio.waveSmoothPct}
                    />
```

`saveProgramAudioUrlAction` already writes `waveSmoothPct` from Task 2.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/mixer-strip.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/wave-smooth-input.tsx app/admin/music-panel.tsx app/admin/stream/page.tsx tests/mixer-strip.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): add wave smoothness slider to the Music rack

0–100 on the URL form. Mixer pause/volume does not reset it.
EOF
)"
```

---

### Task 7: Full test suite and build

**Files:** none new.

- [ ] **Step 1: Run `npm test`**

Expected: all pass. If a `RestreamAudio` literal is missing `waveSmoothPct`, add `waveSmoothPct: 70` and re-run.

- [ ] **Step 2: Run `npm run build`**

Expected: TypeScript compile succeeds.

- [ ] **Step 3: Commit only if Step 1 left extra edits**

```bash
git add -u
git commit -m "$(cat <<'EOF'
fix(program): fill waveSmoothPct on remaining audio.json writes
EOF
)"
```

Skip this commit if the suite was clean.

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Mirrored green wave, Music HUD card | 5 |
| Last in rail after energy, motion order 4 | 4, 5 |
| Active only while playlist file playing | 1, 5 |
| Same `<audio>` graph, destination connected, source once | 5 |
| Public overlay has no wave | 4, 5 |
| `waveSmoothPct` audio.json, default 70, 0–100 step 5 | 2 |
| `smoothingTimeConstant` max 0.95 | 1, 5 |
| Live via program-audio JSON | 3, 5 |
| Music rack slider; mixer preserves field | 2, 6 |
| Tests + build | 7 |
