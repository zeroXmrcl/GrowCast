# Setup Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the centered setup column with the approved installer: a 240px step rail, slide transitions, an admin-password length line, and a Camera step for the public watch URL.

**Architecture:** The existing `/setup` route and server actions stay. A small installer shell renders the rail and one step. Step copy lives in one module. Camera writes `streamUrl` on the current grow. Skips are recorded for the done list. Settings pages stay bands; the Spider Farmer band reuses the controller list.

**Tech Stack:** Next.js 16 App Router, React 19, existing `node --test` suite, Tailwind-style admin tokens in `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-09-29-setup-installer-design.md`

---

## File map

- Create `app/setup/installer-copy.ts` — exact eyebrows, titles, lines, skip labels, done rows.
- Create `app/setup/installer-rail.tsx` — rail states: current, finished, pending.
- Create `app/setup/controller-list.tsx` — radio rows used by the wizard and the Spider Farmer band.
- Create `app/setup/password-line.tsx` — the 12-character line, admin password only.
- Modify `app/globals.css` — installer slide, label lift, reduced motion.
- Modify `app/setup/actions.ts` — camera save, skip record, done summary.
- Modify `app/setup/setup-wizard.tsx` — shell, steps, transitions.
- Modify `app/admin/spider-farmer-panel.tsx` — list instead of `<select>` when several controllers exist.
- Modify `lib/setup-account.ts` — `skipped.json` read/write.
- Test `tests/setup-installer.test.ts`.

---

### Task 1: Step copy

**Files:**
- Create: `app/setup/installer-copy.ts`
- Test: `tests/setup-installer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {INSTALLER_COPY} from "../app/setup/installer-copy.ts";

describe("installer copy", () => {
    it("locks the approved lines", () => {
        assert.equal(INSTALLER_COPY.admin.line, "The password needs 12 characters.");
        assert.equal(
            INSTALLER_COPY.climate.line,
            "Email and password only. Google or Apple sign-in will not work.",
        );
        assert.equal(
            INSTALLER_COPY.camera.line,
            "Something like http://stream.example.com/growcam/. Not the rtsp:// address from the camera.",
        );
        assert.equal(INSTALLER_COPY.twitch.line, "Creator Dashboard -> Settings -> Stream.");
        assert.equal(INSTALLER_COPY.timelapse.line, "Use the camera’s rtsp:// address.");
        assert.equal(INSTALLER_COPY.done.line, "You can change any of this later in admin settings.");
    });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/setup-installer.test.ts`

Expected: FAIL, cannot find `app/setup/installer-copy.ts`.

- [ ] **Step 3: Add the copy module**

```ts
export const INSTALLER_STEPS = ["admin", "climate", "camera", "twitch", "timelapse"] as const;
export type InstallerStepId = (typeof INSTALLER_STEPS)[number];

export const INSTALLER_COPY = {
    admin: {
        label: "Admin",
        eyebrow: "Setup",
        title: "Create the admin account",
        line: "The password needs 12 characters.",
    },
    climate: {
        label: "Climate",
        eyebrow: "Climate",
        title: "Connect Spider Farmer",
        line: "Email and password only. Google or Apple sign-in will not work.",
        listTitle: "Choose the controller",
    },
    camera: {
        label: "Camera",
        eyebrow: "Camera",
        title: "Where should visitors watch?",
        line: "Something like http://stream.example.com/growcam/. Not the rtsp:// address from the camera.",
    },
    twitch: {
        label: "Twitch",
        eyebrow: "Twitch",
        title: "Save the stream key",
        line: "Creator Dashboard -> Settings -> Stream.",
    },
    timelapse: {
        label: "Timelapse",
        eyebrow: "Timelapse",
        title: "Point it at the camera",
        line: "Use the camera’s rtsp:// address.",
    },
    done: {
        eyebrow: "Ready",
        title: "The stack is set up",
        line: "You can change any of this later in admin settings.",
        button: "Open the dashboard",
    },
} as const;
```

- [ ] **Step 4: Re-run the test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/setup/installer-copy.ts tests/setup-installer.test.ts
git commit -m "Add the approved installer step copy."
```

---

### Task 2: Rail states

**Files:**
- Create: `app/setup/installer-rail.tsx`
- Test: `tests/setup-installer.test.ts`

- [ ] **Step 1: Add a failing test that reads the rail source**

```ts
import {readFileSync} from "node:fs";
import path from "node:path";

