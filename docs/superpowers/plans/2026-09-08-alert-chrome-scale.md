# Program Alert Chrome and Independent Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle program alerts as a GrowCast kind toast, place them off the watermark corner, and give them a 50–200% scale slider independent of HUD scale.

**Architecture:** Same program scene (capture + booth `/program`). `alertPlacement` becomes top-right / top-left. `alertScalePct` lives in `alerts.json` and rides the existing 2s program-audio JSON. `OverlayAlertLayer` paints the kind toast and polls that field. Public `/overlay` stays out.

**Tech Stack:** Next.js 16 App Router, React 19, node:test, existing `data/restream/alerts.json`.

**Spec:** `docs/superpowers/specs/2026-09-08-alert-chrome-scale-design.md`

**Test runner (single file):**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/<file>.test.ts
```

Do not use `npm test -- tests/foo` — the npm script already globs all tests.

---

## File map

| File | Responsibility |
|---|---|
| `lib/overlay-alert.ts` | Placement `top-right` / `top-left`; `alertToastCopy` |
| `lib/overlay-scale.ts` | `overlayAlertScaleStyle` (HUD helper unchanged) |
| `lib/restream/alerts-settings.ts` | `alertScalePct` on `alerts.json` |
| `lib/restream/program-http.ts` | Include `alertScalePct` in program-audio JSON |
| `components/overlay-alert-layer.tsx` | Kind toast, corner, 2s scale poll |
| `components/overlay-scale-input.tsx` | Optional `name` / `label` (HUD defaults) |
| `app/admin/alerts-panel.tsx` | Alert scale slider |
| `app/admin/actions.ts` | Persist `alertScalePct` |
| Tests under `tests/` | Files named in each task |

Do not change EventSub, mixer POST, sting, watermark position, HUD scale, or public `/overlay`.

---

### Task 1: Toast copy helper

**Files:**
- Modify: `lib/overlay-alert.ts`
- Test: `tests/overlay-alert.test.ts`

- [ ] **Step 1: Write the failing test**

Add this describe to `tests/overlay-alert.test.ts` (keep existing queue tests):

```ts
import {alertToastCopy} from "../lib/overlay-alert.ts";

