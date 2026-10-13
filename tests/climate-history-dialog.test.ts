import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {describe, it} from "node:test";
import {stepPath} from "../lib/climate/plot.ts";

describe("climate history dialog", () => {
    it("draws a step between two values", () => {
        const path = stepPath([0, 10], 100, 20);
        assert.match(path, /^M0 /);
        assert.match(path, /H50/);
        assert.match(path, /H100/);
    });

    it("keeps the overlay out of the board grid", () => {
        const dialog = readFileSync("components/climate-history-dialog.tsx", "utf8");
        const card = readFileSync("components/live-climate-card.tsx", "utf8");
        const row = readFileSync("components/live-tent-row.tsx", "utf8");
        const workspace = readFileSync("lib/workspace.ts", "utf8");
        assert.match(dialog, /No climate history yet/);
        assert.match(dialog, /absolute inset-0/);
        assert.match(card, />History</);
        assert.match(row, /createPortal/);
        assert.match(row, /growcast-board/);
        assert.match(workspace, /relative/);
    });
});