it("styles a finished step with a number, grey fill, and white border", () => {
    const src = readFileSync(path.join(process.cwd(), "app", "setup", "installer-rail.tsx"), "utf8");
    assert.match(src, /installer-step-done/);
    assert.match(src, /#3a3a3a/);
    assert.match(src, /#f3f4f6/);
    assert.doesNotMatch(src, /✓|checkmark|#3d9a33/);
});
```

- [ ] **Step 2: Run the test**

Expected: FAIL, file missing.

- [ ] **Step 3: Implement the rail**

`installer-rail.tsx` renders `INSTALLER_STEPS`. Props: `current: InstallerStepId | "done"` and `finished: ReadonlySet<InstallerStepId>`.

- Current step: class `installer-step-current` (light pill).
- `finished` has the id and it is not current: class `installer-step-done`. The circle uses background `#3a3a3a` and border `#f3f4f6`. The text inside the circle is the number `1`–`5`, never a check.
- Otherwise: class `installer-step-pending`.
- When `current` is `"done"`, no step is current. Saved steps are finished. Skipped steps are pending.

- [ ] **Step 4: Re-run the test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/setup/installer-rail.tsx tests/setup-installer.test.ts
git commit -m "Render installer rail states without checkmarks."
```

---

### Task 3: Password line

**Files:**
- Create: `app/setup/password-line.tsx`
- Test: `tests/setup-installer.test.ts`

- [ ] **Step 1: Failing test**

```ts
import {passwordLineScale, passwordLineMet} from "../app/setup/password-line.ts";

it("fills the admin password line across 12 characters", () => {
    assert.equal(passwordLineScale(""), 0);
    assert.equal(passwordLineScale("123456"), 0.5);
    assert.equal(passwordLineScale("123456789012"), 1);
    assert.equal(passwordLineScale("123456789012345"), 1);
    assert.equal(passwordLineMet("12345678901"), false);
    assert.equal(passwordLineMet("123456789012"), true);
});
```

- [ ] **Step 2: Run it**

Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
const ADMIN_PASSWORD_MIN = 12;

export function passwordLineScale(value: string): number {
    return Math.min(1, value.length / ADMIN_PASSWORD_MIN);
}

export function passwordLineMet(value: string): boolean {
    return value.length >= ADMIN_PASSWORD_MIN;
}
```

The React component renders a 2px bar, `transform: scaleX(passwordLineScale(value))`, `transform-origin: left center`, background `#e4e4e7`, and `#3d9a33` when `passwordLineMet` is true. Mount it only under the admin password input in `setup-wizard.tsx`. Do not mount it on climate, Twitch, or any other field.

- [ ] **Step 4: Re-run**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/setup/password-line.tsx tests/setup-installer.test.ts
git commit -m "Add the admin password length line."
```

---

### Task 4: Slide motion

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add the installer motion classes**

```css
.installer-copy.leave {
  opacity: 0;
  transform: translateX(-32px);
  transition: opacity 420ms cubic-bezier(0.16, 1, 0.3, 1), transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
}
.installer-copy.enter { opacity: 0; transform: translateX(32px); }
.installer-copy.enter.show {
  opacity: 1;
  transform: none;
  transition: opacity 420ms cubic-bezier(0.16, 1, 0.3, 1), transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
}
.installer-label {
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), font-size 200ms ease, color 200ms ease;
}
.installer-field.filled .installer-label,
.installer-field:focus-within .installer-label {
  transform: translateY(-22px);
  font-size: 12px;
  color: #f3f4f6;
}
.installer-save.saving { transform: scale(0.98); }
@media (prefers-reduced-motion: reduce) {
  .installer-copy.leave,
  .installer-copy.enter,
  .installer-copy.enter.show,
  .installer-label,
  .installer-save.saving {
    transition: none;
    transform: none;
  }
}
```

- [ ] **Step 2: Assert the ease is present**

Add to `tests/setup-installer.test.ts`:

```ts
it("uses the admin rail ease for installer motion", () => {
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
    assert.match(css, /\.installer-copy\.leave[\s\S]*cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
    assert.match(css, /prefers-reduced-motion: reduce/);
});
```

- [ ] **Step 3: Run the test**

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css tests/setup-installer.test.ts
git commit -m "Add installer slide and label-lift motion."
```

---

### Task 5: Camera save and skip record

**Files:**
- Modify: `lib/setup-account.ts`
- Modify: `app/setup/actions.ts`
- Test: `tests/setup-installer.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import {mkdtemp, readFile, rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {readSkippedSteps, writeSkippedStep} from "../lib/setup-account.ts";
import {isInstallerStreamUrl} from "../app/setup/actions.ts";

it("rejects an rtsp address as the public watch link", () => {
    assert.equal(isInstallerStreamUrl("rtsp://camera/stream"), false);
    assert.equal(isInstallerStreamUrl("https://stream.example.com/growcam/"), true);
});

it("records a skip without dropping earlier skips", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-skip-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        await writeSkippedStep("climate");
        await writeSkippedStep("twitch");
        assert.deepEqual(await readSkippedSteps(), ["climate", "twitch"]);
        const raw = await readFile(path.join(dir, "setup", "skipped.json"), "utf8");
        assert.equal(raw.includes("camera"), false);
    } finally {
        if (previous === undefined) delete process.env.GROWCAST_DATA_DIR;
        else process.env.GROWCAST_DATA_DIR = previous;
        await rm(dir, {recursive: true, force: true});
    }
});
```

- [ ] **Step 2: Run and confirm FAIL**

- [ ] **Step 3: Implement**

`isInstallerStreamUrl` calls `isSafeHttpUrl` from `lib/url-policy.ts`.

`writeSkippedStep` reads `data/setup/skipped.json`, appends the id if missing, and writes the array. `readSkippedSteps` returns `[]` when the file is missing.

`setupCameraAction` refuses when `needsSetupWizard()` is false. On an unsafe URL it returns `{ok: false, message: "Paste a browser link, starting with http:// or https://."}`. On success it calls `updateCurrentGrow` with `{streamUrl}` and does not call `writeSkippedStep`.

`skipInstallerStepAction(step)` calls `writeSkippedStep` and returns `{ok: true}`. It does not write grow, ggs, restream, or timelapse files.

- [ ] **Step 4: Re-run**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/setup-account.ts app/setup/actions.ts tests/setup-installer.test.ts
git commit -m "Save the public watch link and record skipped installer steps."
```

---

### Task 6: Rebuild the wizard shell

**Files:**
- Modify: `app/setup/setup-wizard.tsx`
- Create: `app/setup/controller-list.tsx`

- [ ] **Step 1: Replace the centered column with the installer grid**

Outer layout: `min-h-screen` grid `240px minmax(0, 1fr)`, background `#1f1f1f`. Left: `InstallerRail`. Right: a column with class `installer-copy`, max width 440px, vertically centered.

Steps in state: `admin`, `climate`, `climate-list`, `camera`, `twitch`, `timelapse`, `done`. The rail `current` for `climate-list` is `climate`. For `done`, `current` is `"done"`.

`go(next, saving)` sets the button text to `Saving` and class `installer-save saving` only when `saving` is true, waits 200ms, adds `leave`, waits 420ms, sets the next step, then adds `enter` and `show` on the next frame. Skip calls `go(next, false)` after `skipInstallerStepAction`.

Admin fields: username and password only. Password includes `PasswordLine`. Continue calls the existing `createSetupAdminAction`. Remove the repeat-password field.

Climate save calls `setupClimateAction`. `{ok: true}` goes to `camera`. A `choose` array sets step `climate-list` without changing the rail. The list is `ControllerList`. `Use this controller` resubmits `setupClimateAction` with `sfSerial`.

Camera, Twitch, and Timelapse use the copy module and the existing Twitch and timelapse actions plus `setupCameraAction`.

A failed action renders `<p className="installer-error" role="alert">` under the line beneath the title. The classes are `mt-6 rounded-md border border-amber-900/70 bg-amber-950/30 px-3 py-2 text-sm text-amber-200`. The step does not change.

Done rows:

```ts
export function installerDoneRows(input: {
    username: string;
    climate: string | null;
    streamUrl: string | null;
    twitchSaved: boolean;
    timelapse: string | null;
    skipped: readonly string[];
}): Array<{label: string; value: string}> {
    const skipped = new Set(input.skipped);
    return [
        {label: "Admin", value: input.username},
        {label: "Climate", value: skipped.has("climate") ? "Skipped" : (input.climate ?? "Skipped")},
        {label: "Camera", value: skipped.has("camera") ? "Skipped" : (input.streamUrl ?? "Skipped")},
        {label: "Twitch", value: skipped.has("twitch") || !input.twitchSaved ? "Skipped" : "Key saved. Start is on Broadcast."},
        {label: "Timelapse", value: skipped.has("timelapse") ? "Skipped" : (input.timelapse ?? "Skipped")},
    ];
}
```

Put that function in `app/setup/installer-copy.ts` and cover it with one test: climate skipped yields `Skipped`, and a saved stream URL is the camera value. `Open the dashboard` calls `finishSetupAction` and `router.push("/")`.

- [ ] **Step 2: Share the list with Spider Farmer**

`ControllerList` props: `controllers`, `selected`, `onSelect`. A selected row has border `#e4e4e7`. The dot is a 16px circle; selected uses a 5px `#e4e4e7` border.

In `app/admin/spider-farmer-panel.tsx`, when `controllers.length > 1`, render `ControllerList` instead of `AdminSelect`. The chosen serial is submitted as `sfSerial`.

- [ ] **Step 3: Run the installer tests and the settings band test**

Run: `node --experimental-strip-types --import ./tests/register.mjs --test tests/setup-installer.test.ts tests/admin-settings-bands.test.ts`

Expected: PASS. The band test still finds `title="Spider Farmer"`.

- [ ] **Step 4: Commit**

```bash
git add app/setup/setup-wizard.tsx app/setup/controller-list.tsx app/admin/spider-farmer-panel.tsx
git commit -m "Rebuild setup as the installer and reuse the controller list."
```

---

### Task 7: Check the wizard in the browser

- [ ] **Step 1: Start a preview that still shows the installer**

The real `.env.local` admin account skips the wizard. Start Next on port 3456 with `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET` set to the placeholder values `change-me`, `change-me`, and `generate-me`, and `GROWCAST_DATA_DIR` set to an empty temp directory.

- [ ] **Step 2: Walk the rail**

Open `http://127.0.0.1:3456/setup`. Confirm the password line, a slide into Climate, Skip leaving Climate dim, Camera rejecting an `rtsp://` value, and the done screen using numbered finished steps with a grey fill and white border.

- [ ] **Step 3: Stop the preview server**
