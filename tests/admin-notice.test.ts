import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {isAdminNoticeId, withNotice} from "../lib/admin/notice.ts";

describe("admin notice query", () => {
    it("accepts catalog ids and rejects unknown values", () => {
        assert.equal(isAdminNoticeId("saved"), true);
        assert.equal(isAdminNoticeId("stale_grow"), true);
        assert.equal(isAdminNoticeId("uploaded_partial"), true);
        assert.equal(isAdminNoticeId("archive_not_found"), true);
        assert.equal(isAdminNoticeId("media_payload_too_large"), true);
        assert.equal(isAdminNoticeId("archived_reset_warning"), true);
        assert.equal(isAdminNoticeId("archived_cleanup_warning"), true);
        assert.equal(isAdminNoticeId("twitch_login_invalid"), true);
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
});
