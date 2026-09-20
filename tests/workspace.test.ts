import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {
    isWorkspaceHandoff,
    isWorkspacePath,
    WORKSPACE_CAM_ENERGY_PX,
    WORKSPACE_EASING,
    WORKSPACE_MORPH_MS,
} from "../lib/workspace.ts";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("workspace morph", () => {
    it("treats only / and /energy as workspace paths", () => {
        assert.equal(isWorkspacePath("/"), true);
        assert.equal(isWorkspacePath("/energy"), true);
        assert.equal(isWorkspacePath("/gallery"), false);
        assert.equal(isWorkspacePath("/grows"), false);
        assert.equal(isWorkspacePath("/admin"), false);
        assert.equal(isWorkspaceHandoff("/", "/energy"), true);
        assert.equal(isWorkspaceHandoff("/energy", "/"), true);
        assert.equal(isWorkspaceHandoff("/", "/"), false);
        assert.equal(isWorkspaceHandoff("/gallery", "/"), false);
        assert.equal(isWorkspaceHandoff("/", "/gallery"), false);
    });

    it("keeps OverlayCamera in the site shell and LiveTentRow on home", () => {
        const layout = src(path.join("app", "(site)", "layout.tsx"));
        const frame = src(path.join("components", "workspace-frame.tsx"));
        const home = src(path.join("app", "(site)", "page.tsx"));
        const energy = src(path.join("app", "(site)", "energy", "page.tsx"));
        assert.match(layout, /WorkspaceFrame/);
        assert.match(frame, /OverlayCamera/);
        assert.match(frame, /isWorkspacePath\(pathname\)/);
        assert.match(frame, /EnergyScoreboard/);
        assert.match(frame, /growcast-dash-slot/);
        assert.match(frame, /growcast-energy-slot/);
        assert.doesNotMatch(frame, /lg:w-\[320px\]/);
        assert.equal(WORKSPACE_CAM_ENERGY_PX, 320);
        assert.doesNotMatch(home, /OverlayCamera/);
        assert.match(home, /LiveTentRow climateTick=\{grow\.climateTick\}/);
        assert.doesNotMatch(energy, /<h1/);
        assert.doesNotMatch(energy, /py-10/);
        assert.doesNotMatch(energy, /buildEnergyDto/);
    });

    it("pairs dashboard and energy panels with shared view-transition names", () => {
        const css = src(path.join("app", "globals.css"));
        const home = src(path.join("app", "(site)", "page.tsx"));
        const header = src(path.join("components", "site-header.tsx"));
        const workspace = src(path.join("lib", "workspace.ts"));
        const scoreboard = src(path.join("components", "energy-scoreboard.tsx"));
        const row = src(path.join("components", "live-tent-row.tsx"));
        const pictures = src(path.join("components", "dash-pictures.tsx"));
        const frame = src(path.join("components", "workspace-frame.tsx"));
        assert.match(css, /view-transition-name: vt-cam/);
        assert.match(css, /view-transition-name: vt-side/);
        assert.match(css, /view-transition-name: vt-mid/);
        assert.match(css, /view-transition-name: vt-flow/);
        assert.match(css, /view-transition-name: vt-water/);
        assert.match(css, /view-transition-name: vt-table/);
        assert.match(css, /view-transition-name: vt-socials/);
        assert.match(css, /view-transition-name: vt-header/);
        assert.match(css, /::view-transition-old\(root\)/);
        assert.match(css, /--growcast-workspace-ms: 360ms/);
        assert.match(css, /cubic-bezier\(0\.16, 1, 0\.3, 1\)/);
        assert.match(css, /\[data-page="energy"\] \.growcast-dash-slot/);
        assert.match(css, /\[data-page="energy"\] \.growcast-area-cam/);
        assert.match(css, /width: 320px/);
        assert.equal(WORKSPACE_MORPH_MS, 360);
        assert.equal(WORKSPACE_EASING, "cubic-bezier(0.16, 1, 0.3, 1)");
        const nav = src(path.join("components", "workspace-nav.tsx"));
        assert.match(header, /useWorkspaceNav/);
        assert.match(header, /isWorkspacePath\(item\.href\)/);
        assert.match(nav, /morphWorkspace/);
        assert.match(nav, /applyWorkspacePage/);
        assert.match(nav, /document\.startViewTransition\(apply\)/);
        assert.match(nav, /history\.pushState/);
        assert.match(nav, /flushSync/);
        assert.match(nav, /prefers-reduced-motion/);
        assert.match(frame, /EnergyScoreboard/);
        assert.match(css, /growcast-vt-off/);
        assert.match(header, /WORKSPACE_VT\.header/);
        assert.match(home, /WORKSPACE_VT\.side/);
        assert.match(home, /WORKSPACE_VT\.flow/);
        assert.match(home, /WORKSPACE_VT\.table/);
        assert.match(home, /WORKSPACE_VT\.socials/);
        assert.match(row, /WORKSPACE_VT\.mid/);
        assert.match(pictures, /WORKSPACE_VT\.water/);
        assert.match(scoreboard, /WORKSPACE_VT\.side/);
        assert.match(scoreboard, /WORKSPACE_VT\.mid/);
        assert.match(scoreboard, /WORKSPACE_VT\.table/);
        assert.doesNotMatch(scoreboard, /<h1/);
        assert.match(scoreboard, /EnergyArchiveSection/);
        assert.match(scoreboard, /rounded-2xl border border-zinc-200/);
    });
});
