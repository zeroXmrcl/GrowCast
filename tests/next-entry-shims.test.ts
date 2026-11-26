import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

const root = process.cwd();

describe("Next entry shims traced into the standalone image", () => {
    it("next.config.ts traces the entry files plugin bundles import", () => {
        const source = readFileSync(path.join(root, "next.config.ts"), "utf8");
        assert.match(source, /node_modules\/next\/headers\.js/);
        assert.match(source, /node_modules\/next\/navigation\.js/);
        assert.match(source, /node_modules\/next\/cache\.js/);
        assert.match(source, /BUILD_STANDALONE/);
    });

    it("the verify script fails closed when the standalone tree is absent", () => {
        const script = readFileSync(path.join(root, "scripts", "verify-next-entry-shims.mjs"), "utf8");
        assert.match(script, /process\.exit\(1\)/);
        assert.match(script, /headers\.js/);
        const headers = path.join(root, ".next", "standalone", "node_modules", "next", "headers.js");
        if (existsSync(headers)) {
            assert.ok(readFileSync(headers, "utf8").length > 0);
        }
    });
});
