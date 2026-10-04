import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {
    PUBLIC_CHIP,
    PUBLIC_FOCUS,
    PUBLIC_HIT,
    PUBLIC_NAV_LINK_IDLE,
} from "../lib/public-ui.ts";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("public UI chrome", () => {
    it("uses garden focus rings and 44px hit areas, not Vercel blue", () => {
        assert.match(PUBLIC_FOCUS, /focus-visible:ring-emerald-700/);
        assert.equal(PUBLIC_FOCUS.includes("#0070f3") || PUBLIC_FOCUS.includes("blue"), false);
        assert.match(PUBLIC_HIT, /min-h-11/);
        assert.match(PUBLIC_CHIP, /min-h-11/);
        assert.match(PUBLIC_NAV_LINK_IDLE, /dark:hover:text-zinc-100/);
        assert.equal(PUBLIC_NAV_LINK_IDLE.includes("dark:hover:text-zinc-400"), false);
    });

    it("gives the header a hairline, current-page fill, and a scrollable nav row", () => {
        const header = src(path.join("components", "site-header.tsx"));
        assert.match(header, /border-b border-zinc-200/);
        assert.match(header, /overflow-x-auto/);
        assert.match(header, /PUBLIC_NAV_LINK_ACTIVE/);
        assert.match(header, /PUBLIC_FOCUS/);
        assert.match(header, /aria-label="Site"/);
    });

    it("keeps the footer on every public page and labels empty live / energy / gallery states", () => {
        const layout = src(path.join("app", "(site)", "layout.tsx"));
        const frame = src(path.join("components", "workspace-frame.tsx"));
        const home = src(path.join("app", "(site)", "page.tsx"));
        const gallery = src(path.join("app", "(site)", "gallery", "page.tsx"));
        const energy = src(path.join("components", "energy-scoreboard.tsx"));
        assert.match(layout, /SiteFooter/);
        assert.match(frame, /Live view unavailable/);
        assert.match(frame, /No stream is configured/);
        assert.match(frame, /<h1 className="sr-only">Energy<\/h1>/);
        assert.match(home, /No grow details yet/);
        assert.match(home, /No health update yet/);
        assert.match(home, /hasGrowStartDate/);
        assert.match(gallery, /<h1[\s\S]*>\s*Gallery\s*<\/h1>/);
        assert.match(energy, /Loading live energy/);
        assert.match(energy, /Energy starts when live devices are flowing/);
        assert.match(energy, /PUBLIC_CHIP_ON/);
        assert.match(energy, /overflow-x-auto/);
        assert.match(energy, /PUBLIC_FOCUS_INSET/);
    });
});
