# Broadcast Music and Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Twitch restream play background music (files or URL) and show follow/sub/raid/bits plus manual alerts on a 1920×1080 program scene that Broadcast previews at the same picture and sound.

**Architecture:** One program document (camera + HUD + `<audio>` + alert layer) is loaded by Chromium capture and by a session-gated booth iframe (1920×1080 CSS-scaled). GrowCast owns `audio.json`, music files, alert queue/SSE, Twitch user OAuth, and EventSub webhooks. The restream sidecar only encodes X11 + Pulse audio (silent `anullsrc` fallback). Public `/overlay` and `/` stay quiet.

**Tech Stack:** Next.js 16 App Router, node:test, ffmpeg/Chromium/Pulse in `extensions/GrowCast-Restream`, Twitch Helix OAuth + EventSub HMAC, existing `data/restream/` JSON files (mode 600).

**Spec:** `docs/superpowers/specs/2026-09-07-broadcast-music-and-alerts-design.md`

**Test runner (single file):**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/<file>.test.ts
```

Do not use `npm test -- tests/foo` — the npm script already globs all tests.

---

## File map

| File | Responsibility |
|---|---|
| `lib/overlay-alert.ts` | Alert shape, opposite-HUD placement, FIFO queue cap 15 |
| `lib/overlay-alert-hub.ts` | In-memory queue + SSE listeners (single replica) |
| `lib/restream/paths.ts` | Paths for audio, music dir, alerts, oauth, eventsub secret |
| `lib/restream/audio.ts` | `audio.json` parse/read/write; resolve URL vs playlist |
| `lib/restream/music-files.ts` | List/save/delete tracks; type/size guards |
| `lib/restream/alerts-settings.ts` | `alerts.json` toggles + sting |
| `lib/restream/program-auth.ts` | Admin session **or** capture token |
| `lib/restream/twitch-oauth.ts` | Authorize URL, code exchange, refresh, token file |
| `lib/restream/eventsub.ts` | HMAC verify, challenge, map follow/sub/raid/cheer, subscribe |
| `components/program-scene.tsx` | OverlayHud + audio + alerts for 1080p |
| `components/program-audio.tsx` | Poll audio.json, play URL or playlist, duck for sting |
| `components/overlay-alert-layer.tsx` | One visible alert, opposite HUD |
| `app/overlay/capture/page.tsx` | Token-gated ProgramScene |
| `app/program/page.tsx` | Session-gated ProgramScene (no token in URL; own layout, no admin chrome) |
| `app/admin/program-monitor.tsx` | 1920×1080 iframe scaled into the booth |
| `app/admin/mixer-strip.tsx` | Play/pause, volume, now-playing, send alert |
| `app/admin/music-panel.tsx` | URL + uploads |
| `app/admin/alerts-panel.tsx` | Connect Twitch, event toggles, sting switch |
| `app/api/overlay/program-audio/route.ts` | GET audio state (program-auth) |
| `app/api/overlay/program-alerts/route.ts` | SSE alerts (program-auth) |
| `app/api/overlay/music/[filename]/route.ts` | GET track bytes (program-auth) |
| `app/api/admin/music/route.ts` | POST/DELETE tracks (admin, 25 MiB cap) |
| `app/api/twitch/eventsub/route.ts` | EventSub webhook |
| `app/admin/stream/twitch-connect/route.ts` | OAuth start |
| `app/admin/stream/twitch-callback/route.ts` | OAuth callback |
| `extensions/GrowCast-Restream/Dockerfile` | pulseaudio + pulseaudio-utils |
| `extensions/GrowCast-Restream/restream.py` | Pulse capture, `anullsrc` fallback |
| `docker-compose.yml` | Stop passing full `.env.local` into restream |
| `proxy.ts` / `lib/request-body-limit.ts` | Exclude music POST from 1 MiB cap |
| `app/admin/actions.ts` | Mixer, send alert, sting, audio URL |
| `lib/admin/notice.ts` | Music/oauth notices |
| Tests under `tests/` | node:test files named below |

---

### Task 1: Alert model, placement, queue

**Files:**
- Create: `lib/overlay-alert.ts`
- Test: `tests/overlay-alert.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    alertPlacement,
    enqueueOverlayAlert,
    type OverlayAlert,
} from "../lib/overlay-alert.ts";

function alert(id: string): OverlayAlert {
    return {id, kind: "manual", title: "Alert", body: id, createdAt: 0};
}

describe("alertPlacement", () => {
    it("puts alerts opposite the HUD", () => {
        assert.equal(alertPlacement("left-rail"), "bottom-right");
        assert.equal(alertPlacement("bottom-bar"), "top-center");
    });
});

