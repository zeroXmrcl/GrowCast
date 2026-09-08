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
        assert.equal(programScale(0, 540), 0);
        assert.equal(programScale(960, 0), 0);
        assert.equal(programScale(-10, 1080), 0);
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
        assert.match(monitor, /allow="autoplay"/);
        assert.match(monitor, /unlockPreviewAudio/);
        assert.doesNotMatch(monitor, /token=/);
        assert.match(page, /ProgramMonitor/);
        assert.doesNotMatch(page, /StreamPreview/);
        assert.doesNotMatch(page, /capture\?token/);
    });

    it("allows same-origin iframe of /program without weakening the rest of the site", () => {
        const config = readFileSync(
            path.join(process.cwd(), "next.config.ts"),
            "utf8",
        );
        assert.match(config, /frame-ancestors 'none'/);
        assert.match(config, /value:\s*"DENY"/);
        assert.match(config, /source:\s*"\/program"/);
        assert.match(config, /SAMEORIGIN/);
        assert.match(config, /frame-ancestors 'self'/);
        assert.doesNotMatch(config, /source:\s*"\/overlay/);
        const catchAll = config.indexOf('source: "/:path*"');
        const program = config.indexOf('source: "/program"');
        assert.ok(catchAll >= 0, "missing /:path* headers");
        assert.ok(program > catchAll, "/program headers must follow /:path* so they override");
    });

    it("allows http media-src so LAN Icecast music URLs work", () => {
        const config = readFileSync(
            path.join(process.cwd(), "next.config.ts"),
            "utf8",
        );
        assert.match(config, /media-src 'self' https: http: blob:/);
        assert.match(config, /frame-src 'self' https: http:/);
    });
});
