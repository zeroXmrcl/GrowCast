# Camera Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grade only the live-cam iframe (brightness, contrast, saturation, temperature) on the 1080p program, with a live draft in Broadcast and Twitch following Apply.

**Architecture:** Four integers −100…100 live in `data/restream/camera-look.json`. CSS `filter` plus a warm/cool overlay sit on the cam wrap under the HUD. Capture Chromium polls the saved file. The Broadcast `/program` iframe also accepts a same-origin `postMessage` draft so sliders can hunt without viewers seeing it.

**Tech Stack:** Next.js 16 App Router, React 19, CSS `filter` / `mix-blend-mode`, node:test.

**Spec:** `docs/superpowers/specs/2026-09-08-camera-look-design.md`

**Test runner (single file):**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/<file>.test.ts
```

Do not use `npm test -- tests/foo`.

Do not commit the spec or this plan unless the user asks.

---

## File map

| File | Responsibility |
|---|---|
| `lib/restream/camera-look.ts` | Type, empty, parse/clamp, CSS + temperature style, draft event/message helpers, read/write |
| `lib/restream/paths.ts` | `restreamCameraLookFile()` |
| `lib/restream/program-http.ts` | `programCameraGetResponse` |
| `lib/admin/apply-camera-look.ts` | Clamp + persist from JSON body |
| `app/api/overlay/program-camera/route.ts` | GET |
| `app/api/admin/camera-look/route.ts` | POST |
| `components/overlay-shell.tsx` | Cam wrap: iframe filter + temperature overlay |
| `components/overlay-hud.tsx` | Pass `look` through |
| `components/program-camera-look.tsx` | Poll saved look; listen for draft when not capture; render OverlayHud |
| `components/program-scene.tsx` | Mount `ProgramCameraLook` |
| `app/overlay/page.tsx` | SSR saved look into OverlayHud |
| `app/admin/camera-look-panel.tsx` | Four sliders, Reset, Apply |
| `app/admin/program-monitor.tsx` | Forward draft CustomEvent → iframe `postMessage` |
| `app/admin/stream/page.tsx` | Camera look panel above Music |

---

### Task 1: Parse, CSS, temperature helpers

**Files:**
- Create: `lib/restream/camera-look.ts`
- Create: `tests/camera-look.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/camera-look.test.ts`:

```ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    CAMERA_LOOK_DRAFT_EVENT,
    CAMERA_LOOK_MAX,
    CAMERA_LOOK_MESSAGE_TYPE,
    CAMERA_LOOK_MIN,
    EMPTY_CAMERA_LOOK,
    cameraLookFilterCss,
    cameraLookTemperatureStyle,
    isCameraLookMessage,
    parseCameraLook,
    parseCameraLookPct,
} from "../lib/restream/camera-look.ts";

describe("parseCameraLookPct", () => {
    it("rounds, clamps −100…100, and treats junk as 0", () => {
        assert.equal(CAMERA_LOOK_MIN, -100);
        assert.equal(CAMERA_LOOK_MAX, 100);
        assert.equal(parseCameraLookPct(undefined), 0);
        assert.equal(parseCameraLookPct(null), 0);
        assert.equal(parseCameraLookPct(""), 0);
        assert.equal(parseCameraLookPct("wide"), 0);
        assert.equal(parseCameraLookPct(12.4), 12);
        assert.equal(parseCameraLookPct(-200), -100);
        assert.equal(parseCameraLookPct(999), 100);
        assert.equal(parseCameraLookPct("8"), 8);
    });
});

describe("parseCameraLook", () => {
    it("defaults to zeros and ignores junk keys", () => {
        assert.deepEqual(parseCameraLook(null), EMPTY_CAMERA_LOOK);
        assert.deepEqual(parseCameraLook({brightness: 12.4, extra: true}), {
            brightness: 12,
            contrast: 0,
            saturation: 0,
            temperature: 0,
        });
    });
});

describe("cameraLookFilterCss", () => {
    it("omits identity functions and never interpolates raw CSS", () => {
        assert.equal(cameraLookFilterCss(EMPTY_CAMERA_LOOK), "");
        assert.equal(
            cameraLookFilterCss({...EMPTY_CAMERA_LOOK, brightness: 12}),
            "brightness(1.12)",
        );
        assert.equal(
            cameraLookFilterCss({
                brightness: 12,
                contrast: 18,
                saturation: -100,
                temperature: 8,
            }),
            "brightness(1.12) contrast(1.18) saturate(0)",
        );
        const injected = cameraLookFilterCss(
            parseCameraLook({brightness: "url(javascript:alert(1))"}),
        );
        assert.equal(injected, "");
        assert.equal(injected.includes("url("), false);
        assert.equal(injected.includes("javascript"), false);
    });
});