describe("alertToastCopy", () => {
    it("uses kind for the chip and body for the headline", () => {
        assert.deepEqual(
            alertToastCopy({
                id: "1",
                kind: "follow",
                title: "Follow",
                body: "marcel",
                createdAt: 1,
            }),
            {chip: "Follow", headline: "marcel"},
        );
        assert.deepEqual(
            alertToastCopy({
                id: "2",
                kind: "sub",
                title: "Sub",
                body: "ada",
                createdAt: 1,
            }),
            {chip: "Sub", headline: "ada"},
        );
        assert.deepEqual(
            alertToastCopy({
                id: "3",
                kind: "raid",
                title: "Raid",
                body: "Ada · 12",
                createdAt: 1,
            }),
            {chip: "Raid", headline: "Ada · 12"},
        );
        assert.deepEqual(
            alertToastCopy({
                id: "4",
                kind: "bits",
                title: "Bits",
                body: "Ada 100",
                createdAt: 1,
            }),
            {chip: "Bits", headline: "Ada 100"},
        );
        assert.deepEqual(
            alertToastCopy({
                id: "5",
                kind: "manual",
                title: "Alert",
                body: "Lights just came on",
                createdAt: 1,
            }),
            {chip: "Alert", headline: "Lights just came on"},
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-alert.test.ts`

Expected: FAIL — `alertToastCopy` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/overlay-alert.ts`:

```ts
const ALERT_TOAST_CHIP: Record<OverlayAlertKind, string> = {
    follow: "Follow",
    sub: "Sub",
    raid: "Raid",
    bits: "Bits",
    manual: "Alert",
};

export function alertToastCopy(alert: OverlayAlert): {chip: string; headline: string} {
    return {chip: ALERT_TOAST_CHIP[alert.kind], headline: alert.body};
}
```

Do **not** change `alertPlacement` in this task (layer still compares `bottom-right`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-alert.test.ts`

Expected: PASS (placement test still expects bottom-right / top-center).

- [ ] **Step 5: Commit**

```bash
git add lib/overlay-alert.ts tests/overlay-alert.test.ts
git commit -m "$(cat <<'EOF'
feat(program): map overlay alerts to kind-toast copy

Chip from kind, headline from body. Placement still opposite-HUD until the layer ships.
EOF
)"
```

---

### Task 2: Alert scale style helper

**Files:**
- Modify: `lib/overlay-scale.ts`
- Test: `tests/overlay-scale.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/overlay-scale.test.ts`:

```ts
import {overlayAlertScaleStyle} from "../lib/overlay-scale.ts";

describe("overlayAlertScaleStyle", () => {
    it("scales from the free corner and uses none at 100%", () => {
        assert.deepEqual(overlayAlertScaleStyle(100, "left-rail"), {
            transform: "none",
            transformOrigin: "top right",
        });
        assert.deepEqual(overlayAlertScaleStyle(75, "left-rail"), {
            transform: "scale(0.75)",
            transformOrigin: "top right",
        });
        assert.deepEqual(overlayAlertScaleStyle(150, "bottom-bar"), {
            transform: "scale(1.5)",
            transformOrigin: "top left",
        });
        assert.deepEqual(overlayAlertScaleStyle(77, "bottom-bar"), {
            transform: "scale(0.75)",
            transformOrigin: "top left",
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-scale.test.ts`

Expected: FAIL — `overlayAlertScaleStyle` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `lib/overlay-scale.ts` (do not change `overlayHudScaleStyle`):

```ts
export function overlayAlertScaleStyle(
    scalePct: number,
    layout: OverlayLayout,
): {transform: string; transformOrigin: string} {
    const pct = parseOverlayScalePct(scalePct);
    return {
        transform: pct === DEFAULT_OVERLAY_SCALE_PCT ? "none" : `scale(${pct / 100})`,
        transformOrigin: layout === "bottom-bar" ? "top left" : "top right",
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-scale.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/overlay-scale.ts tests/overlay-scale.test.ts
git commit -m "$(cat <<'EOF'
feat(program): add independent overlay alert scale style

CSS scale from the free corner so the toast grows into the plant, not the watermark.
EOF
)"
```

---

### Task 3: Persist `alertScalePct` in alerts.json

**Files:**
- Modify: `lib/restream/alerts-settings.ts`
- Modify: `app/admin/actions.ts` (add the field so `writeAlertsSettings` still typechecks)
- Modify: `tests/alerts-settings.test.ts`
- Modify: `tests/eventsub.test.ts` (object literal)
- Modify: `tests/program-audio-http.test.ts` (object literals)

- [ ] **Step 1: Write the failing test**

Replace the parse describe in `tests/alerts-settings.test.ts` so it also covers scale. Keep `withTempDataDir`.

```ts
describe("parseAlertsSettings", () => {
    it("defaults sting on, twitch kinds on, and alert scale 100", () => {
        assert.equal(EMPTY_ALERTS_SETTINGS.stingEnabled, true);
        assert.equal(EMPTY_ALERTS_SETTINGS.alertScalePct, 100);
        assert.equal(parseAlertsSettings(null).follow, true);
        assert.equal(parseAlertsSettings(null).alertScalePct, 100);
        assert.equal(shouldEnqueueKind(parseAlertsSettings({follow: false}), "follow"), false);
        assert.equal(shouldEnqueueKind(parseAlertsSettings({follow: false}), "manual"), true);
        assert.equal(parseAlertsSettings({stingEnabled: false}).stingEnabled, false);
        assert.equal(parseAlertsSettings({alertScalePct: 77}).alertScalePct, 75);
        assert.equal(parseAlertsSettings({alertScalePct: 30}).alertScalePct, 50);
        assert.equal(parseAlertsSettings({alertScalePct: 999}).alertScalePct, 200);
        assert.equal(parseAlertsSettings({alertScalePct: "wide"}).alertScalePct, 100);
    });
});

describe("readAlertsSettings", () => {
    it("round-trips alerts.json off grow JSON", async () => {
        await withTempDataDir(async () => {
            await writeAlertsSettings({
                follow: false,
                sub: true,
                raid: true,
                bits: false,
                stingEnabled: false,
                alertScalePct: 150,
            });
            const settings = await readAlertsSettings();
            assert.equal(settings.follow, false);
            assert.equal(settings.sub, true);
            assert.equal(settings.raid, true);
            assert.equal(settings.bits, false);
            assert.equal(settings.stingEnabled, false);
            assert.equal(settings.alertScalePct, 150);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/alerts-settings.test.ts`

Expected: FAIL — `alertScalePct` is not on the type / is undefined.

- [ ] **Step 3: Write minimal implementation**

`lib/restream/alerts-settings.ts` — import parser and add the field:

```ts
import {parseOverlayScalePct} from "@/lib/overlay-scale";
```

```ts
export type AlertsSettings = {
    follow: boolean;
    sub: boolean;
    raid: boolean;
    bits: boolean;
    stingEnabled: boolean;
    alertScalePct: number;
};

export const EMPTY_ALERTS_SETTINGS: AlertsSettings = {
    follow: true,
    sub: true,
    raid: true,
    bits: true,
    stingEnabled: true,
    alertScalePct: 100,
};

export function parseAlertsSettings(raw: unknown): AlertsSettings {
    if (!isRecord(raw)) {
        return EMPTY_ALERTS_SETTINGS;
    }
    return {
        follow: asBoolean(raw.follow, true),
        sub: asBoolean(raw.sub, true),
        raid: asBoolean(raw.raid, true),
        bits: asBoolean(raw.bits, true),
        stingEnabled: asBoolean(raw.stingEnabled, true),
        alertScalePct: parseOverlayScalePct(raw.alertScalePct),
    };
}
```

`writeAlertsSettings` already runs `parseAlertsSettings(settings)` — leave it.

Update every `writeAlertsSettings({...})` object literal that TypeScript will reject:

- `app/admin/actions.ts` `saveAlertsSettingsAction` — add `alertScalePct: parseOverlayScalePct(formData.get("alertScalePct"))` and import `parseOverlayScalePct` from `@/lib/overlay-scale`.
- `tests/eventsub.test.ts` — add `alertScalePct: 100` to the existing object.
- `tests/program-audio-http.test.ts` — add `alertScalePct: 100` to both `writeAlertsSettings` objects.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/alerts-settings.test.ts`

Expected: PASS.

Also run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/eventsub.test.ts tests/program-audio-http.test.ts`

Expected: PASS (literals typecheck; JSON field not asserted yet).

- [ ] **Step 5: Commit**

```bash
git add lib/restream/alerts-settings.ts app/admin/actions.ts tests/alerts-settings.test.ts tests/eventsub.test.ts tests/program-audio-http.test.ts
git commit -m "$(cat <<'EOF'
feat(program): persist independent alert scale in alerts.json

50–200% snapped like HUD scale. Missing or junk reads as 100. Off grow JSON.
EOF
)"
```

---

### Task 4: Expose `alertScalePct` on program-audio JSON

**Files:**
- Modify: `lib/restream/program-http.ts`
- Test: `tests/program-audio-http.test.ts`

- [ ] **Step 1: Write the failing test**

Add a case after the stingEnabled test in `tests/program-audio-http.test.ts`:

```ts
    it("includes alertScalePct from alerts.json, default 100", async () => {
        await withTempDataDir(async () => {
            const missing = await programAudioGetResponse(
                new Request("http://local/api/overlay/program-audio"),
                {admin: true},
            );
            assert.equal(missing.status, 200);
            const missingBody = (await missing.json()) as {alertScalePct: number};
            assert.equal(missingBody.alertScalePct, 100);

            await writeAlertsSettings({
                follow: true,
                sub: true,
                raid: true,
                bits: true,
                stingEnabled: true,
                alertScalePct: 150,
            });
            const scaled = await programAudioGetResponse(
                new Request("http://local/api/overlay/program-audio"),
                {admin: true},
            );
            const scaledBody = (await scaled.json()) as {alertScalePct: number};
            assert.equal(scaledBody.alertScalePct, 150);
        });
    });
```

In the first `programAudioGetResponse` test, after `assert.equal(body.stingEnabled, true);` add:

```ts
            assert.equal(body.alertScalePct, 100);
```

and add `alertScalePct: number` to that cast.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/program-audio-http.test.ts`

Expected: FAIL — `alertScalePct` is undefined on the JSON body.

- [ ] **Step 3: Write minimal implementation**

In `lib/restream/program-http.ts` `programAudioGetResponse`, add the field next to `stingEnabled`:

```ts
            stingEnabled: alerts.stingEnabled,
            alertScalePct: alerts.alertScalePct,
```

Do **not** change `parseProgramAudioBody` in `components/program-audio.tsx` — extra JSON keys are ignored there.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/program-audio-http.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/restream/program-http.ts tests/program-audio-http.test.ts
git commit -m "$(cat <<'EOF'
feat(program): include alertScalePct on program-audio JSON

Capture and preview can poll scale without a sidecar restart.
EOF
)"
```

---

### Task 5: Kind toast layer, placement, scale poll

**Files:**
- Modify: `lib/overlay-alert.ts` (`OverlayAlertPlacement` + `alertPlacement`)
- Modify: `components/overlay-alert-layer.tsx`
- Test: `tests/overlay-alert.test.ts`
- Test: `tests/program-scene.test.ts`
- Test: `tests/overlay-chrome.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the placement test in `tests/overlay-alert.test.ts`:

```ts
describe("alertPlacement", () => {
    it("puts alerts in the free corner so they never cover GrowCast", () => {
        assert.equal(alertPlacement("left-rail"), "top-right");
        assert.equal(alertPlacement("bottom-bar"), "top-left");
    });
});
```

In `tests/program-scene.test.ts`, replace the layer-wiring test so it no longer expects the HUD card or old corners:

```ts
    it("keeps OverlayAlertLayer a HUD sibling and wires program alert SSE", () => {
        const scene = src(path.join("components", "program-scene.tsx"));
        const layer = src(path.join("components", "overlay-alert-layer.tsx"));
        const route = src(path.join("app", "api", "overlay", "program-alerts", "route.ts"));
        const http = src(path.join("lib", "overlay-alert-http.ts"));
        const hub = src(path.join("lib", "overlay-alert-hub.ts"));

        assert.match(scene, /<OverlayHud[\s\S]*\/>\s*<OverlayAlertLayer layout=\{overlayLayout\} captureToken=\{captureToken\} \/>/);
        assert.match(layer, /"use client"/);
        assert.match(layer, /EventSource/);
        assert.match(layer, /\/api\/overlay\/program-alerts/);
        assert.match(layer, /\?token=/);
        assert.match(layer, /enqueueOverlayAlert/);
        assert.match(layer, /OVERLAY_ALERT_DISPLAY_MS/);
        assert.match(layer, /alertPlacement/);
        assert.match(layer, /alertToastCopy/);
        assert.match(layer, /overlayAlertScaleStyle/);
        assert.match(layer, /\/api\/overlay\/program-audio/);
        assert.match(layer, /x-growcast-capture/);
        assert.match(layer, /alertScalePct/);
        assert.match(layer, /pointer-events-none/);
        assert.match(layer, /absolute z-20 top-8 right-8/);
        assert.match(layer, /absolute z-20 top-8 left-8/);
        assert.match(layer, /max-w-\[28rem\]/);
        assert.match(layer, /min-w-\[340px\]/);
        assert.match(layer, /#22c55e/);
        assert.doesNotMatch(layer, /OVERLAY_PANEL_CLASS/);
        assert.doesNotMatch(layer, /bottom-8 right-8/);
        assert.doesNotMatch(layer, /left-1\/2/);
        assert.match(route, /isAdminAuthenticated/);
        assert.match(route, /programAlertsSseResponse/);
        assert.doesNotMatch(http, /isAdminAuthenticated/);
        assert.doesNotMatch(http, /next\/headers/);
        assert.match(http, /text\/event-stream/);
        assert.match(http, /no-store/);
        assert.match(http, /: heartbeat/);
        assert.match(hub, /__growcastOverlayAlertHub/);
        assert.match(hub, /enqueueOverlayAlert/);
        assert.match(hub, /globalThis/);
    });
```

In `tests/overlay-chrome.test.ts`, extend the watermark test:

```ts
        assert.match(markSrc, /absolute right-6 top-6/);
        assert.match(markSrc, /absolute right-6 bottom-6/);
        assert.match(markSrc, /z-10/);
        assert.doesNotMatch(markSrc, /overlayAlertScaleStyle/);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-alert.test.ts tests/program-scene.test.ts tests/overlay-chrome.test.ts`

Expected: FAIL — placement still bottom-right; layer still uses `OVERLAY_PANEL_CLASS`.

- [ ] **Step 3: Write minimal implementation**

`lib/overlay-alert.ts`:

```ts
export type OverlayAlertPlacement = "top-right" | "top-left";

export function alertPlacement(layout: OverlayLayout): OverlayAlertPlacement {
    return layout === "bottom-bar" ? "top-left" : "top-right";
}
```

Replace `components/overlay-alert-layer.tsx` in full:

```tsx
"use client";

import {useEffect, useState} from "react";
import {
    OVERLAY_ALERT_DISPLAY_MS,
    alertPlacement,
    alertToastCopy,
    enqueueOverlayAlert,
    type OverlayAlert,
    type OverlayAlertKind,
} from "@/lib/overlay-alert";
import type {OverlayLayout} from "@/lib/overlay-layout";
import {DEFAULT_OVERLAY_SCALE_PCT, overlayAlertScaleStyle, parseOverlayScalePct} from "@/lib/overlay-scale";

const PROGRAM_ALERTS_PATH = "/api/overlay/program-alerts";
const PROGRAM_AUDIO_PATH = "/api/overlay/program-audio";
const PROGRAM_AUDIO_POLL_MS = 2000;

const ALERT_KINDS = new Set<OverlayAlertKind>(["follow", "sub", "raid", "bits", "manual"]);

function isOverlayAlertKind(value: unknown): value is OverlayAlertKind {
    return typeof value === "string" && ALERT_KINDS.has(value as OverlayAlertKind);
}

function parseOverlayAlert(raw: unknown): OverlayAlert | null {
    if (raw === null || typeof raw !== "object") {
        return null;
    }
    const value = raw as Record<string, unknown>;
    if (typeof value.id !== "string" || value.id.length === 0) {
        return null;
    }
    if (!isOverlayAlertKind(value.kind)) {
        return null;
    }
    if (typeof value.title !== "string" || typeof value.body !== "string") {
        return null;
    }
    if (typeof value.createdAt !== "number" || !Number.isFinite(value.createdAt)) {
        return null;
    }
    return {
        id: value.id,
        kind: value.kind,
        title: value.title,
        body: value.body,
        createdAt: value.createdAt,
    };
}

function parseAlertScalePct(raw: unknown): number | null {
    if (raw === null || typeof raw !== "object" || !("alertScalePct" in raw)) {
        return null;
    }
    return parseOverlayScalePct((raw as {alertScalePct: unknown}).alertScalePct);
}

export default function OverlayAlertLayer({
    layout,
    captureToken,
}: {
    layout: OverlayLayout;
    captureToken?: string;
}) {
    const [queue, setQueue] = useState<OverlayAlert[]>([]);
    const [scalePct, setScalePct] = useState(DEFAULT_OVERLAY_SCALE_PCT);
    const current = queue[0];

    useEffect(() => {
        const url = captureToken
            ? `${PROGRAM_ALERTS_PATH}?token=${encodeURIComponent(captureToken)}`
            : PROGRAM_ALERTS_PATH;
        const source = new EventSource(url);
        source.onmessage = (event) => {
            let raw: unknown;
            try {
                raw = JSON.parse(event.data) as unknown;
            } catch {
                return;
            }
            const alert = parseOverlayAlert(raw);
            if (!alert) {
                return;
            }
            setQueue((currentQueue) => enqueueOverlayAlert(currentQueue, alert));
        };
        return () => {
            source.close();
        };
    }, [captureToken]);

    useEffect(() => {
        const abort = new AbortController();
        let cancelled = false;

        async function poll() {
            try {
                const headers: HeadersInit = {};
                if (captureToken) {
                    headers["x-growcast-capture"] = captureToken;
                }
                const response = await fetch(PROGRAM_AUDIO_PATH, {
                    credentials: "include",
                    cache: "no-store",
                    headers,
                    signal: abort.signal,
                });
                if (!response.ok || cancelled) {
                    return;
                }
                const parsed = parseAlertScalePct(await response.json());
                if (parsed === null || cancelled) {
                    return;
                }
                setScalePct(parsed);
            } catch {
                // keep last good scale; first paint is 100
            }
        }

        void poll();
        const timer = window.setInterval(() => {
            void poll();
        }, PROGRAM_AUDIO_POLL_MS);
        return () => {
            cancelled = true;
            abort.abort();
            window.clearInterval(timer);
        };
    }, [captureToken]);

    useEffect(() => {
        if (!current) {
            return;
        }
        window.dispatchEvent(new CustomEvent("growcast-alert-sting"));
        const timer = window.setTimeout(() => {
            setQueue((currentQueue) =>
                currentQueue[0]?.id === current.id ? currentQueue.slice(1) : currentQueue,
            );
        }, OVERLAY_ALERT_DISPLAY_MS);
        return () => {
            window.clearTimeout(timer);
        };
    }, [current]);

    if (!current) {
        return null;
    }

    const placement = alertPlacement(layout);
    const copy = alertToastCopy(current);
    const positionClass =
        placement === "top-right"
            ? "absolute z-20 top-8 right-8"
            : "absolute z-20 top-8 left-8";

    return (
        <div
            className={`pointer-events-none ${positionClass}`}
            style={overlayAlertScaleStyle(scalePct, layout)}
        >
            <div className="flex min-w-[340px] max-w-[28rem] overflow-hidden rounded-[14px] border border-white/8 bg-[rgba(9,9,11,0.86)] shadow-[0_18px_40px_rgba(0,0,0,0.5)]">
                <div className="w-1.5 shrink-0 bg-[#22c55e]" />
                <div className="px-5 py-3.5 pl-4">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#4ade80]">
                        {copy.chip}
                    </p>
                    <p className="mt-0.5 text-[28px] font-semibold leading-tight tracking-tight text-zinc-50">
                        {copy.headline}
                    </p>
                </div>
            </div>
        </div>
    );
}
```

Leave `components/overlay-watermark.tsx` unchanged. The overlay-chrome assertions already match its classes; adding `z-10` / `right-6` checks should pass without a watermark edit.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-alert.test.ts tests/program-scene.test.ts tests/overlay-chrome.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/overlay-alert.ts components/overlay-alert-layer.tsx tests/overlay-alert.test.ts tests/program-scene.test.ts tests/overlay-chrome.test.ts
git commit -m "$(cat <<'EOF'
feat(program): kind-toast alerts off the GrowCast watermark

Top-right on left-rail, top-left on bottom-bar. Independent CSS scale from program-audio poll.
EOF
)"
```

---

### Task 6: Alerts rack slider

**Files:**
- Modify: `components/overlay-scale-input.tsx`
- Modify: `app/admin/alerts-panel.tsx`
- Test: `tests/mixer-strip.test.ts`
- Test: `tests/overlay-chrome.test.ts` (HUD slider name must still be `overlayScalePct`)

- [ ] **Step 1: Write the failing test**

In `tests/mixer-strip.test.ts`, inside `wires AlertsPanel onto the stream racks`, add:

```ts
        assert.match(panel, /name="alertScalePct"/);
        assert.match(panel, /Alert scale/);
        assert.match(actions, /parseOverlayScalePct\(formData.get\("alertScalePct"\)\)/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/mixer-strip.test.ts`

Expected: FAIL — Alerts panel has no `alertScalePct`.

- [ ] **Step 3: Write minimal implementation**

`components/overlay-scale-input.tsx` — add optional `name` and `label`, keep HUD defaults:

```tsx
export default function OverlayScaleInput({
    defaultValue,
    form,
    name = "overlayScalePct",
    label = "HUD scale",
}: {
    defaultValue: number;
    form?: string;
    name?: string;
    label?: string;
}) {
    const [value, setValue] = useState(parseOverlayScalePct(defaultValue));

    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase text-(--admin-subtle)">{label}</p>
                <p className="text-sm tabular-nums text-(--admin-text)">{value}%</p>
            </div>
            <input
                type="range"
                name={name}
                form={form}
                min={OVERLAY_SCALE_MIN}
                max={OVERLAY_SCALE_MAX}
                step={OVERLAY_SCALE_STEP}
                value={value}
                onChange={(event) => setValue(parseOverlayScalePct(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-(--admin-border) accent-zinc-300"
            />
        </div>
    );
}
```

`app/admin/alerts-panel.tsx` — import `OverlayScaleInput` and put it above the Save button (enabled without Twitch Connect):

```tsx
import OverlayScaleInput from "@/components/overlay-scale-input";
```

```tsx
                <AdminCheckboxRow
                    name="stingEnabled"
                    label="Alert sound"
                    defaultChecked={settings.stingEnabled}
                />
                <OverlayScaleInput
                    defaultValue={settings.alertScalePct}
                    name="alertScalePct"
                    label="Alert scale"
                />
                <AdminButton type="submit" tone="secondary">
                    Save
                </AdminButton>
```

`saveAlertsSettingsAction` already writes `alertScalePct` from Task 3.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/mixer-strip.test.ts tests/overlay-chrome.test.ts`

Expected: PASS. Overlay chrome still matches `name="overlayScalePct"` on the HUD slider.

- [ ] **Step 5: Commit**

```bash
git add components/overlay-scale-input.tsx app/admin/alerts-panel.tsx tests/mixer-strip.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): add independent alert scale slider

Alerts rack control, enabled without Twitch. HUD scale slider unchanged.
EOF
)"
```

---

### Task 7: Full test suite and build

**Files:** none new — verification only.

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`

Expected: all tests pass. If any leftover `AlertsSettings` literal is missing `alertScalePct`, add `alertScalePct: 100` and re-run.

- [ ] **Step 2: Production build**

Run: `npm run build`

Expected: Next.js compile succeeds (no type errors on `AlertsSettings` or `OverlayAlertPlacement`).

- [ ] **Step 3: Commit only if Step 1 left extra test literals**

If the suite forced extra edits:

```bash
git add -u
git commit -m "$(cat <<'EOF'
fix(program): fill alertScalePct on remaining alerts.json writes
EOF
)"
```

If `npm test` and `npm run build` were clean with no extra edits, skip this commit.

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Kind toast chrome, green accent, 12px chip, 28px headline, min 340px, max 28rem | 5 |
| Chip from kind, headline from body, no extra verb line | 1, 5 |
| Left-rail top-right, bottom-bar top-left | 5 |
| Watermark unchanged, unscaled, own corner | 5 (tests) |
| Independent `alertScalePct` 50–200 step 5 default 100 | 2, 3 |
| Origin top-right / top-left | 2, 5 |
| Program-audio JSON + 2s poll, keep last good scale, first paint 100 | 4, 5 |
| Alerts rack slider, enabled without Connect | 6 |
| Save parses `alertScalePct` | 3, 6 |
| Mixer Send alert / EventSub / sting / queue / public overlay unchanged | no edits |
| Tests listed in spec | 1–6 |
| `npm test` + `npm run build` | 7 |
