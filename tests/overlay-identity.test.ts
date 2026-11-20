import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {overlayIdentityView} from "../lib/overlay-identity.ts";

function identity(
    overrides: Partial<{
        name: string;
        plant: string;
        seededAt: string;
        stage: string;
        lightSchedule: string;
        strain: string;
    }> = {},
) {
    return overlayIdentityView({
        name: "",
        plant: "",
        seededAt: "2026-01-01",
        stage: "",
        lightSchedule: "",
        strain: "",
        ...overrides,
    });
}

describe("overlayIdentityView", () => {
    it("uses grow name as title when set, else plant, else Plant", () => {
        assert.equal(identity({name: "Godfather OG", plant: "Cannabis"}).title, "Godfather OG");
        assert.equal(identity({name: "  ", plant: "Cannabis"}).title, "Cannabis");
        assert.equal(identity({name: "", plant: ""}).title, "Plant");
    });

    it("builds meta as Day N · stage · schedule and omits empty pieces", () => {
        const full = identity({
            seededAt: "2026-08-21",
            stage: "Seed",
            lightSchedule: "12/12",
        });
        assert.match(full.metaLine, /^Day \d+ · Seed · 12\/12$/);

        const dayOnly = identity({stage: "  ", lightSchedule: ""});
        assert.match(dayOnly.metaLine, /^Day \d+$/);
    });

    it("shows strain unless it is blank or matches the title", () => {
        assert.equal(
            identity({name: "Godfather OG", strain: "Blue Dream"}).strain,
            "Blue Dream",
        );
        assert.equal(identity({name: "Godfather OG", strain: ""}).strain, "");
        assert.equal(identity({name: "Godfather OG", strain: "godfather og"}).strain, "");
    });
});