describe("enqueueOverlayAlert", () => {
    it("is FIFO, one display at a time, cap 15 drops oldest", () => {
        let q: OverlayAlert[] = [];
        q = enqueueOverlayAlert(q, alert("a"));
        q = enqueueOverlayAlert(q, alert("b"));
        assert.deepEqual(q.map((x) => x.id), ["a", "b"]);
        for (let i = 0; i < 20; i++) {
            q = enqueueOverlayAlert(q, alert(`n${i}`));
        }
        assert.equal(q.length, 15);
        assert.equal(q[0].id, "n5");
        assert.equal(q[14].id, "n19");
    });

    it("does not enqueue empty manual body", () => {
        const q = enqueueOverlayAlert([], {
            id: "x",
            kind: "manual",
            title: "",
            body: "   ",
            createdAt: 1,
        });
        assert.deepEqual(q, []);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-alert.test.ts`

Expected: FAIL — cannot find module `../lib/overlay-alert.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
import type {OverlayLayout} from "@/lib/overlay-layout";

export const OVERLAY_ALERT_MAX_QUEUE = 15;
export const OVERLAY_ALERT_DISPLAY_MS = 6_000;

export type OverlayAlertKind = "follow" | "sub" | "raid" | "bits" | "manual";
export type OverlayAlertPlacement = "bottom-right" | "top-center";

export type OverlayAlert = {
    id: string;
    kind: OverlayAlertKind;
    title: string;
    body: string;
    createdAt: number;
};

export function alertPlacement(layout: OverlayLayout): OverlayAlertPlacement {
    return layout === "bottom-bar" ? "top-center" : "bottom-right";
}

export function enqueueOverlayAlert(
    queue: OverlayAlert[],
    alert: OverlayAlert,
): OverlayAlert[] {
    if (alert.kind === "manual" && alert.body.trim().length === 0) {
        return queue;
    }
    const next = [...queue, alert];
    if (next.length <= OVERLAY_ALERT_MAX_QUEUE) {
        return next;
    }
    return next.slice(next.length - OVERLAY_ALERT_MAX_QUEUE);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-alert.test.ts`

Expected: PASS (2 describes)

- [ ] **Step 5: Commit**

```bash
git add lib/overlay-alert.ts tests/overlay-alert.test.ts
git commit -m "feat: overlay alert placement and FIFO queue"
```

---

### Task 2: audio.json store

**Files:**
- Modify: `lib/restream/paths.ts`
- Create: `lib/restream/audio.ts`
- Test: `tests/restream-audio.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    EMPTY_RESTREAM_AUDIO,
    parseRestreamAudio,
    readRestreamAudio,
    resolveAudioSource,
    writeRestreamAudio,
} from "../lib/restream/audio.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-audio-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn(dir);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("parseRestreamAudio", () => {
    it("defaults missing audio to paused silence", () => {
        assert.deepEqual(parseRestreamAudio(null), EMPTY_RESTREAM_AUDIO);
        assert.equal(parseRestreamAudio({url: "https://x.example/a.mp3", volume: 0.5, paused: false}).url, "https://x.example/a.mp3");
        assert.equal(parseRestreamAudio({volume: 9}).volume, 1);
        assert.equal(parseRestreamAudio({volume: -1}).volume, 0);
    });
});

describe("resolveAudioSource", () => {
    it("prefers a non-empty URL over the playlist", () => {
        assert.equal(
            resolveAudioSource({url: "https://radio.example/stream", volume: 1, paused: false}, ["a.mp3"]),
            "https://radio.example/stream",
        );
        assert.equal(
            resolveAudioSource({url: "", volume: 1, paused: false}, ["b.ogg"]),
            "playlist",
        );
        assert.equal(
            resolveAudioSource({url: "   ", volume: 1, paused: false}, []),
            "silence",
        );
    });
});

describe("readRestreamAudio", () => {
    it("round-trips audio.json off grow JSON", async () => {
        await withTempDataDir(async (dir) => {
            await writeRestreamAudio({url: "", volume: 0.62, paused: true});
            const audio = await readRestreamAudio();
            assert.equal(audio.volume, 0.62);
            assert.equal(audio.paused, true);
            assert.equal(dir.includes("current-grow"), false);
        });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/restream-audio.test.ts`

Expected: FAIL — missing module

- [ ] **Step 3: Write paths + audio module**

Add to `lib/restream/paths.ts`:

```ts
export function restreamAudioFile(): string {
    return path.join(restreamDir(), "audio.json");
}

export function restreamMusicDir(): string {
    return path.join(restreamDir(), "music");
}

export function restreamAlertsFile(): string {
    return path.join(restreamDir(), "alerts.json");
}

export function restreamOAuthFile(): string {
    return path.join(restreamDir(), "twitch-oauth.json");
}

export function restreamEventsubSecretFile(): string {
    return path.join(restreamDir(), "eventsub.secret");
}
```

`lib/restream/audio.ts`:

```ts
import {chmod, readFile} from "node:fs/promises";
import {asBoolean, asNumber, asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {normalizeOptionalHttpUrl} from "@/lib/url-policy";
import {restreamAudioFile, restreamDir} from "@/lib/restream/paths";

export type RestreamAudio = {
    url: string;
    volume: number;
    paused: boolean;
};

export type AudioSourceKind = "url" | "playlist" | "silence";

export const EMPTY_RESTREAM_AUDIO: RestreamAudio = {
    url: "",
    volume: 0.7,
    paused: false,
};

export function parseRestreamAudio(raw: unknown): RestreamAudio {
    if (!isRecord(raw)) {
        return EMPTY_RESTREAM_AUDIO;
    }
    const url = normalizeOptionalHttpUrl(asString(raw.url)) ?? "";
    const volume = Math.min(1, Math.max(0, asNumber(raw.volume, EMPTY_RESTREAM_AUDIO.volume)));
    return {
        url,
        volume,
        paused: asBoolean(raw.paused, false),
    };
}

export function resolveAudioSource(audio: RestreamAudio, playlistNames: string[]): AudioSourceKind {
    if (audio.url.trim().length > 0) {
        return "url";
    }
    if (playlistNames.length > 0) {
        return "playlist";
    }
    return "silence";
}

export async function readRestreamAudio(): Promise<RestreamAudio> {
    try {
        return parseRestreamAudio(JSON.parse(await readFile(restreamAudioFile(), "utf8")));
    } catch {
        return EMPTY_RESTREAM_AUDIO;
    }
}

export async function writeRestreamAudio(audio: RestreamAudio): Promise<void> {
    const parsed = parseRestreamAudio(audio);
    await atomicWriteFile(restreamAudioFile(), `${JSON.stringify(parsed, null, 2)}\n`);
    await chmod(restreamDir(), 0o700).catch(() => undefined);
    await chmod(restreamAudioFile(), 0o600);
}
```

`normalizeOptionalHttpUrl` already exists in `lib/url-policy.ts`. If a non-http URL is stored, it becomes `""`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/restream-audio.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/restream/paths.ts lib/restream/audio.ts tests/restream-audio.test.ts
git commit -m "feat: restream audio.json for playlist or stream URL"
```

---

### Task 3: Music file library

**Files:**
- Create: `lib/restream/music-files.ts`
- Test: `tests/restream-music-files.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {
    MUSIC_EXTENSIONS,
    MUSIC_MAX_BYTES,
    MUSIC_MAX_FILES,
    listMusicFiles,
    saveMusicFile,
} from "../lib/restream/music-files.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-music-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn(dir);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("saveMusicFile", () => {
    it("accepts mp3 under cap and rejects traversal and extra files", async () => {
        await withTempDataDir(async () => {
            const ok = await saveMusicFile("loop.mp3", Buffer.from("ID3"));
            assert.equal(ok.ok, true);
            assert.deepEqual(await listMusicFiles(), ["loop.mp3"]);
            const bad = await saveMusicFile("../x.mp3", Buffer.from("ID3"));
            assert.equal(bad.ok, false);
            if (!bad.ok) {
                assert.equal(bad.error, "invalid_name");
            }
            const huge = await saveMusicFile("big.mp3", Buffer.alloc(MUSIC_MAX_BYTES + 1));
            assert.equal(huge.ok, false);
        });
    });

    it("lists in filename order", async () => {
        await withTempDataDir(async () => {
            await saveMusicFile("b.ogg", Buffer.from("OggS"));
            await saveMusicFile("a.wav", Buffer.from("RIFF"));
            assert.deepEqual(await listMusicFiles(), ["a.wav", "b.ogg"]);
        });
    });
});

describe("MUSIC_EXTENSIONS", () => {
    it("allows mp3 ogg wav m4a only", () => {
        assert.equal(MUSIC_EXTENSIONS.has(".mp3"), true);
        assert.equal(MUSIC_EXTENSIONS.has(".flac"), false);
        assert.equal(MUSIC_MAX_FILES, 30);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — missing module

- [ ] **Step 3: Write `lib/restream/music-files.ts`**

Use `isSafeMediaFilename(name, MUSIC_EXTENSIONS)` from `lib/safe-media-filename.ts`. `MUSIC_MAX_BYTES = 20 * 1024 * 1024`. `MUSIC_MAX_FILES = 30`. `saveMusicFile` mkdir `restreamMusicDir()`, chmod 700 on dir, 600 on file, atomic write via temp then rename (or `atomicWriteFile`). `listMusicFiles` readdir, filter safe names, sort. `deleteMusicFile` unlink after name check.

Return type: `{ok: true; filename: string} | {ok: false; error: "invalid_name" | "too_large" | "too_many"}`.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/restream/music-files.ts lib/safe-media-filename.ts tests/restream-music-files.test.ts
git commit -m "feat: restream music file library with type and size caps"
```

Only add `safe-media-filename.ts` if you export `MUSIC_EXTENSIONS` there; prefer keeping extensions in `music-files.ts` and passing the set into `isSafeMediaFilename`.

---

### Task 4: Program auth (session or capture token)

**Files:**
- Create: `lib/restream/program-auth.ts`
- Test: `tests/program-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {isProgramAuthorized} from "../lib/restream/program-auth.ts";
import {isRestreamCaptureAuthorized} from "../lib/restream/capture.ts";

describe("isProgramAuthorized", () => {
    it("allows capture token or admin session, denies neither", () => {
        assert.equal(isProgramAuthorized({admin: true, expectedToken: "tok", providedToken: ""}), true);
        assert.equal(
            isProgramAuthorized({
                admin: false,
                expectedToken: "tok",
                providedToken: "tok",
            }),
            isRestreamCaptureAuthorized("tok", "tok"),
        );
        assert.equal(
            isProgramAuthorized({admin: false, expectedToken: "tok", providedToken: "nope"}),
            false,
        );
        assert.equal(
            isProgramAuthorized({admin: false, expectedToken: "", providedToken: "tok"}),
            false,
        );
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — missing module

- [ ] **Step 3: Implement**

```ts
import {isRestreamCaptureAuthorized} from "@/lib/restream/capture";

export function isProgramAuthorized(input: {
    admin: boolean;
    expectedToken: string | undefined;
    providedToken: string | undefined;
}): boolean {
    if (input.admin) {
        return true;
    }
    return isRestreamCaptureAuthorized(input.expectedToken, input.providedToken);
}

export function captureTokenFromRequest(request: Request): string | undefined {
    const header = request.headers.get("x-growcast-capture")?.trim();
    if (header) {
        return header;
    }
    const url = new URL(request.url);
    const query = url.searchParams.get("token")?.trim();
    return query || undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/restream/program-auth.ts tests/program-auth.test.ts
git commit -m "feat: authorize program audio and alerts for admin or capture"
```

---

### Task 5: 1920×1080 program scale helper + booth monitor

**Files:**
- Create: `lib/program-monitor.ts`
- Create: `app/admin/program-monitor.tsx`
- Modify: `app/admin/stream/page.tsx` (replace `StreamPreview` with `ProgramMonitor`)
- Modify: `app/admin/stream-preview.tsx` — leave file but unused, or delete after tests updated
- Test: `tests/program-monitor.test.ts`
- Modify: `tests/broadcast-dashboard.test.ts` (monitor assertions)

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {PROGRAM_HEIGHT, PROGRAM_WIDTH, programScale} from "../lib/program-monitor.ts";

describe("programScale", () => {
    it("fits 1920x1080 into a smaller box without stretching", () => {
        assert.equal(PROGRAM_WIDTH, 1920);
        assert.equal(PROGRAM_HEIGHT, 1080);
        assert.equal(programScale(960, 540), 0.5);
        assert.equal(programScale(1920, 400), 400 / 1080);
    });
});

describe("program monitor wiring", () => {
    it("iframes the session program route at 1920x1080, not OverlayHud in a fluid box", () => {
        const monitor = readFileSync(
            path.join(process.cwd(), "app", "admin", "program-monitor.tsx"),
            "utf8",
        );
        const page = readFileSync(
            path.join(process.cwd(), "app", "admin", "stream", "page.tsx"),
            "utf8",
        );
        assert.match(monitor, /src="\/program"/);
        assert.match(monitor, /1920/);
        assert.match(monitor, /1080/);
        assert.doesNotMatch(monitor, /token=/);
        assert.match(page, /ProgramMonitor/);
        assert.doesNotMatch(page, /StreamPreview/);
        assert.doesNotMatch(page, /capture\?token/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — missing `lib/program-monitor.ts` and `ProgramMonitor`

- [ ] **Step 3: Implement scale + client iframe**

`lib/program-monitor.ts`:

```ts
export const PROGRAM_WIDTH = 1920;
export const PROGRAM_HEIGHT = 1080;

export function programScale(containerWidth: number, containerHeight: number): number {
    if (containerWidth <= 0 || containerHeight <= 0) {
        return 0;
    }
    return Math.min(containerWidth / PROGRAM_WIDTH, containerHeight / PROGRAM_HEIGHT);
}
```

`app/admin/program-monitor.tsx` — client component: `aspect-video` letterbox container, `ResizeObserver`, inner iframe `src="/program"` `width={1920}` `height={1080}` `style={{transform: \`scale(${scale})\`, transformOrigin: "top left"}}`, wrapper sized `1920*scale` × `1080*scale`. `allow="autoplay"`. No query token.

`/program` must not sit under `app/admin` (admin chrome would appear in the iframe). Add `app/program/layout.tsx` like `app/overlay/layout.tsx` (no SiteHeader, `h-[1080px] w-[1920px] overflow-hidden bg-black`) and `app/program/page.tsx` that calls `isAdminAuthenticated()` else `notFound()`. For this task render existing `OverlayHud` include+lockStream full viewport. Task 6 swaps in `ProgramScene`.

Update `app/admin/stream/page.tsx`: import `ProgramMonitor` instead of `StreamPreview`. Always mount `ProgramMonitor`.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-monitor.test.ts tests/broadcast-dashboard.test.ts
```

Expected: PASS. Update `tests/broadcast-dashboard.test.ts` “Monitor OverlayHud include+lockStream” to assert `ProgramMonitor` and `src="/program"` instead of `StreamPreview`.

- [ ] **Step 5: Commit**

```bash
git add lib/program-monitor.ts app/admin/program-monitor.tsx app/admin/stream/page.tsx app/program tests/program-monitor.test.ts tests/broadcast-dashboard.test.ts
git commit -m "feat: scale a 1920x1080 program iframe in Broadcast"
```

---

### Task 6: ProgramScene on capture and booth preview

**Files:**
- Create: `components/program-scene.tsx`
- Modify: `app/overlay/capture/page.tsx`
- Modify: `app/program/page.tsx`
- Test: `tests/program-scene.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("program scene", () => {
    it("is shared by capture and session preview", () => {
        const scene = src(path.join("components", "program-scene.tsx"));
        const capture = src(path.join("app", "overlay", "capture", "page.tsx"));
        const preview = src(path.join("app", "program", "page.tsx"));
        assert.match(scene, /OverlayHud/);
        assert.match(scene, /lockStream/);
        assert.match(capture, /ProgramScene/);
        assert.match(preview, /ProgramScene/);
        assert.match(preview, /isAdminAuthenticated/);
        assert.doesNotMatch(preview, /token/);
        assert.match(capture, /isRestreamCaptureAuthorized/);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — `ProgramScene` not found

- [ ] **Step 3: Implement**

`components/program-scene.tsx` — wrapper with the same grow props as `OverlayHud` plus optional `captureToken`. Root: `relative h-full w-full`. Child: `OverlayHud` with `overlayStream="include"` `lockStream`. Task 7/10 add `ProgramAudio` and `OverlayAlertLayer` here.

`app/program/page.tsx` and `app/overlay/capture/page.tsx` both render `<ProgramScene ... />`. Preview: `isAdminAuthenticated()` else `notFound()`, no token in the URL. Capture: existing token check. `app/program/layout.tsx` already from Task 5 (overlay-style, 1920×1080, no SiteHeader).

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-scene.test.ts tests/program-monitor.test.ts tests/overlay-chrome.test.ts
```

Expected: PASS. Add overlay-chrome assertion that `/program` is not in public nav.

- [ ] **Step 5: Commit**

```bash
git add components/program-scene.tsx app/program/page.tsx app/overlay/capture/page.tsx tests/program-scene.test.ts tests/overlay-chrome.test.ts
git commit -m "feat: share ProgramScene between capture and booth preview"
```

---

### Task 7: GET program audio API + poll client

**Files:**
- Create: `app/api/overlay/program-audio/route.ts`
- Create: `app/api/overlay/music/[filename]/route.ts`
- Create: `components/program-audio.tsx`
- Modify: `components/program-scene.tsx` to mount `ProgramAudio`
- Modify: `lib/request-body-limit.ts` not needed yet
- Test: `tests/program-audio-http.test.ts`

- [ ] **Step 1: Write the failing test**

Cover: unauthenticated GET 404; with capture token returns `{volume, paused, kind, url}` where kind is url|playlist|silence; playlist names filename-sorted; music GET rejects `../`.

Use the same pattern as `tests/ggs-live-http.test.ts` if it constructs Request objects against exported handlers. Export `programAudioGetResponse(request)` from a lib (`lib/restream/program-http.ts`) so tests do not import `next/headers`.

```ts
// tests/program-audio-http.test.ts
import assert from "node:assert/strict";
import {mkdtemp, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {programAudioGetResponse} from "../lib/restream/program-http.ts";
import {writeRestreamAudio} from "../lib/restream/audio.ts";
import {saveMusicFile} from "../lib/restream/music-files.ts";
import {ensureRestreamCaptureToken} from "../lib/restream/capture.ts";

describe("programAudioGetResponse", () => {
    it("denies without auth and lists playlist when url is empty", async () => {
        const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-pa-"));
        process.env.GROWCAST_DATA_DIR = dir;
        try {
            const token = await ensureRestreamCaptureToken();
            await writeRestreamAudio({url: "", volume: 0.5, paused: false});
            await saveMusicFile("z.mp3", Buffer.from("ID3"));
            const denied = await programAudioGetResponse(
                new Request("http://local/api/overlay/program-audio"),
                {admin: false},
            );
            assert.equal(denied.status, 404);
            const ok = await programAudioGetResponse(
                new Request("http://local/api/overlay/program-audio", {
                    headers: {"x-growcast-capture": token},
                }),
                {admin: false},
            );
            assert.equal(ok.status, 200);
            const body = await ok.json();
            assert.equal(body.kind, "playlist");
            assert.deepEqual(body.files, ["z.mp3"]);
            assert.equal(body.volume, 0.5);
        } finally {
            delete process.env.GROWCAST_DATA_DIR;
            await rm(dir, {recursive: true, force: true});
        }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — missing `program-http.ts`

- [ ] **Step 3: Implement `lib/restream/program-http.ts` + route wrappers**

`programAudioGetResponse` uses `captureTokenFromRequest` + `isProgramAuthorized`. 404 on deny (same as capture `notFound`). JSON never includes disk paths — only filenames. `url` field is the radio URL when kind is `url`.

Music GET: `openMediaFile`-style using `restreamMusicDir()` + `MUSIC_EXTENSIONS`. 404 on deny or bad name.

`components/program-audio.tsx` client: poll `GET /api/overlay/program-audio` every 2000ms with `credentials: "include"` and optional `x-growcast-capture` from `?token=` on capture. Hidden `<audio>`: if kind url, `src=url`; if playlist, cycle ` /api/overlay/music/${file}` with credentials (capture: add `?token=`). Honor `paused` and `volume`. `onEnded` advance playlist index.

Pass `captureToken` from capture page searchParams into ProgramScene → ProgramAudio.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-audio-http.test.ts tests/program-scene.test.ts
```

Expected: PASS. Extend program-scene test to assert `ProgramAudio` is imported.

- [ ] **Step 5: Commit**

```bash
git add lib/restream/program-http.ts app/api/overlay/program-audio/route.ts app/api/overlay/music components/program-audio.tsx components/program-scene.tsx tests/program-audio-http.test.ts tests/program-scene.test.ts
git commit -m "feat: program audio poll for URL or playlist"
```

---

### Task 8: Mixer strip + audio admin actions

**Files:**
- Create: `app/admin/mixer-strip.tsx`
- Modify: `app/admin/actions.ts`
- Modify: `app/admin/stream/page.tsx` (strip under monitor)
- Modify: `lib/admin/notice.ts` + `app/admin/admin-notice.tsx` + `tests/admin-notice.test.ts` (`audio_saved`, `alert_sent`)
- Test: `tests/mixer-strip.test.ts`

- [ ] **Step 1: Write the failing test**

Source-read `app/admin/stream/page.tsx` and `app/admin/mixer-strip.tsx`: strip under monitor, fields `paused` `volume` `alertBody`, actions `saveProgramAudioAction` `sendProgramAlertAction`. `tests/restream-audio.test.ts` already covers write; add action-level test that `writeRestreamAudio` is what the action should call — keep a unit test that pause+volume persist:

In `tests/restream-audio.test.ts` add:

```ts
it("clamps volume and stores paused for the mixer", async () => {
    await withTempDataDir(async () => {
        await writeRestreamAudio({url: "", volume: 0.2, paused: true});
        const audio = await readRestreamAudio();
        assert.equal(audio.paused, true);
        assert.equal(audio.volume, 0.2);
    });
});
```

Chrome test:

```ts
it("puts MixerStrip under ProgramMonitor, not in the Twitch rack", () => {
    const page = src(path.join("app", "admin", "stream", "page.tsx"));
    assert.match(page, /ProgramMonitor/);
    assert.match(page, /MixerStrip/);
    const twitch = src(path.join("app", "admin", "restream-panel.tsx"));
    assert.doesNotMatch(twitch, /MixerStrip/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL on MixerStrip match

- [ ] **Step 3: Implement mixer + actions**

`saveProgramAudioAction`: `requireAdmin`, parse `volume` 0–1, `paused` from checkbox, keep existing `url` from `readRestreamAudio()`, `writeRestreamAudio`, `revalidatePath("/admin/stream")`, `revalidatePath("/program")`, `revalidatePath("/overlay/capture")`, redirect `audio_saved`.

`sendProgramAlertAction` stub: requireAdmin, trim body; if empty redirect `save_failed`; else redirect `alert_sent` (hub in Task 10). For now still write a failing-friendly stub that only validates empty — **do not enqueue yet** if hub is missing; Task 10 wires enqueue. Mixer can include the text field now.

Layout in `stream/page.tsx`:

```tsx
<div>
  <ProgramMonitor />
  <MixerStrip audio={audio} />
</div>
```

Load `readRestreamAudio()` in the page.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/mixer-strip.test.ts tests/restream-audio.test.ts tests/admin-notice.test.ts tests/broadcast-dashboard.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/admin/mixer-strip.tsx app/admin/actions.ts app/admin/stream/page.tsx lib/admin/notice.ts app/admin/admin-notice.tsx tests/mixer-strip.test.ts tests/admin-notice.test.ts tests/restream-audio.test.ts
git commit -m "feat: Broadcast mixer strip for volume pause and send alert"
```

---

### Task 9: Music rack + upload route

**Files:**
- Create: `app/admin/music-panel.tsx`
- Create: `app/api/admin/music/route.ts`
- Modify: `proxy.ts` matcher to exclude `/api/admin/music`
- Modify: `lib/request-body-limit.ts` — POST `/api/admin/music` cap `25 * 1024 * 1024`
- Modify: `app/admin/actions.ts` — `saveProgramAudioUrlAction`
- Modify: `app/admin/stream/page.tsx` — render `MusicPanel`
- Test: `tests/request-body-limit.test.ts` (add music path)
- Test: `tests/admin-music-route.test.ts`

- [ ] **Step 1: Write failing tests**

Extend `maxBodyBytesFor("POST", "/api/admin/music")` === 25 MiB.

`admin-music-route.test.ts`: `applyMusicPost` helper in `lib/admin/apply-music-post.ts` (mirrors media): intent upload/delete, same-origin not needed inside helper. Upload valid mp3 → listed; `../x.mp3` → invalid_name; 31st file → too_many.

- [ ] **Step 2: Run tests to verify they fail**

Expected: FAIL

- [ ] **Step 3: Implement apply-music-post, route, panel, URL save**

Route: `isAdminAuthenticated`, `isSameOriginRequest`, 413 via cap, FormData `intent` `file` `filename`. Redirect notices: `music_uploaded`, `music_deleted`, `music_invalid_file`, `music_too_many_files`, `music_payload_too_large`.

Music panel: URL input (form `saveProgramAudioUrlAction`), file input POST to `/api/admin/music`, list with delete buttons. Hint: URL wins while set.

`proxy.ts` matcher: add `api/admin/music` next to `api/admin/media`.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/request-body-limit.test.ts tests/admin-music-route.test.ts tests/mixer-strip.test.ts
```

Expected: PASS. Mixer-strip test should also match `MusicPanel` on the stream page.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/apply-music-post.ts app/api/admin/music/route.ts app/admin/music-panel.tsx proxy.ts lib/request-body-limit.ts app/admin/actions.ts app/admin/stream/page.tsx lib/admin/notice.ts app/admin/admin-notice.tsx tests/request-body-limit.test.ts tests/admin-music-route.test.ts tests/mixer-strip.test.ts tests/admin-notice.test.ts
git commit -m "feat: Broadcast music rack for URL and uploaded tracks"
```

---

### Task 10: Alert hub, SSE, overlay layer, send alert

**Files:**
- Create: `lib/overlay-alert-hub.ts`
- Create: `lib/overlay-alert-http.ts` (`programAlertsSseResponse`)
- Create: `app/api/overlay/program-alerts/route.ts`
- Create: `components/overlay-alert-layer.tsx`
- Modify: `components/program-scene.tsx`
- Modify: `app/admin/actions.ts` `sendProgramAlertAction` → `publishOverlayAlert`
- Test: `tests/overlay-alert-hub.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {enqueueOverlayAlert, type OverlayAlert} from "../lib/overlay-alert.ts";
import {
    _resetOverlayAlertHubForTests,
    peekOverlayAlertQueue,
    publishOverlayAlert,
    takeNextOverlayAlert,
} from "../lib/overlay-alert-hub.ts";

describe("overlay alert hub", () => {
    it("publishes FIFO and takeNext pops the current head", () => {
        _resetOverlayAlertHubForTests();
        const a: OverlayAlert = {id: "1", kind: "follow", title: "Follow", body: "x", createdAt: 1};
        const b: OverlayAlert = {id: "2", kind: "sub", title: "Sub", body: "y", createdAt: 2};
        publishOverlayAlert(a);
        publishOverlayAlert(b);
        assert.equal(peekOverlayAlertQueue().length, 2);
        assert.equal(takeNextOverlayAlert()?.id, "1");
        assert.equal(peekOverlayAlertQueue()[0].id, "2");
    });

    it("drops oldest at cap 15", () => {
        _resetOverlayAlertHubForTests();
        for (let i = 0; i < 16; i++) {
            publishOverlayAlert({
                id: String(i),
                kind: "bits",
                title: "Bits",
                body: String(i),
                createdAt: i,
            });
        }
        assert.equal(peekOverlayAlertQueue().length, 15);
        assert.equal(peekOverlayAlertQueue()[0].id, "1");
    });
});
```

Use `enqueueOverlayAlert` inside `publishOverlayAlert`. Do not duplicate cap logic.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — missing hub

- [ ] **Step 3: Implement hub + SSE + layer**

Hub: module-level queue + `Set` of listeners; `publishOverlayAlert` enqueues, notifies listeners with the new alert (for SSE). `takeNextOverlayAlert` is for a display client that owns the 6s timer — **simpler:** SSE sends each published alert; the client displays 6s and ignores extras while busy, **or** client holds local FIFO.

Spec: server queue cap 15, one on screen 6s. Server should send the next event when the client is ready, but SSE is fire-and-forget.

**Chosen behavior:** SSE emits every published alert. Client (`overlay-alert-layer.tsx`) keeps a local FIFO, shows head 6000ms, then shifts. If local queue > 15, drop oldest (same helper). Server hub still caps so EventSub cannot unbounded-buffer.

SSE: `programAlertsSseResponse(request, {admin})` — 404 if unauthorized; `text/event-stream`; write `data: ${JSON.stringify(alert)}\n\n`; heartbeat comment every 15s. Unsubscribe on abort.

`overlay-alert-layer.tsx`: EventSource `/api/overlay/program-alerts` (capture: `?token=`). Placement from `alertPlacement(layout)`. Position classes: `absolute z-20` + `bottom-8 right-8` or `top-8 left-1/2 -translate-x-1/2`. Dark panel matching `OVERLAY_PANEL_CLASS`. `prefers-reduced-motion`: no animation required.

`sendProgramAlertAction`: `randomUUID()`, `publishOverlayAlert({kind:"manual", title:"Alert", body: trimmed, createdAt: Date.now(), id})`.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/overlay-alert-hub.test.ts tests/overlay-alert.test.ts tests/program-scene.test.ts
```

Expected: PASS. program-scene test asserts `OverlayAlertLayer`.

- [ ] **Step 5: Commit**

```bash
git add lib/overlay-alert-hub.ts lib/overlay-alert-http.ts app/api/overlay/program-alerts/route.ts components/overlay-alert-layer.tsx components/program-scene.tsx app/admin/actions.ts tests/overlay-alert-hub.test.ts tests/program-scene.test.ts
git commit -m "feat: program alert SSE and manual Send alert"
```

---

### Task 11: alerts.json + Alerts rack (toggles + sting)

**Files:**
- Create: `lib/restream/alerts-settings.ts`
- Create: `app/admin/alerts-panel.tsx`
- Modify: `app/admin/actions.ts` `saveAlertsSettingsAction`
- Modify: `app/admin/stream/page.tsx`
- Modify: `lib/overlay-alert-hub.ts` — skip Twitch kinds when toggle off (manual always on)
- Test: `tests/alerts-settings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    EMPTY_ALERTS_SETTINGS,
    parseAlertsSettings,
    shouldEnqueueKind,
} from "../lib/restream/alerts-settings.ts";

describe("parseAlertsSettings", () => {
    it("defaults sting on and all twitch kinds on", () => {
        assert.equal(EMPTY_ALERTS_SETTINGS.stingEnabled, true);
        assert.equal(parseAlertsSettings(null).follow, true);
        assert.equal(shouldEnqueueKind(parseAlertsSettings({follow: false}), "follow"), false);
        assert.equal(shouldEnqueueKind(parseAlertsSettings({follow: false}), "manual"), true);
        assert.equal(parseAlertsSettings({stingEnabled: false}).stingEnabled, false);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement settings + panel + filter in publish**

`publishOverlayAlert` reads settings (async is annoying in hub). Keep hub sync: `publishOverlayAlert(alert, settings?: AlertsSettings)` and callers load settings. EventSub and send-alert pass `await readAlertsSettings()`.

Panel: Connect Twitch placeholder button linking to `/admin/stream/twitch-connect` (404 until Task 12). Checkboxes follow/sub/raid/bits. Alert sound switch default on.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/alerts-settings.test.ts tests/overlay-alert-hub.test.ts tests/mixer-strip.test.ts
```

Expected: PASS. Mixer-strip/page test asserts `AlertsPanel`.

- [ ] **Step 5: Commit**

```bash
git add lib/restream/alerts-settings.ts lib/overlay-alert-hub.ts app/admin/alerts-panel.tsx app/admin/actions.ts app/admin/stream/page.tsx tests/alerts-settings.test.ts tests/mixer-strip.test.ts
git commit -m "feat: Broadcast alerts rack with sting switch and event toggles"
```

---

### Task 12: Twitch user OAuth

**Files:**
- Create: `lib/restream/twitch-oauth.ts`
- Create: `app/admin/stream/twitch-connect/route.ts`
- Create: `app/admin/stream/twitch-callback/route.ts`
- Modify: `app/admin/alerts-panel.tsx` — connected state
- Test: `tests/twitch-oauth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    TWITCH_OAUTH_SCOPES,
    buildTwitchAuthorizeUrl,
    parseTwitchOAuthFile,
} from "../lib/restream/twitch-oauth.ts";

describe("Twitch OAuth", () => {
    it("uses only follow sub bits scopes and stores refresh off grow JSON", () => {
        assert.deepEqual(TWITCH_OAUTH_SCOPES, [
            "moderator:read:followers",
            "channel:read:subscriptions",
            "bits:read",
        ]);
        const url = buildTwitchAuthorizeUrl({
            clientId: "abc",
            redirectUri: "https://grow.example/admin/stream/twitch-callback",
            state: "st",
        });
        assert.match(url, /id\.twitch\.tv\/oauth2\/authorize/);
        assert.match(url, /client_id=abc/);
        assert.match(url, /state=st/);
        const parsed = parseTwitchOAuthFile({
            accessToken: "a",
            refreshToken: "r",
            userId: "1",
            login: "0xmarcel",
        });
        assert.equal(parsed?.login, "0xmarcel");
        assert.equal(parseTwitchOAuthFile(null), null);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement**

`buildTwitchAuthorizeUrl`: `response_type=code`, `scope` space-joined encoded, `redirect_uri`.

`exchangeTwitchCode` / `refreshTwitchToken`: POST `https://id.twitch.tv/oauth2/token` with client id/secret from env (same as helix). Inject `fetcher` for tests.

Connect route: `requireAdmin`, random `state` 32 bytes hex, httpOnly cookie `growcast_twitch_oauth_state` (Secure from `shouldUseSecureCookie`, SameSite=Lax, Path=/admin/stream/twitch-callback, max-age 600). Redirect to authorize URL. Redirect URI = `shareCardMetadataOrigin(headers())` + `/admin/stream/twitch-callback`.

Callback: validate state vs cookie (clear cookie), exchange code, write `twitch-oauth.json` mode 600 via `atomicWriteFile`+`chmod`. On failure redirect `twitch_oauth_failed`. Success `twitch_connected` then Task 13 subscribe.

Do not log tokens. `sanitizeError` on failures.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/twitch-oauth.test.ts tests/admin-notice.test.ts
```

Expected: PASS after adding notice ids `twitch_connected`, `twitch_oauth_failed`, `twitch_need_connect`.

- [ ] **Step 5: Commit**

```bash
git add lib/restream/twitch-oauth.ts app/admin/stream/twitch-connect/route.ts app/admin/stream/twitch-callback/route.ts app/admin/alerts-panel.tsx lib/admin/notice.ts app/admin/admin-notice.tsx tests/twitch-oauth.test.ts tests/admin-notice.test.ts
git commit -m "feat: Connect Twitch OAuth for EventSub scopes"
```

---

### Task 13: EventSub verify, map, webhook, subscribe

**Files:**
- Create: `lib/restream/eventsub.ts`
- Create: `app/api/twitch/eventsub/route.ts`
- Modify: twitch-callback to call `ensureEventsubSubscriptions`
- Test: `tests/eventsub.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {createHmac} from "node:crypto";
import {describe, it} from "node:test";
import {
    EVENTSUB_TYPES,
    mapEventsubNotification,
    verifyEventsubSignature,
} from "../lib/restream/eventsub.ts";

function sign(secret: string, id: string, ts: string, body: string): string {
    const hmac = createHmac("sha256", secret);
    hmac.update(id + ts + body);
    return `sha256=${hmac.digest("hex")}`;
}

describe("verifyEventsubSignature", () => {
    it("accepts a valid hmac and rejects a bad one", () => {
        const body = "{\"ok\":true}";
        const id = "id1";
        const ts = "123";
        const secret = "s3cret";
        assert.equal(
            verifyEventsubSignature({
                secret,
                messageId: id,
                timestamp: ts,
                body,
                signature: sign(secret, id, ts, body),
            }),
            true,
        );
        assert.equal(
            verifyEventsubSignature({
                secret,
                messageId: id,
                timestamp: ts,
                body,
                signature: "sha256=deadbeef",
            }),
            false,
        );
    });
});

describe("mapEventsubNotification", () => {
    it("maps follow sub raid cheer", () => {
        assert.equal(mapEventsubNotification("channel.follow", {user_name: "Ada"} )?.kind, "follow");
        assert.equal(mapEventsubNotification("channel.subscribe", {user_name: "Ada"})?.kind, "sub");
        assert.equal(mapEventsubNotification("channel.raid", {from_broadcaster_user_name: "Ada"})?.kind, "raid");
        assert.equal(mapEventsubNotification("channel.cheer", {user_name: "Ada", bits: 100})?.kind, "bits");
        assert.equal(mapEventsubNotification("channel.chat.message", {}), null);
        assert.deepEqual(EVENTSUB_TYPES, [
            "channel.follow",
            "channel.subscribe",
            "channel.raid",
            "channel.cheer",
        ]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL

- [ ] **Step 3: Implement verify (timing-safe), mapping, route**

`verifyEventsubSignature`: if any field empty, false. Compute hmac, compare with `safeEqualText` after normalizing `sha256=` prefix. Use hex digest.

`mapEventsubNotification`: return `Omit<OverlayAlert, "id" | "createdAt"> | null`. Titles: Follow / Sub / Raid / Bits. Bodies from user_name / bits count / raid viewer_count.

Route `POST`: read **raw** `await request.text()` first. Headers `Twitch-Eventsub-Message-Id`, `Twitch-Eventsub-Message-Timestamp`, `Twitch-Eventsub-Message-Signature`, `Twitch-Eventsub-Message-Type`. Load secret from `restreamEventsubSecretFile()` (create on first subscribe with `randomBytes(32).toString("hex")`). Invalid sig → 403. Type `webhook_callback_verification` → 200 text/plain challenge. Type `notification` → parse JSON `subscription.type` + `event`, map, `publishOverlayAlert` if `shouldEnqueueKind`. Type `revocation` → 204. No grow JSON writes.

`ensureEventsubSubscriptions(origin, fetcher)`: Helix POST `https://api.twitch.tv/helix/eventsub/subscriptions` for each type with `transport.method=webhook`, `callback=${origin}/api/twitch/eventsub`, `secret`. `channel.follow` version `2` with `broadcaster_user_id` + `moderator_user_id` = oauth userId. Others version `1` with `broadcaster_user_id`. Inject fetcher in tests.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/eventsub.test.ts tests/overlay-alert-hub.test.ts
```

Add a test that a signed notification publishes into the hub (reset hub, call handler with mocked secret file in temp data dir).

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/restream/eventsub.ts app/api/twitch/eventsub/route.ts lib/restream/twitch-oauth.ts app/admin/stream/twitch-callback/route.ts tests/eventsub.test.ts
git commit -m "feat: Twitch EventSub webhooks for follow sub raid bits"
```

---

### Task 14: Pulse audio in the restream sidecar

**Files:**
- Modify: `extensions/GrowCast-Restream/Dockerfile`
- Modify: `extensions/GrowCast-Restream/restream.py`
- Modify: `docker-compose.yml` restream `env_file` — remove full `.env.local`; keep `GROWCAST_URL`, `TWITCH_INGEST`, optional `GROWCAST_RESTREAM_TOKEN`, `GROWCAST_RESTREAM_STREAM_URL` via `environment:` only if set
- Test: `tests/restream.test.ts` (source assertions)

- [ ] **Step 1: Write the failing test**

In `tests/restream.test.ts` (existing source-read style):

```ts
it("captures pulse audio and falls back to anullsrc", () => {
    const py = readFileSync(path.join(process.cwd(), "extensions", "GrowCast-Restream", "restream.py"), "utf8");
    const docker = readFileSync(path.join(process.cwd(), "extensions", "GrowCast-Restream", "Dockerfile"), "utf8");
    assert.match(docker, /pulseaudio/);
    assert.match(py, /pulse/);
    assert.match(py, /anullsrc/);
    assert.match(py, /--autoplay-policy=no-user-gesture-required/);
});

it("does not load GrowCast .env.local into restream", () => {
    const compose = readFileSync(path.join(process.cwd(), "docker-compose.yml"), "utf8");
    // restream service block must not use env_file: .env.local
    const restream = compose.split("restream:")[1]?.split("\n  ")[0] ?? compose;
    assert.equal(compose.includes("GROWCAST_URL: http://growcast:3000"), true);
});
```

Make the compose assertion precise: after implementing, `restream:` section has no `path: .env.local`.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — no pulseaudio in Dockerfile

- [ ] **Step 3: Implement**

Dockerfile: `pulseaudio` `pulseaudio-utils` packages. Entry: start `pulseaudio --exit-idle-time=-1` as user 1001 before python, or start it in `restream.py`.

Chromium: add `--alsa-output-device=pulse` is wrong on Pulse; use default Pulse + `--autoplay-policy=no-user-gesture-required` (already present). Env `PULSE_SERVER=unix:/tmp/pulse-socket` if needed.

ffmpeg: try `-f pulse -i default` for audio; on spawn failure or missing pulse, log and use existing `anullsrc=channel_layout=stereo:sample_rate=44100`. Keep video `x11grab` 1920x1080 15fps. Keep AAC. Do **not** copy `os.environ` into Chromium beyond `DISPLAY` (and `PULSE_SERVER` / `XDG_RUNTIME_DIR` if required). That matches the earlier review.

`docker-compose.yml` restream:

```yaml
    environment:
      GROWCAST_URL: http://growcast:3000
      TWITCH_INGEST: ${TWITCH_INGEST:-rtmps://live.twitch.tv:443/app}
      GROWCAST_RESTREAM_TOKEN: ${GROWCAST_RESTREAM_TOKEN:-}
      GROWCAST_RESTREAM_STREAM_URL: ${GROWCAST_RESTREAM_STREAM_URL:-}
```

Remove `env_file` from restream. Empty token must remain falsy so `capture.token` still wins (`GROWCAST_RESTREAM_TOKEN:-` empty string — Python `os.environ.get(...).strip()` empty → file token). Confirm `capture_token()` treats `""` as missing (it does).

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/restream.test.ts tests/admin-settings-split.test.ts
```

`admin-settings-split.test.ts` already asserts compose does not interpolate restream token into a required env in a bad way — update if it expected `env_file: .env.local` on restream.

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add extensions/GrowCast-Restream/Dockerfile extensions/GrowCast-Restream/restream.py docker-compose.yml tests/restream.test.ts tests/admin-settings-split.test.ts
git commit -m "feat: capture Chromium Pulse audio on restream, silent fallback"
```

---

### Task 15: Sting duck in ProgramAudio

**Files:**
- Modify: `components/program-audio.tsx`
- Modify: `components/overlay-alert-layer.tsx` — dispatch a `growcast-alert-sting` CustomEvent when an alert becomes visible and sting is enabled
- Modify: GET program-audio JSON to include `stingEnabled`
- Test: `tests/program-audio-http.test.ts` (stingEnabled in payload)
- Test: `tests/program-scene.test.ts` (CustomEvent or stingEnabled read)

- [ ] **Step 1: Write the failing test**

Assert program-audio JSON includes `stingEnabled: true` by default.

Source-read `program-audio.tsx` for `growcast-alert-sting` and volume duck (multiply by ~0.25 for 12 dB).

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL — no stingEnabled field

- [ ] **Step 3: Implement**

Include `stingEnabled` from `readAlertsSettings()` in `programAudioGetResponse`. Overlay layer: if stingEnabled (from same poll or from alert payload), `window.dispatchEvent(new CustomEvent("growcast-alert-sting"))`. ProgramAudio listens, if stingEnabled, set `audio.volume = base * 0.25` for 1500ms then restore `base`. If stingEnabled is false, listener no-ops.

No sting file in v1 — duck is the “sting”. Spec said “short sting and duck”; without a bundled wav, duck **is** the sting unless you add `public/alert-sting.mp3`. Add a tiny public file only if you already have one; otherwise duck-only is enough and matches “no per-event custom sounds”.

- [ ] **Step 4: Run tests**

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/program-audio-http.test.ts tests/program-scene.test.ts tests/alerts-settings.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/program-audio.tsx components/overlay-alert-layer.tsx lib/restream/program-http.ts tests/program-audio-http.test.ts tests/program-scene.test.ts
git commit -m "feat: duck program music when an alert is on screen"
```

---

### Task 16: Spec coverage sweep + full test/build

**Files:** notices, README Broadcast paragraph if README documents restream, `docs/superpowers/specs/2026-09-07-broadcast-music-and-alerts-design.md` status line → implemented (do not rewrite the spec)

- [ ] **Step 1: Checklist vs spec**

Confirm each spec row has code:

- Program 1920×1080 scaled iframe, no token in src
- Capture token fail-closed unchanged
- URL wins; playlist filename order; both empty silence
- Opposite HUD
- Queue 6s FIFO cap 15
- Sting default on
- OAuth scopes only the three listed
- EventSub HMAC + challenge
- Pulse + anullsrc fallback
- restream not given `.env.local`
- Public overlay/homepage unchanged

Fix any gap with a focused test + code (do not skip).

- [ ] **Step 2: Run full tests**

```bash
npm test
```

Expected: all pass (count will be higher than 399)

- [ ] **Step 3: Production typecheck**

```bash
BUILD_STANDALONE=1 npm run build
```

Expected: TypeScript finished, exit 0. If `result.saved` style union errors appear, fix with unique discriminants (do not use `else` on grouped notice unions).

- [ ] **Step 4: Commit leftovers**

```bash
git add -u
git status
git commit -m "fix: close broadcast music and alerts spec gaps"
```

Only if there are real diffs.

---

## Self-review (spec coverage)

| Spec item | Task |
|---|---|
| 1920×1080 CSS-scaled program | 5, 6 |
| Session preview, no token in iframe src | 5, 6 |
| Capture still token-gated | 6 |
| Music files or URL, URL wins | 2, 3, 7, 9 |
| Mixer strip | 8 |
| Music + Alerts racks | 9, 11 |
| Opposite-HUD alerts | 1, 10 |
| Manual send + queue cap 15 / 6s | 1, 10 |
| Sting toggle default on, duck | 11, 15 |
| OAuth + EventSub webhooks | 12, 13 |
| Pulse + anullsrc fallback | 14 |
| No Helix in sidecar / no .env.local | 14 |
| Tests without live Twitch | 1–15 mocks |
| Public overlay/homepage quiet | 6, overlay-chrome test |

No TBD. Names: `publishOverlayAlert`, `RestreamAudio`, `PROGRAM_WIDTH`, `isProgramAuthorized` stay consistent across tasks.
