import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

function ruleBody(css: string, selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    assert.ok(match, `missing CSS rule ${selector}`);
    return match[1];
}

function srgbChannel(value: number): number {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
    const raw = hex.replace("#", "");
    assert.equal(raw.length, 6, `expected #rrggbb, got ${hex}`);
    const r = Number.parseInt(raw.slice(0, 2), 16);
    const g = Number.parseInt(raw.slice(2, 4), 16);
    const b = Number.parseInt(raw.slice(4, 6), 16);
    return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

function contrastRatio(a: string, b: string): number {
    const pair = [luminance(a), luminance(b)].sort((left, right) => right - left);
    return (pair[0] + 0.05) / (pair[1] + 0.05);
}

const BOARD_DARK = "#09090b";
const SCORE_FILLS = ["#10b981", "#84cc16", "#f59e0b", "#ef4444"];

describe("ai summary 30-day score strip", () => {
    it("keeps ticks visible after the rise animation is cleared", () => {
        const css = src(path.join("app", "globals.css"));
        const card = src(path.join("components", "ai-summary-card.tsx"));
        const tick = ruleBody(css, ".growcast-ai-tick");
        const riseAt = css.indexOf("@keyframes growcast-ai-rise");
        assert.notEqual(riseAt, -1, "missing @keyframes growcast-ai-rise");
        const rise = css.slice(riseAt, riseAt + 220);

        assert.doesNotMatch(tick, /scaleY\(\s*0\s*\)/);
        assert.doesNotMatch(tick, /opacity\s*:\s*0/);
        assert.match(tick, /animation:[^;]*\bboth\b/);
        assert.match(tick, /growcast-ai-rise/);
        assert.match(rise, /from\s*\{\s*transform:\s*scaleY\(\s*0\s*\)/);
        assert.match(rise, /to\s*\{\s*transform:\s*none/);
        assert.match(css, /\.growcast-ai-tick \{ transform: none; \}/);
        assert.match(card, /data-strip="scores"/);
        assert.match(card, /grid-cols-\[repeat\(30,minmax\(0,1fr\)\)\]/);
        assert.match(card, /h-3/);
        assert.match(card, /growcast-ai-tick-empty/);
        assert.match(card, /onAnimationEnd=\{clearMotion\}/);
        assert.match(card, /style\.animation = "none"/);
        assert.doesNotMatch(card, /bg-zinc-800/);
        assert.doesNotMatch(card, /dark:bg-zinc-800/);
    });

    it("paints empty day ticks with the same zinc as empty climate-mosaic cells", () => {
        const css = src(path.join("app", "globals.css"));
        const card = src(path.join("components", "ai-summary-card.tsx"));
        assert.match(card, /STRIP_EMPTY_CLASS = "bg-zinc-200 dark:bg-zinc-700"/);
        assert.match(card, /h-full min-w-0 \$\{STRIP_EMPTY_CLASS\}/);
        assert.match(card, /growcast-ai-tick-empty \$\{STRIP_EMPTY_CLASS\}/);
        assert.doesNotMatch(css, /--growcast-ai-empty/);
        assert.doesNotMatch(css, /\.growcast-ai-tick-empty \{[^}]*background-color/);
        for (const fill of SCORE_FILLS) {
            assert.ok(
                contrastRatio(fill, BOARD_DARK) >= 3,
                `${fill} must stay ≥3:1 on the dark board`,
            );
        }
    });
});
