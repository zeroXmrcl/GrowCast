import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {adminNoticeRefreshes} from "../lib/admin/action-result.ts";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function actionBody(source: string, name: string, nextName: string): string {
    const start = source.indexOf(`export async function ${name}`);
    const end = source.indexOf(`export async function ${nextName}`);
    assert.ok(start >= 0 && end > start, name);
    return source.slice(start, end);
}

describe("admin settings bands", () => {
    const actions = src(path.join("app", "admin", "actions.ts"));

    it("returns a notice from page saves instead of redirecting", () => {
        for (const [name, nextName] of [
            ["saveGrowAction", "saveStreamAction"],
            ["saveStreamAction", "saveTimelapseAction"],
            ["saveTimelapseAction", "saveEnergyAction"],
            ["saveEnergyAction", "connectSpiderFarmerAction"],
        ]) {
            const body = actionBody(actions, name, nextName);
            assert.match(body, /notice: "saved"/);
            assert.match(body, /save_failed/);
            assert.doesNotMatch(body, /redirect\(/);
        }
        assert.match(actionBody(actions, "saveGrowAction", "saveStreamAction"), /stale_grow/);
        assert.match(actionBody(actions, "saveStreamAction", "saveTimelapseAction"), /stale_grow/);
        assert.match(actionBody(actions, "saveGrowAction", "saveStreamAction"), /saveAdminSettings/);
        assert.doesNotMatch(actionBody(actions, "saveGrowAction", "saveStreamAction"), /saveEnergyAdminSettings/);
        assert.match(actionBody(actions, "saveTimelapseAction", "saveEnergyAction"), /saveTimelapseAdminSettings/);
        assert.match(actionBody(actions, "saveEnergyAction", "connectSpiderFarmerAction"), /saveEnergyAdminSettings/);
    });

    it("returns a notice from immediate actions", () => {
        assert.match(actions, /notice: "twitch_started"/);
        assert.match(actions, /notice: "twitch_stopped"/);
        assert.match(actions, /twitch_key_saved/);
        assert.match(actions, /notice: "audio_saved"/);
        assert.match(actions, /notice: "alerts_saved"/);
        assert.match(actions, /notice: "spider_farmer_connected"/);
        assert.match(actions, /"archived"/);
        const complete = actions.slice(actions.indexOf("export async function completeGrowAction"));
        assert.doesNotMatch(complete, /redirect\(/);
    });

    it("keeps OAuth and a missing archive on a notice redirect", () => {
        const callback = src(path.join("app", "admin", "stream", "twitch-callback", "route.ts"));
        assert.match(callback, /withNotice\("\/admin\/stream", "twitch_connected"\)/);
        assert.match(callback, /withNotice\("\/admin\/stream", "twitch_oauth_failed"\)/);
        const editor = src(path.join("app", "admin", "archives", "[archiveId]", "page.tsx"));
        assert.match(editor, /withNotice\("\/admin\/archives", "archive_not_found"\)/);
    });

    it("mounts one toast that reads the notice map and strips the query", () => {
        const layout = src(path.join("app", "admin", "layout.tsx"));
        const toast = src(path.join("app", "admin", "admin-toast.tsx"));
        assert.match(layout, /AdminToast/);
        assert.match(toast, /adminNoticeContent/);
        assert.match(toast, /searchParams\.get\("notice"\)/);
        assert.match(toast, /next\.delete\("notice"\)/);
        assert.match(toast, /4000/);
    });

    it("does not render the top flash notice on settings pages", () => {
        for (const rel of [
            path.join("app", "admin", "page.tsx"),
            path.join("app", "admin", "stream", "page.tsx"),
            path.join("app", "admin", "timelapse", "page.tsx"),
            path.join("app", "admin", "ggs", "page.tsx"),
            path.join("app", "admin", "archives", "page.tsx"),
            path.join("app", "admin", "archives", "[archiveId]", "page.tsx"),
        ]) {
            assert.doesNotMatch(src(rel), /AdminFlashNotice/);
        }
    });

    it("renders the band titles from the settings spec", () => {
        const grow = src(path.join("app", "admin", "settings-fields.tsx"));
        for (const title of ["General", "Lifecycle", "Climate", "Status", "Notes", "Hardware", "Socials"]) {
            assert.match(grow, new RegExp(`title="${title}"`));
        }
        assert.match(src(path.join("app", "admin", "media-manager.tsx")), /title="Pictures"/);
        const stream = [
            src(path.join("app", "admin", "stream", "page.tsx")),
            src(path.join("app", "admin", "stream-fields.tsx")),
            src(path.join("app", "admin", "restream-panel.tsx")),
            src(path.join("app", "admin", "camera-look-panel.tsx")),
            src(path.join("app", "admin", "music-panel.tsx")),
            src(path.join("app", "admin", "alerts-panel.tsx")),
        ].join("\n");
        for (const title of ["Program", "Mixer", "Twitch", "Camera look", "Music", "Alerts", "OBS", "Design", "Camera"]) {
            assert.match(stream, new RegExp(`title="${title}"`));
        }
        const timelapse = src(path.join("app", "admin", "timelapse-fields.tsx"));
        for (const title of ["Capture", "Triggers", "Output"]) {
            assert.match(timelapse, new RegExp(`title="${title}"`));
        }
        const ggs = src(path.join("app", "admin", "ggs", "page.tsx"))
            + src(path.join("app", "admin", "spider-farmer-panel.tsx"))
            + src(path.join("app", "admin", "energy-fields.tsx"));
        for (const title of ["Spider Farmer", "Sidecar", "Devices", "Energy"]) {
            assert.match(ggs, new RegExp(`title="${title}"`));
        }
        const archives = src(path.join("app", "admin", "archives", "page.tsx"))
            + src(path.join("app", "admin", "complete-grow-panel.tsx"));
        assert.match(archives, /title="Complete Grow"/);
        assert.match(archives, /title="Past grows"/);
        const editor = src(path.join("app", "admin", "archives", "[archiveId]", "page.tsx"));
        for (const title of ["Details", "Snapshots", "Pictures", "Timelapse", "Danger Zone"]) {
            assert.match(editor, new RegExp(`title="${title}"`));
        }
    });

    it("lists those bands in the open sidebar section", () => {
        const nav = src(path.join("app", "admin", "admin-section-nav.tsx"));
        for (const label of ["General", "Program", "Capture", "Spider Farmer", "Complete Grow", "Danger Zone"]) {
            assert.match(nav, new RegExp(`label: "${label}"`));
        }
        assert.match(nav, /admin-nav-roll-open/);
    });

    it("refreshes after a saved notice and keeps the page after a failed save", () => {
        assert.equal(adminNoticeRefreshes("saved"), true);
        assert.equal(adminNoticeRefreshes("save_failed"), false);
        assert.equal(adminNoticeRefreshes("stale_grow"), false);
        assert.equal(adminNoticeRefreshes("media_payload_too_large"), false);
    });
});
