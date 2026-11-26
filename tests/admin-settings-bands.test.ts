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
        const grow = actionBody(actions, "saveGrowAction", "completeGrowAction");
        assert.match(grow, /notice: "saved"/);
        assert.match(grow, /save_failed/);
        assert.match(grow, /stale_grow/);
        assert.match(grow, /saveAdminSettings/);
        assert.doesNotMatch(grow, /redirect\(/);
        const timelapse = src(path.join("plugins", "timelapse", "admin", "actions.ts"));
        assert.match(timelapse, /notice: "saved"/);
    });

    it("returns a notice from immediate actions", () => {
        const restream = src(path.join("plugins", "restream", "admin", "actions.ts"));
        assert.match(restream, /notice: "twitch_started"/);
        assert.match(restream, /notice: "twitch_stopped"/);
        assert.match(restream, /twitch_key_saved/);
        assert.match(restream, /notice: "audio_saved"/);
        assert.match(restream, /notice: "alerts_saved"/);
        assert.match(actions, /"archived"/);
        const complete = actions.slice(actions.indexOf("export async function completeGrowAction"));
        assert.doesNotMatch(complete, /redirect\(/);
    });

    it("keeps OAuth and a missing archive on a notice redirect", () => {
        const callback = src(path.join("plugins", "restream", "host", "oauth-http.ts"));
        assert.match(callback, /twitch_connected/);
        assert.match(callback, /twitch_oauth_failed/);
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
        assert.match(toast, /router\.replace\(/);
        assert.doesNotMatch(toast, /replaceState/);
        assert.match(toast, /4000/);
    });

    it("does not render the top flash notice on settings pages", () => {
        for (const rel of [
            path.join("app", "admin", "page.tsx"),
            path.join("plugins", "restream", "admin", "page.tsx"),
            path.join("plugins", "timelapse", "admin", "page.tsx"),
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
            src(path.join("plugins", "restream", "admin", "page.tsx")),
            src(path.join("app", "admin", "overlay-fields.tsx")),
            src(path.join("plugins", "restream", "admin", "restream-panel.tsx")),
            src(path.join("plugins", "restream", "admin", "camera-look-panel.tsx")),
            src(path.join("plugins", "restream", "admin", "music-panel.tsx")),
            src(path.join("plugins", "restream", "admin", "alerts-panel.tsx")),
        ].join("\n");
        for (const title of ["Program", "Mixer", "Twitch", "Camera look", "Music", "Alerts", "OBS", "Design", "Camera"]) {
            assert.match(stream, new RegExp(`title="${title}"`));
        }
        const timelapse = src(path.join("plugins", "timelapse", "admin", "timelapse-fields.tsx"));
        for (const title of ["Capture", "Triggers", "Output"]) {
            assert.match(timelapse, new RegExp(`title="${title}"`));
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
        for (const label of ["General", "OBS", "Complete Grow", "Danger Zone"]) {
            assert.match(nav, new RegExp(`label: "${label}"`));
        }
        const restream = src(path.join("plugins", "restream", "plugin.json"));
        const timelapse = src(path.join("plugins", "timelapse", "plugin.json"));
        assert.match(restream, /"label": "Program"/);
        assert.match(timelapse, /"label": "Capture"/);
        assert.match(nav, /admin-nav-roll-open/);
    });

    it("refreshes after a saved notice and keeps the page after a failed save", () => {
        assert.equal(adminNoticeRefreshes("saved"), true);
        assert.equal(adminNoticeRefreshes("save_failed"), false);
        assert.equal(adminNoticeRefreshes("stale_grow"), false);
        assert.equal(adminNoticeRefreshes("media_payload_too_large"), false);
    });
});
