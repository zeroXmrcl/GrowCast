import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {isAdminNoticeId, withNotice} from "../lib/admin/notice.ts";
import {parsePluginManifest} from "../lib/plugins/manifest.ts";

describe("admin notice query", () => {
    it("accepts catalog ids and rejects unknown values", () => {
        assert.equal(isAdminNoticeId("saved"), true);
        assert.equal(isAdminNoticeId("stale_grow"), true);
        assert.equal(isAdminNoticeId("uploaded_partial"), true);
        assert.equal(isAdminNoticeId("archive_not_found"), true);
        assert.equal(isAdminNoticeId("media_payload_too_large"), true);
        assert.equal(isAdminNoticeId("media_encoder_unavailable"), true);
        assert.equal(isAdminNoticeId("rotated"), true);
        assert.equal(isAdminNoticeId("media_rotate_failed"), true);
        assert.equal(isAdminNoticeId("archived_reset_warning"), true);
        assert.equal(isAdminNoticeId("archived_cleanup_warning"), true);
        assert.equal(isAdminNoticeId("ai_summary_ready"), true);
        assert.equal(isAdminNoticeId("ai_summary_failed"), true);
        assert.equal(isAdminNoticeId("ai_summary_rate_limited"), true);
        assert.equal(isAdminNoticeId("ai_summary_no_key"), true);
        assert.equal(isAdminNoticeId("ai_summary_daily_cap"), true);
        assert.equal(isAdminNoticeId("twitch_login_invalid"), false);
        assert.equal(isAdminNoticeId("audio_saved"), false);
        assert.equal(isAdminNoticeId("spider_farmer_connected"), false);
        assert.equal(isAdminNoticeId("not-a-notice"), false);
        assert.equal(isAdminNoticeId(""), false);
    });

    it("builds a single notice query key", () => {
        assert.equal(withNotice("/admin", "saved"), "/admin?notice=saved");
        assert.equal(
            withNotice("/admin/archives/abc", "archive_updated"),
            "/admin/archives/abc?notice=archive_updated",
        );
    });

    it("keeps plugin notice copy on the plugin manifests", () => {
        const ggs = parsePluginManifest(JSON.parse(
            readFileSync(path.join(process.cwd(), "plugins", "ggs", "plugin.json"), "utf8"),
        ));
        const restream = parsePluginManifest(JSON.parse(
            readFileSync(path.join(process.cwd(), "plugins", "restream", "plugin.json"), "utf8"),
        ));
        assert.equal(ggs.ok, true);
        assert.equal(restream.ok, true);
        if (ggs.ok) {
            assert.equal(ggs.value.notices?.spider_farmer_connected?.title, "Spider Farmer connected");
        }
        if (restream.ok) {
            assert.equal(restream.value.notices?.twitch_connected?.title, "Twitch connected");
            assert.equal(restream.value.notices?.music_uploaded?.title, "Tracks uploaded");
        }
        const core = readFileSync(path.join(process.cwd(), "app", "admin", "admin-notice.tsx"), "utf8");
        assert.doesNotMatch(core, /spider_farmer_/);
        assert.doesNotMatch(core, /twitch_key_saved/);
        const setup = readFileSync(path.join(process.cwd(), "lib", "plugins", "setup-ui.tsx"), "utf8");
        assert.doesNotMatch(setup, /stepId === "climate"/);
        assert.doesNotMatch(setup, /twitchKey/);
    });
});
