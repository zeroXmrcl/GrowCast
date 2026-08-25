import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {atomicTempPath, atomicWriteFile} from "../lib/atomic-file.ts";
import {getCurrentGrow, updateCurrentGrow} from "../lib/db.ts";

async function withTempDataDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "growcast-grow-"));
    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dir;
    try {
        return await fn(dir);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(dir, {recursive: true, force: true});
    }
}

describe("grow JSON store", () => {
    it("does not return or persist a placeholder when current-grow.json is corrupt", async () => {
        await withTempDataDir(async (dir) => {
            const file = path.join(dir, "current-grow.json");
            await writeFile(file, "{not-json", "utf8");

            await assert.rejects(() => getCurrentGrow(), SyntaxError);
            assert.equal(await readFile(file, "utf8"), "{not-json");

            await assert.rejects(
                () =>
                    updateCurrentGrow({
                        name: "Placeholder Persist",
                        plant: "Basil",
                        streamUrl: "",
                    }),
                SyntaxError,
            );
            assert.equal(await readFile(file, "utf8"), "{not-json");
        });
    });

    it("fills missing fields with empty/zero values, not demo copy", async () => {
        await withTempDataDir(async (dir) => {
            await writeFile(path.join(dir, "current-grow.json"), JSON.stringify({name: "Only Name"}), "utf8");
            const grow = await getCurrentGrow();
            assert.equal(grow.name, "Only Name");
            assert.equal(grow.plant, "");
            assert.equal(grow.plantAmount, 0);
            assert.equal(grow.details.strain, "");
            assert.equal(grow.status.estimatedHarvestDate, "");
            assert.equal(grow.climate.temperatureDay, 0);
            assert.equal(grow.overlayLayout, "left-rail");
            assert.equal(grow.overlayStream, "transparent");
        });
    });

    it("persists overlayLayout bottom-bar and rejects junk on read", async () => {
        await withTempDataDir(async (dir) => {
            const file = path.join(dir, "current-grow.json");
            await writeFile(file, JSON.stringify({name: "Rail Grow"}), "utf8");
            const grow = await getCurrentGrow();
            assert.equal(grow.overlayLayout, "left-rail");

            await updateCurrentGrow({
                name: grow.name,
                plant: grow.plant,
                streamUrl: grow.streamUrl,
                overlayLayout: "bottom-bar",
            });
            const saved = JSON.parse(await readFile(file, "utf8"));
            assert.equal(saved.overlayLayout, "bottom-bar");
            assert.equal((await getCurrentGrow()).overlayLayout, "bottom-bar");

            await writeFile(
                file,
                JSON.stringify({name: "Junk Layout", overlayLayout: "wide"}),
                "utf8",
            );
            assert.equal((await getCurrentGrow()).overlayLayout, "left-rail");
        });
    });

    it("persists overlayStream include and rejects junk on read", async () => {
        await withTempDataDir(async (dir) => {
            const file = path.join(dir, "current-grow.json");
            await writeFile(file, JSON.stringify({name: "Stream Grow"}), "utf8");
            const grow = await getCurrentGrow();
            assert.equal(grow.overlayStream, "transparent");

            await updateCurrentGrow({
                name: grow.name,
                plant: grow.plant,
                streamUrl: grow.streamUrl,
                overlayStream: "include",
            });
            const saved = JSON.parse(await readFile(file, "utf8"));
            assert.equal(saved.overlayStream, "include");
            assert.equal((await getCurrentGrow()).overlayStream, "include");

            await writeFile(
                file,
                JSON.stringify({name: "Junk Stream", overlayStream: "iframe"}),
                "utf8",
            );
            assert.equal((await getCurrentGrow()).overlayStream, "transparent");
        });
    });

    it("atomic write replaces the dest only after the temp file is written", async () => {
        await withTempDataDir(async (dir) => {
            const file = path.join(dir, "current-grow.json");
            await writeFile(file, JSON.stringify({name: "Before"}), "utf8");
            await atomicWriteFile(file, JSON.stringify({name: "After"}));
            assert.equal(JSON.parse(await readFile(file, "utf8")).name, "After");

            await updateCurrentGrow({
                name: "Saved Grow",
                plant: "Basil",
                streamUrl: "",
            });
            const saved = JSON.parse(await readFile(file, "utf8"));
            assert.equal(saved.name, "Saved Grow");
            assert.equal(saved.plant, "Basil");
        });
    });

    it("uses a unique temp path per atomic write, not pid-only", () => {
        const dest = path.join("data", "current-grow.json");
        const first = atomicTempPath(dest);
        const second = atomicTempPath(dest);
        assert.notEqual(first, second);
        assert.notEqual(first, `${dest}.${process.pid}.tmp`);
        assert.ok(first.startsWith(`${dest}.${process.pid}.`));
        assert.ok(first.endsWith(".tmp"));
    });

    it("overlapping atomic writes leave dest as one complete JSON payload", async () => {
        await withTempDataDir(async (dir) => {
            const file = path.join(dir, "current-grow.json");
            const alpha = JSON.stringify({name: "AAAAAAAA", payload: "A".repeat(8000)});
            const beta = JSON.stringify({name: "BBBBBBBB", payload: "B".repeat(8000)});
            await Promise.all([atomicWriteFile(file, alpha), atomicWriteFile(file, beta)]);
            const parsed = JSON.parse(await readFile(file, "utf8")) as {name: string; payload: string};
            assert.ok(parsed.name === "AAAAAAAA" || parsed.name === "BBBBBBBB");
            assert.equal(parsed.payload, parsed.name.startsWith("A") ? "A".repeat(8000) : "B".repeat(8000));
        });
    });
});
