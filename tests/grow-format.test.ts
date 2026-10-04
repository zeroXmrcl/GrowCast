import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {formatDateDisplay, hasGrowStartDate} from "../app/(site)/grows/format.ts";

describe("formatDateDisplay", () => {
    it("keeps date-only strings on the calendar day in APP_TIMEZONE", () => {
        const previous = process.env.TZ;
        process.env.TZ = "America/Los_Angeles";
        try {
            assert.equal(formatDateDisplay("2026-04-20"), "20.04.2026");
            assert.equal(hasGrowStartDate("2026-04-20"), true);
            assert.equal(hasGrowStartDate(""), false);
            assert.equal(hasGrowStartDate("2001-01-01"), false);
        } finally {
            if (previous === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = previous;
            }
        }
    });
});