describe("cameraLookTemperatureStyle", () => {
    it("hides at 0, warms positive, cools negative", () => {
        assert.equal(cameraLookTemperatureStyle(0).display, "none");
        const warm = cameraLookTemperatureStyle(40);
        assert.equal(warm.background, "#ff8c4b");
        assert.equal(warm.mixBlendMode, "soft-light");
        assert.equal(warm.opacity, 0.2);
        const cool = cameraLookTemperatureStyle(-100);
        assert.equal(cool.background, "#4b8cff");
        assert.equal(cool.opacity, 0.5);
    });
});

describe("isCameraLookMessage", () => {
    it("accepts the draft type and rejects other payloads", () => {
        assert.equal(CAMERA_LOOK_MESSAGE_TYPE, "growcast-camera-look");
        assert.equal(CAMERA_LOOK_DRAFT_EVENT, "growcast-camera-look-draft");
        assert.equal(
            isCameraLookMessage({
                type: "growcast-camera-look",
                brightness: 1,
                contrast: 0,
                saturation: 0,
                temperature: 0,
            }),
            true,
        );
        assert.equal(isCameraLookMessage({type: "growcast-alert-sting"}), false);
        assert.equal(isCameraLookMessage(null), false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/camera-look.test.ts
```

Expected: FAIL (cannot find module `../lib/restream/camera-look.ts`)

- [ ] **Step 3: Write minimal implementation**

Create `lib/restream/camera-look.ts`:

```ts
import {chmod, readFile} from "node:fs/promises";
import {asNumber, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {restreamCameraLookFile, restreamDir} from "@/lib/restream/paths";

export const CAMERA_LOOK_MIN = -100;
export const CAMERA_LOOK_MAX = 100;
export const CAMERA_LOOK_MESSAGE_TYPE = "growcast-camera-look";
export const CAMERA_LOOK_DRAFT_EVENT = "growcast-camera-look-draft";
export const PROGRAM_CAMERA_POLL_MS = 2000;

export type CameraLook = {
    brightness: number;
    contrast: number;
    saturation: number;
    temperature: number;
};

export const EMPTY_CAMERA_LOOK: CameraLook = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
};

export function parseCameraLookPct(value: unknown): number {
    const n = asNumber(value, Number.NaN);
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.min(CAMERA_LOOK_MAX, Math.max(CAMERA_LOOK_MIN, Math.round(n)));
}

export function parseCameraLook(raw: unknown): CameraLook {
    if (!isRecord(raw)) {
        return EMPTY_CAMERA_LOOK;
    }
    return {
        brightness: parseCameraLookPct(raw.brightness),
        contrast: parseCameraLookPct(raw.contrast),
        saturation: parseCameraLookPct(raw.saturation),
        temperature: parseCameraLookPct(raw.temperature),
    };
}

export function cameraLookFilterCss(look: CameraLook): string {
    const parts: string[] = [];
    if (look.brightness !== 0) {
        parts.push(`brightness(${1 + look.brightness / 100})`);
    }
    if (look.contrast !== 0) {
        parts.push(`contrast(${1 + look.contrast / 100})`);
    }
    if (look.saturation !== 0) {
        parts.push(`saturate(${1 + look.saturation / 100})`);
    }
    return parts.join(" ");
}

export function cameraLookTemperatureStyle(temperature: number): {
    display: "none" | "block";
    background?: string;
    mixBlendMode?: "soft-light";
    opacity?: number;
} {
    if (temperature === 0) {
        return {display: "none"};
    }
    return {
        display: "block",
        background: temperature > 0 ? "#ff8c4b" : "#4b8cff",
        mixBlendMode: "soft-light",
        opacity: Math.min(0.5, Math.abs(temperature) / 200),
    };
}

export function isCameraLookMessage(raw: unknown): raw is CameraLook & {type: string} {
    if (!isRecord(raw) || raw.type !== CAMERA_LOOK_MESSAGE_TYPE) {
        return false;
    }
    return true;
}

export async function readCameraLook(): Promise<CameraLook> {
    try {
        return parseCameraLook(JSON.parse(await readFile(restreamCameraLookFile(), "utf8")));
    } catch {
        return EMPTY_CAMERA_LOOK;
    }
}

export async function writeCameraLook(look: CameraLook): Promise<void> {
    const parsed = parseCameraLook(look);
    await atomicWriteFile(restreamCameraLookFile(), `${JSON.stringify(parsed, null, 2)}\n`);
    await chmod(restreamDir(), 0o700).catch(() => undefined);
    await chmod(restreamCameraLookFile(), 0o600);
}
```

`readCameraLook` / `writeCameraLook` will not compile until Task 2 adds the path helper. **In this task only**, omit those two functions if `restreamCameraLookFile` does not exist yet — add them in Task 2. Keep parse/CSS/message helpers in this file now.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/camera-look.test.ts
```

Expected: pass (all cases in this file)

- [ ] **Step 5: Commit**

```bash
git add lib/restream/camera-look.ts tests/camera-look.test.ts
git commit -m "feat(restream): parse camera-look sliders into CSS"
```

---

### Task 2: Persist `camera-look.json`

**Files:**
- Modify: `lib/restream/paths.ts`
- Modify: `lib/restream/camera-look.ts` (add read/write if not already)
- Modify: `tests/camera-look.test.ts`

- [ ] **Step 1: Write the failing persistence test**

Append to `tests/camera-look.test.ts`:

```ts
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {readCameraLook, writeCameraLook} from "../lib/restream/camera-look.ts";
import {restreamCameraLookFile} from "../lib/restream/paths.ts";

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-look-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn();
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("readCameraLook / writeCameraLook", () => {
    it("round-trips clamped JSON off grow JSON and missing file is zeros", async () => {
        await withTempDataDir(async () => {
            assert.deepEqual(await readCameraLook(), EMPTY_CAMERA_LOOK);
            await writeCameraLook({
                brightness: 12.4,
                contrast: 200,
                saturation: -9,
                temperature: 8,
            });
            const disk = JSON.parse(await readFile(restreamCameraLookFile(), "utf8")) as {
                brightness: number;
                contrast: number;
                saturation: number;
                temperature: number;
            };
            assert.deepEqual(disk, {
                brightness: 12,
                contrast: 100,
                saturation: -9,
                temperature: 8,
            });
            assert.equal(restreamCameraLookFile().includes("camera-look.json"), true);
            assert.equal(restreamCameraLookFile().includes("current-grow"), false);
            assert.deepEqual(await readCameraLook(), disk);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/camera-look.test.ts
```

Expected: FAIL (`restreamCameraLookFile` is not a function)

- [ ] **Step 3: Add the path and read/write**

In `lib/restream/paths.ts`, next to `restreamAlertsFile`:

```ts
export function restreamCameraLookFile(): string {
    return path.join(restreamDir(), "camera-look.json");
}
```

Ensure `readCameraLook` / `writeCameraLook` exist in `lib/restream/camera-look.ts` as in Task 1.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/camera-look.test.ts
```

Expected: pass

- [ ] **Step 5: Commit**

```bash
git add lib/restream/paths.ts lib/restream/camera-look.ts tests/camera-look.test.ts
git commit -m "feat(restream): persist camera-look.json"
```

---

### Task 3: GET `/api/overlay/program-camera`

**Files:**
- Modify: `lib/restream/program-http.ts`
- Create: `app/api/overlay/program-camera/route.ts`
- Create: `tests/program-camera-http.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/program-camera-http.test.ts`:

```ts
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {writeCameraLook} from "../lib/restream/camera-look.ts";
import {ensureRestreamCaptureToken} from "../lib/restream/capture.ts";
import {programCameraGetResponse} from "../lib/restream/program-http.ts";

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-cam-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn();
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("programCameraGetResponse", () => {
    it("denies without auth and returns four ints for admin or capture token", async () => {
        await withTempDataDir(async () => {
            const token = await ensureRestreamCaptureToken();
            await writeCameraLook({
                brightness: 12,
                contrast: 18,
                saturation: 10,
                temperature: 8,
            });
            const denied = await programCameraGetResponse(
                new Request("http://local/api/overlay/program-camera"),
                {admin: false},
            );
            assert.equal(denied.status, 404);
            assert.notEqual(denied.status, 401);

            const asCapture = await programCameraGetResponse(
                new Request("http://local/api/overlay/program-camera", {
                    headers: {"x-growcast-capture": token},
                }),
                {admin: false},
            );
            assert.equal(asCapture.status, 200);
            assert.match(asCapture.headers.get("cache-control") ?? "", /no-store/);
            const body = (await asCapture.json()) as Record<string, unknown>;
            assert.deepEqual(body, {
                brightness: 12,
                contrast: 18,
                saturation: 10,
                temperature: 8,
            });
            assert.equal(JSON.stringify(body).includes("camera-look.json"), false);

            const asAdmin = await programCameraGetResponse(
                new Request("http://local/api/overlay/program-camera"),
                {admin: true},
            );
            assert.equal(asAdmin.status, 200);
        });
    });
});

describe("program-camera route", () => {
    it("uses the program GET helper and request log", () => {
        const route = readFileSync(
            path.join(process.cwd(), "app", "api", "overlay", "program-camera", "route.ts"),
            "utf8",
        );
        assert.match(route, /programCameraGetResponse/);
        assert.match(route, /isAdminAuthenticated/);
        assert.match(route, /withRequestLog/);
        assert.doesNotMatch(route, /401/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-camera-http.test.ts
```

Expected: FAIL (`programCameraGetResponse` is not exported)

- [ ] **Step 3: Implement GET helper and route**

Add to `lib/restream/program-http.ts`:

```ts
import {readCameraLook} from "@/lib/restream/camera-look";

export async function programCameraGetResponse(
    request: Request,
    options: {admin: boolean},
): Promise<Response> {
    if (!(await authorizeProgramRequest(request, options.admin))) {
        return notFound();
    }
    const look = await readCameraLook();
    return Response.json(look, {
        headers: {"Cache-Control": NO_STORE},
    });
}
```

Create `app/api/overlay/program-camera/route.ts`:

```ts
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {withRequestLog} from "@/lib/logging";
import {programCameraGetResponse} from "@/lib/restream/program-http";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
    return withRequestLog(request, "/api/overlay/program-camera", async () => {
        const admin = await isAdminAuthenticated();
        return programCameraGetResponse(request, {admin});
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-camera-http.test.ts
```

Expected: pass

- [ ] **Step 5: Commit**

```bash
git add lib/restream/program-http.ts app/api/overlay/program-camera/route.ts tests/program-camera-http.test.ts
git commit -m "feat(program): expose saved camera look to capture"
```

---

### Task 4: POST `/api/admin/camera-look`

**Files:**
- Create: `lib/admin/apply-camera-look.ts`
- Create: `app/api/admin/camera-look/route.ts`
- Create: `tests/apply-camera-look.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/apply-camera-look.test.ts`:

```ts
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {applyCameraLook} from "../lib/admin/apply-camera-look.ts";
import {EMPTY_CAMERA_LOOK, readCameraLook} from "../lib/restream/camera-look.ts";

async function withTempDataDir<T>(fn: () => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-look-post-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn();
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("applyCameraLook", () => {
    it("rejects a non-object and round-trips a clamped look", async () => {
        await withTempDataDir(async () => {
            assert.deepEqual(await applyCameraLook(null), {ok: false, reason: "invalid_json"});
            assert.deepEqual(await readCameraLook(), EMPTY_CAMERA_LOOK);
            assert.deepEqual(
                await applyCameraLook({
                    brightness: 12.6,
                    contrast: 18,
                    saturation: 10,
                    temperature: 8,
                }),
                {ok: true},
            );
            assert.deepEqual(await readCameraLook(), {
                brightness: 13,
                contrast: 18,
                saturation: 10,
                temperature: 8,
            });
        });
    });
});

describe("camera-look admin route", () => {
    it("is a same-origin JSON POST without a page redirect", () => {
        const route = readFileSync(
            path.join(process.cwd(), "app", "api", "admin", "camera-look", "route.ts"),
            "utf8",
        );
        assert.match(route, /isSameOriginRequest/);
        assert.match(route, /isAdminAuthenticated/);
        assert.match(route, /applyCameraLook/);
        assert.match(route, /invalid_json/);
        assert.doesNotMatch(route, /seeOther/);
        assert.doesNotMatch(route, /redirect\(/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/apply-camera-look.test.ts
```

Expected: FAIL (cannot find `apply-camera-look.ts`)

- [ ] **Step 3: Implement apply + route**

Create `lib/admin/apply-camera-look.ts`:

```ts
import {isRecord} from "@/lib/coerce";
import {parseCameraLook, writeCameraLook} from "@/lib/restream/camera-look";

export type ApplyCameraLookResult =
    | {ok: true}
    | {ok: false; reason: "invalid_json"};

export async function applyCameraLook(raw: unknown): Promise<ApplyCameraLookResult> {
    if (!isRecord(raw)) {
        return {ok: false, reason: "invalid_json"};
    }
    await writeCameraLook(parseCameraLook(raw));
    return {ok: true};
}
```

Create `app/api/admin/camera-look/route.ts`:

```ts
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {applyCameraLook} from "@/lib/admin/apply-camera-look";
import {logAuthzDenied, withRequestLog} from "@/lib/logging";
import {isSameOriginRequest} from "@/lib/same-origin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function json(body: unknown, status: number): Response {
    return Response.json(body, {
        status,
        headers: {"Cache-Control": "no-store"},
    });
}

export async function POST(request: Request) {
    return withRequestLog(request, "/api/admin/camera-look", async () => {
        if (!isSameOriginRequest(request)) {
            return json({ok: false, reason: "cross_origin"}, 403);
        }
        if (!(await isAdminAuthenticated())) {
            logAuthzDenied({reason: "unauthenticated", resource: "admin.camera_look"});
            return json({ok: false, reason: "unauthenticated"}, 401);
        }
        let raw: unknown;
        try {
            raw = await request.json();
        } catch {
            return json({ok: false, reason: "invalid_json"}, 400);
        }
        const result = await applyCameraLook(raw);
        if (!result.ok) {
            return json(result, 400);
        }
        return json(result, 200);
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/apply-camera-look.test.ts
```

Expected: pass

- [ ] **Step 5: Commit**

```bash
git add lib/admin/apply-camera-look.ts app/api/admin/camera-look/route.ts tests/apply-camera-look.test.ts
git commit -m "feat(admin): save camera look over JSON POST"
```

---

### Task 5: Cam wrap on OverlayShell

**Files:**
- Modify: `components/overlay-shell.tsx`
- Modify: `tests/overlay-chrome.test.ts`

- [ ] **Step 1: Write the failing source test**

In `tests/overlay-chrome.test.ts`, inside the existing `"embeds the grow stream only when overlayStream is include"` test (or a new `it` in the same describe), add:

```ts
assert.match(shellSrc, /cameraLookFilterCss/);
assert.match(shellSrc, /cameraLookTemperatureStyle/);
assert.match(shellSrc, /look\??:/);
assert.match(shellSrc, /absolute inset-0 z-0/);
assert.match(shellSrc, /pointer-events-none absolute inset-0/);
assert.match(shellSrc, /filter:/);
```

Also add a dedicated `it`:

```ts
it("grades the cam iframe, not the HUD or watermark", () => {
    const shellSrc = readFileSync(
        path.join(process.cwd(), "components", "overlay-shell.tsx"),
        "utf8",
    );
    const iframe = shellSrc.indexOf("<iframe");
    const hud = shellSrc.indexOf("scaleStyle");
    const mark = shellSrc.indexOf("OverlayWatermark");
    const wrap = shellSrc.indexOf("z-0");
    assert.ok(wrap >= 0 && iframe > wrap);
    assert.ok(hud > iframe);
    assert.ok(mark > hud);
    assert.match(shellSrc, /EMPTY_CAMERA_LOOK/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-chrome.test.ts
```

Expected: FAIL (no `cameraLookFilterCss`)

- [ ] **Step 3: Wrap the iframe**

In `components/overlay-shell.tsx`:

- Import `EMPTY_CAMERA_LOOK`, `cameraLookFilterCss`, `cameraLookTemperatureStyle`, type `CameraLook`.
- Add optional prop `look?: CameraLook` defaulting to `EMPTY_CAMERA_LOOK`.
- Replace the bare iframe with:

```tsx
{embed && safeStream ? (
    <div className="absolute inset-0 z-0">
        <iframe
            className="absolute inset-0 h-full w-full border-0"
            src={safeStream}
            allow="autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            title="Grow stream"
            style={{filter: cameraLookFilterCss(look) || undefined}}
        />
        <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={cameraLookTemperatureStyle(look.temperature)}
        />
    </div>
) : null}
```

Do not put HUD children or `OverlayWatermark` inside that wrap. Keep watermark `z-10`.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-chrome.test.ts
```

Expected: pass

- [ ] **Step 5: Commit**

```bash
git add components/overlay-shell.tsx tests/overlay-chrome.test.ts
git commit -m "feat(overlay): grade the cam iframe only"
```

---

### Task 6: Pass `look` through OverlayHud + overlay SSR

**Files:**
- Modify: `components/overlay-hud.tsx`
- Modify: `app/overlay/page.tsx`
- Modify: `tests/overlay-chrome.test.ts`
- Modify: `tests/program-scene.test.ts` if it asserts OverlayHud props

- [ ] **Step 1: Write the failing test**

In `tests/overlay-chrome.test.ts` HUD assertions:

```ts
assert.match(hudSrc, /look\??:/);
assert.match(hudSrc, /look=\{look/);
```

Add:

```ts
it("public overlay SSR-feeds saved look, not a draft listener", () => {
    const page = readFileSync(path.join(process.cwd(), "app", "overlay", "page.tsx"), "utf8");
    assert.match(page, /readCameraLook/);
    assert.match(page, /look=\{/);
    assert.doesNotMatch(page, /growcast-camera-look/);
    assert.doesNotMatch(page, /addEventListener\("message"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-chrome.test.ts
```

Expected: FAIL

- [ ] **Step 3: Wire the prop**

`components/overlay-hud.tsx`:

```ts
import {EMPTY_CAMERA_LOOK, type CameraLook} from "@/lib/restream/camera-look";
```

Extend props: `{lockStream?: boolean; extra?: ReactNode; look?: CameraLook}`.

Default `look = EMPTY_CAMERA_LOOK`. Pass `look={look}` into `OverlayShell`.

`app/overlay/page.tsx`: `const look = await readCameraLook();` and `<OverlayHud ... look={look} />`.

- [ ] **Step 4: Run tests**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-chrome.test.ts tests/program-scene.test.ts
```

Expected: pass. If `program-scene.test.ts` breaks because OverlayHud gained a required prop, keep `look` optional.

- [ ] **Step 5: Commit**

```bash
git add components/overlay-hud.tsx app/overlay/page.tsx tests/overlay-chrome.test.ts
git commit -m "feat(overlay): pass saved camera look into the HUD"
```

---

### Task 7: Program poll + booth draft listener

**Files:**
- Create: `components/program-camera-look.tsx`
- Modify: `components/program-scene.tsx`
- Modify: `tests/program-scene.test.ts`

- [ ] **Step 1: Write the failing wiring test**

In `tests/program-scene.test.ts` first `it`, after existing ProgramAudio assertions, add:

```ts
const lookHud = src(path.join("components", "program-camera-look.tsx"));
assert.match(scene, /ProgramCameraLook/);
assert.match(lookHud, /\/api\/overlay\/program-camera/);
assert.match(lookHud, /PROGRAM_CAMERA_POLL_MS/);
assert.match(lookHud, /x-growcast-capture/);
assert.match(lookHud, /isCameraLookMessage/);
assert.match(lookHud, /draftRef/);
assert.match(lookHud, /addEventListener\("message"/);
assert.match(lookHud, /event\.origin/);
assert.match(lookHud, /captureToken/);
assert.match(lookHud, /look=\{look\}/);
```

Assert capture page still has no draft sender:

```ts
const capture = src(path.join("app", "overlay", "capture", "page.tsx"));
assert.doesNotMatch(capture, /CAMERA_LOOK_DRAFT_EVENT/);
assert.doesNotMatch(capture, /postMessage/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-scene.test.ts
```

Expected: FAIL (`ProgramCameraLook` missing)

- [ ] **Step 3: Implement the client and mount it**

Create `components/program-camera-look.tsx`:

```tsx
"use client";

import {useEffect, useRef, useState, type ReactNode} from "react";
import OverlayHud from "@/components/overlay-hud";
import type {OverlayGrowView} from "@/lib/overlay-grow";
import {
    EMPTY_CAMERA_LOOK,
    PROGRAM_CAMERA_POLL_MS,
    isCameraLookMessage,
    parseCameraLook,
    type CameraLook,
} from "@/lib/restream/camera-look";

const PROGRAM_CAMERA_PATH = "/api/overlay/program-camera";

export default function ProgramCameraLook({
    captureToken,
    extra,
    ...hud
}: Omit<OverlayGrowView, "overlayStream"> & {
    lockStream?: boolean;
    extra?: ReactNode;
    captureToken?: string;
}) {
    const [look, setLook] = useState<CameraLook>(EMPTY_CAMERA_LOOK);
    const draftRef = useRef(false);
    const booth = captureToken === undefined;

    useEffect(() => {
        const abort = new AbortController();
        let cancelled = false;
        async function poll() {
            try {
                const headers: HeadersInit = {};
                if (captureToken) {
                    headers["x-growcast-capture"] = captureToken;
                }
                const response = await fetch(PROGRAM_CAMERA_PATH, {
                    credentials: "include",
                    cache: "no-store",
                    headers,
                    signal: abort.signal,
                });
                if (!response.ok || cancelled) {
                    return;
                }
                const next = parseCameraLook(await response.json());
                if (!cancelled && !draftRef.current) {
                    setLook(next);
                }
            } catch {
                // next interval retries
            }
        }
        void poll();
        const timer = window.setInterval(() => {
            void poll();
        }, PROGRAM_CAMERA_POLL_MS);
        return () => {
            cancelled = true;
            abort.abort();
            window.clearInterval(timer);
        };
    }, [captureToken]);

    useEffect(() => {
        if (!booth) {
            return;
        }
        function onMessage(event: MessageEvent) {
            if (event.origin !== window.location.origin) {
                return;
            }
            if (!isCameraLookMessage(event.data)) {
                return;
            }
            draftRef.current = true;
            setLook(parseCameraLook(event.data));
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [booth]);

    return (
        <OverlayHud
            {...hud}
            overlayStream="include"
            look={look}
            extra={extra}
        />
    );
}
```

`ProgramScene` currently passes `overlayStream="include"` into OverlayHud. Move that onto `ProgramCameraLook` as above. Replace `<OverlayHud ... />` in `components/program-scene.tsx` with `<ProgramCameraLook ... captureToken={captureToken} extra={...} />`. Keep `OverlayAlertLayer` and `ProgramAudio` as siblings.

Capture never sets `draftRef`, so polls always apply. After Apply the saved file matches the draft, so skipping booth polls is fine until reload. On booth reload, `draftRef` starts false and the poll loads saved.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-scene.test.ts
```

Expected: pass. Update any OverlayHud-only assertions in that file that the scene no longer matches.

- [ ] **Step 5: Commit**

```bash
git add components/program-camera-look.tsx components/program-scene.tsx tests/program-scene.test.ts
git commit -m "feat(program): poll camera look and accept booth drafts"
```

---

### Task 8: Broadcast Camera look panel + iframe bus

**Files:**
- Create: `app/admin/camera-look-panel.tsx`
- Modify: `app/admin/program-monitor.tsx`
- Modify: `app/admin/stream/page.tsx`
- Modify: `tests/program-monitor.test.ts`

The stream page is a **server** component; the panel and monitor are **clients**. Do not lift React state across them. Use `window` `CustomEvent` `CAMERA_LOOK_DRAFT_EVENT` (`growcast-camera-look-draft`) with `detail: CameraLook`. ProgramMonitor forwards that to `/program` via `postMessage`.

- [ ] **Step 1: Write the failing wiring test**

In `tests/program-monitor.test.ts` first `it`, add:

```ts
assert.match(monitor, /CAMERA_LOOK_DRAFT_EVENT/);
assert.match(monitor, /CAMERA_LOOK_MESSAGE_TYPE/);
assert.match(monitor, /postMessage/);
assert.match(monitor, /iframeRef/);
assert.match(page, /CameraLookPanel/);
const panel = readFileSync(
    path.join(process.cwd(), "app", "admin", "camera-look-panel.tsx"),
    "utf8",
);
assert.match(panel, /name="brightness"/);
assert.match(panel, /name="contrast"/);
assert.match(panel, /name="saturation"/);
assert.match(panel, /name="temperature"/);
assert.match(panel, /CAMERA_LOOK_MIN/);
assert.match(panel, /CAMERA_LOOK_MAX/);
assert.match(panel, /\/api\/admin\/camera-look/);
assert.match(panel, /CAMERA_LOOK_DRAFT_EVENT/);
assert.match(panel, /Reset/);
assert.match(panel, /Apply/);
assert.doesNotMatch(panel, /redirect/);
```

Also assert stream page order: Camera look appears before Music:

```ts
const cameraIdx = page.indexOf("CameraLookPanel");
const musicIdx = page.indexOf("MusicPanel");
assert.ok(cameraIdx >= 0 && musicIdx > cameraIdx);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-monitor.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement panel + monitor + page**

Create `app/admin/camera-look-panel.tsx`:

```tsx
"use client";

import {useState} from "react";
import {AdminButton, AdminPanel} from "@/components/admin/ui";
import {
    CAMERA_LOOK_DRAFT_EVENT,
    CAMERA_LOOK_MAX,
    CAMERA_LOOK_MIN,
    EMPTY_CAMERA_LOOK,
    parseCameraLook,
    type CameraLook,
} from "@/lib/restream/camera-look";

function formatLookValue(value: number, temperature = false): string {
    if (value === 0) {
        return "0";
    }
    const signed = value > 0 ? `+${value}` : String(value);
    if (!temperature) {
        return signed;
    }
    return `${signed} ${value > 0 ? "warm" : "cool"}`;
}

function dispatchDraft(look: CameraLook): void {
    window.dispatchEvent(new CustomEvent(CAMERA_LOOK_DRAFT_EVENT, {detail: look}));
}

function Slider({
    name,
    label,
    value,
    temperature = false,
    onChange,
}: {
    name: keyof CameraLook;
    label: string;
    value: number;
    temperature?: boolean;
    onChange: (name: keyof CameraLook, value: number) => void;
}) {
    return (
        <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase text-(--admin-subtle)">{label}</p>
                <p className="text-sm tabular-nums text-(--admin-text)">
                    {formatLookValue(value, temperature)}
                </p>
            </div>
            <input
                type="range"
                name={name}
                min={CAMERA_LOOK_MIN}
                max={CAMERA_LOOK_MAX}
                step={1}
                value={value}
                onChange={(event) => onChange(name, Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-(--admin-border) accent-zinc-300"
            />
        </div>
    );
}

export function CameraLookPanel({look}: {look: CameraLook}) {
    const [current, setCurrent] = useState<CameraLook>(look);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    function update(name: keyof CameraLook, value: number): void {
        const next = parseCameraLook({...current, [name]: value});
        setCurrent(next);
        dispatchDraft(next);
    }

    async function persist(next: CameraLook): Promise<void> {
        setBusy(true);
        setNotice(null);
        try {
            const response = await fetch("/api/admin/camera-look", {
                method: "POST",
                credentials: "include",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(next),
            });
            const raw: unknown = await response.json().catch(() => null);
            const ok = raw !== null && typeof raw === "object" && "ok" in raw && raw.ok === true;
            if (!response.ok || !ok) {
                setNotice("Could not save the camera look.");
            }
        } catch {
            setNotice("Could not save the camera look.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <AdminPanel id="camera-look" title="Camera look">
            <div className="space-y-4">
                <p className="text-xs text-(--admin-subtle)">
                    Grades the live cam only. HUD stays true.
                </p>
                <Slider name="brightness" label="Brightness" value={current.brightness} onChange={update} />
                <Slider name="contrast" label="Contrast" value={current.contrast} onChange={update} />
                <Slider name="saturation" label="Saturation" value={current.saturation} onChange={update} />
                <Slider
                    name="temperature"
                    label="Temperature"
                    value={current.temperature}
                    temperature
                    onChange={update}
                />
                {notice ? <p className="text-sm text-(--admin-muted)">{notice}</p> : null}
                <div className="flex gap-2">
                    <AdminButton
                        type="button"
                        tone="secondary"
                        disabled={busy}
                        onClick={() => {
                            setCurrent(EMPTY_CAMERA_LOOK);
                            dispatchDraft(EMPTY_CAMERA_LOOK);
                            void persist(EMPTY_CAMERA_LOOK);
                        }}
                    >
                        Reset
                    </AdminButton>
                    <AdminButton
                        type="button"
                        tone="primary"
                        disabled={busy}
                        onClick={() => {
                            void persist(current);
                        }}
                    >
                        Apply
                    </AdminButton>
                </div>
            </div>
        </AdminPanel>
    );
}
```

If `AdminButton` does not accept `onClick` / `disabled`, use a native `<button className={...}>` matching existing admin buttons (see `app/admin/alerts-panel.tsx` Connect Twitch link). Do not invent a new button API.

In `app/admin/program-monitor.tsx`, keep `iframeRef`. Add:

```ts
import {
    CAMERA_LOOK_DRAFT_EVENT,
    CAMERA_LOOK_MESSAGE_TYPE,
    parseCameraLook,
    type CameraLook,
} from "@/lib/restream/camera-look";
```

```ts
const draftRef = useRef<CameraLook | null>(null);

useEffect(() => {
    function send(look: CameraLook) {
        iframeRef.current?.contentWindow?.postMessage(
            {type: CAMERA_LOOK_MESSAGE_TYPE, ...look},
            window.location.origin,
        );
    }
    function onDraft(event: Event) {
        const look = parseCameraLook((event as CustomEvent).detail);
        draftRef.current = look;
        send(look);
    }
    window.addEventListener(CAMERA_LOOK_DRAFT_EVENT, onDraft);
    return () => window.removeEventListener(CAMERA_LOOK_DRAFT_EVENT, onDraft);
}, []);
```

On the iframe: `onLoad={() => { if (draftRef.current) { iframeRef.current?.contentWindow?.postMessage({type: CAMERA_LOOK_MESSAGE_TYPE, ...draftRef.current}, window.location.origin); } }}`. Never use `"*"` as targetOrigin.

`app/admin/stream/page.tsx`: import `CameraLookPanel` and `readCameraLook`. `const look = await readCameraLook();` (can fold into the existing `Promise.all`). Render `<CameraLookPanel look={look} />` **above** `<MusicPanel ... />`.

- [ ] **Step 4: Run tests**

Run:

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-monitor.test.ts tests/program-scene.test.ts tests/overlay-chrome.test.ts tests/camera-look.test.ts
```

Expected: pass

- [ ] **Step 5: Commit**

```bash
git add app/admin/camera-look-panel.tsx app/admin/program-monitor.tsx app/admin/stream/page.tsx tests/program-monitor.test.ts
git commit -m "feat(admin): add Camera look rack on Broadcast"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run the full suite**

```bash
npm test
```

Expected: all pass (count will be previous 491 plus the new cases).

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: compile + TypeScript succeed. Known NFT warning in `next.config.ts` is pre-existing; do not “fix” it in this work.

- [ ] **Step 3: Manual check (operator)**

On Broadcast: drag sliders — preview cam changes, HUD does not. Twitch/capture unchanged until Apply. Reset zeros preview and, after Apply/Reset POST, capture within 2s.

If the suite or build fails, fix in this task; do not open a new feature.

---

## Spec coverage

| Spec item | Task |
|---|---|
| −100…100 parse/clamp, zeros default | 1, 2 |
| CSS brightness/contrast/saturate mapping | 1, 5 |
| Temperature overlay colors/opacity/blend | 1, 5 |
| `camera-look.json` atomic 600 | 2 |
| GET auth 404 / no-store / four ints | 3 |
| POST CSRF + JSON, no redirect | 4 |
| Cam wrap under HUD, filter on iframe | 5 |
| OverlayHud `look` + public overlay SSR | 6 |
| Capture poll saved only | 7 |
| Booth `postMessage` draft, origin check | 7, 8 |
| Poll does not clobber draft | 7 |
| Camera look panel above Music, Apply/Reset | 8 |
| Reset writes zeros | 8 |
| No ffmpeg, no extra knobs | all |
