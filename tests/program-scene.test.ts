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
        assert.match(scene, /ProgramAudio/);
        assert.match(capture, /ProgramScene/);
        assert.match(preview, /ProgramScene/);
        assert.match(preview, /isAdminAuthenticated/);
        assert.doesNotMatch(preview, /token/);
        assert.match(capture, /isRestreamCaptureAuthorized/);
    });
});
