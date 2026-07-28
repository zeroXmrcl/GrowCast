import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {APP_TIMEZONE} from "../lib/app-timezone.ts";
import {getDaysSince} from "../utils/daysSinceSeeding.ts";

describe("getDaysSince timezone", () => {
    it("uses the shared APP_TIMEZONE constant", () => {
        assert.equal(typeof APP_TIMEZONE, "string");
        assert.ok(APP_TIMEZONE.length > 0);
        // Same calendar day in app timezone → age 0
        const todayParts = new Intl.DateTimeFormat("en-CA", {
            timeZone: APP_TIMEZONE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).format(new Date());
        assert.equal(getDaysSince(todayParts), 0);
    });
});
