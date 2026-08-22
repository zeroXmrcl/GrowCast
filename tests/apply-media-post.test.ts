import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {applyMediaPost} from "../lib/admin/apply-media-post.ts";

describe("applyMediaPost", () => {
    it("rejects an unknown intent", async () => {
        const form = new FormData();
        form.set("intent", "explode");
        form.set("collection", "setup");

        assert.deepEqual(await applyMediaPost(form), {
            ok: false,
            notice: "media_upload_failed",
            reason: "invalid_intent",
        });
    });

    it("does not drop a File entry as if no files were posted", async () => {
        const form = new FormData();
        form.set("intent", "upload");
        form.set("collection", "setup");
        form.set("files", new File([new Uint8Array([1, 2, 3])], "probe.jpg", {type: "image/jpeg"}));

        const result = await applyMediaPost(form);
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.notice, "media_invalid_file");
            assert.equal(result.reason, "all_rejected");
        }
    });

    it("maps an empty upload to media_no_files", async () => {
        const form = new FormData();
        form.set("intent", "upload");
        form.set("collection", "setup");

        assert.deepEqual(await applyMediaPost(form), {
            ok: false,
            notice: "media_no_files",
            reason: "no_files",
            collection: "setup",
        });
    });

    it("maps a delete with a bad collection to media_delete_failed", async () => {
        const form = new FormData();
        form.set("intent", "delete");
        form.set("collection", "not-a-collection");
        form.set("filename", "picture.webp");

        assert.deepEqual(await applyMediaPost(form), {
            ok: false,
            notice: "media_delete_failed",
            reason: "invalid_collection",
        });
    });
});
