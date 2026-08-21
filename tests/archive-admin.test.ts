import assert from "node:assert/strict";
import {mkdir, mkdtemp, readdir, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {parseArchiveEditForm} from "../lib/admin/parse-grow-form.ts";
import {
    completeCurrentGrow,
    deleteArchiveMediaFiles,
    deleteArchivedGrow,
    getArchivedGrow,
    getArchiveSnapshotFiles,
    listArchivedGrows,
    updateArchivedGrow,
    type ArchiveMediaSources,
} from "../lib/archives.ts";

async function withTempEnv<T>(
    fn: (sources: ArchiveMediaSources) => Promise<T>,
): Promise<T> {
    const root = await mkdtemp(path.join(os.tmpdir(), "growcast-archive-admin-"));
    const dataDir = path.join(root, "data");
    const sources: ArchiveMediaSources = {
        snapshotsDir: path.join(root, "snapshots"),
        timelapseDir: path.join(root, "timelapse"),
        picturesDir: path.join(root, "pictures"),
    };

    await mkdir(dataDir, {recursive: true});
    await mkdir(sources.snapshotsDir, {recursive: true});
    await mkdir(sources.timelapseDir, {recursive: true});
    await mkdir(sources.picturesDir, {recursive: true});

    const previous = process.env.GROWCAST_DATA_DIR;
    process.env.GROWCAST_DATA_DIR = dataDir;
    try {
        return await fn(sources);
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(root, {recursive: true, force: true});
    }
}

async function seedArchive(sources: ArchiveMediaSources) {
    await writeFile(path.join(sources.snapshotsDir, "1000.webp"), "a");
    await writeFile(path.join(sources.snapshotsDir, "1001.webp"), "b");
    await writeFile(path.join(sources.picturesDir, "hero.jpeg"), "p");
    await writeFile(path.join(sources.timelapseDir, "latest_timelapse.mp4"), "v");

    const result = await completeCurrentGrow(
        {harvestedAt: "2026-04-20", yieldGrams: 80, finalNotes: "ok"},
        sources,
    );
    assert.equal(result.ok, true);
    if (!result.ok) {
        throw new Error(result.error);
    }
    return result.archive;
}

describe("updateArchivedGrow", () => {
    it("updates display fields and keeps the archive id stable", async () => {
        await withTempEnv(async (sources) => {
            const created = await seedArchive(sources);

            const result = await updateArchivedGrow(created.archiveId, {
                name: "Corrected Title",
                plant: "Tomato",
                strain: "Cherry",
                seededAt: "2026-01-15",
                harvestedAt: "2026-05-01",
                yieldGrams: 142.5,
                finalNotes: "  fixed notes  ",
            });

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.equal(result.archive.archiveId, created.archiveId);
            assert.equal(result.archive.grow.name, "Corrected Title");
            assert.equal(result.archive.grow.plant, "Tomato");
            assert.equal(result.archive.grow.details.strain, "Cherry");
            assert.equal(result.archive.grow.details.seededAt, "2026-01-15");
            assert.equal(result.archive.completion.harvestedAt, "2026-05-01");
            assert.equal(result.archive.completion.yieldGrams, 142.5);
            assert.equal(result.archive.completion.finalNotes, "fixed notes");

            const loaded = await getArchivedGrow(created.archiveId);
            assert.equal(loaded?.grow.name, "Corrected Title");
        });
    });

    it("keeps the previous harvest date when the new value is invalid", async () => {
        await withTempEnv(async (sources) => {
            const created = await seedArchive(sources);
            const result = await updateArchivedGrow(created.archiveId, {
                name: created.grow.name,
                plant: created.grow.plant,
                strain: created.grow.details.strain,
                seededAt: created.grow.details.seededAt,
                harvestedAt: "not-a-date",
                yieldGrams: -1,
                finalNotes: "keep",
            });

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.equal(result.archive.completion.harvestedAt, "2026-04-20");
            assert.equal(result.archive.completion.yieldGrams, null);
        });
    });
});

describe("deleteArchiveMediaFiles", () => {
    it("deletes selected files and refreshes media counts", async () => {
        await withTempEnv(async (sources) => {
            const created = await seedArchive(sources);

            const result = await deleteArchiveMediaFiles(created.archiveId, "snapshots", [
                "1000.webp",
            ]);

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.equal(result.deleted, 1);
            assert.equal(result.media.snapshotCount, 1);
            assert.equal(result.media.pictureCount, 1);
            assert.equal(result.media.hasTimelapse, true);
            assert.deepEqual(await getArchiveSnapshotFiles(created.archiveId), ["1001.webp"]);

            const afterVideo = await deleteArchiveMediaFiles(created.archiveId, "timelapse", [
                "latest_timelapse.mp4",
            ]);
            assert.equal(afterVideo.ok, true);
            if (afterVideo.ok) {
                assert.equal(afterVideo.media.hasTimelapse, false);
            }
        });
    });

    it("rejects traversal names and invalid kinds stay blocked by the filename guard", async () => {
        await withTempEnv(async (sources) => {
            const created = await seedArchive(sources);

            const result = await deleteArchiveMediaFiles(created.archiveId, "snapshots", [
                "../grow.json",
            ]);
            assert.deepEqual(result, {ok: false, error: "invalid_request"});
            assert.equal((await getArchiveSnapshotFiles(created.archiveId)).length, 2);
        });
    });
});

describe("deleteArchivedGrow", () => {
    it("removes the archive directory", async () => {
        await withTempEnv(async (sources) => {
            const created = await seedArchive(sources);

            const result = await deleteArchivedGrow(created.archiveId);
            assert.deepEqual(result, {ok: true});
            assert.equal(await getArchivedGrow(created.archiveId), null);
            assert.deepEqual(await listArchivedGrows(), []);
        });
    });

    it("rejects invalid archive ids", async () => {
        await withTempEnv(async () => {
            assert.deepEqual(await deleteArchivedGrow("../etc"), {ok: false, error: "not_found"});
            assert.deepEqual(await deleteArchivedGrow("does-not-exist"), {
                ok: false,
                error: "not_found",
            });
        });
    });
});

describe("parseArchiveEditForm", () => {
    it("parses the editable archive fields", () => {
        const form = new FormData();
        form.set("name", "Fixed Title");
        form.set("plant", "Tomato");
        form.set("strain", "Cherry");
        form.set("seededAt", "2026-01-01");
        form.set("harvestedAt", "2026-04-20");
        form.set("yieldGrams", "99");
        form.set("finalNotes", "notes");

        assert.deepEqual(parseArchiveEditForm(form), {
            name: "Fixed Title",
            plant: "Tomato",
            strain: "Cherry",
            seededAt: "2026-01-01",
            harvestedAt: "2026-04-20",
            yieldGrams: 99,
            finalNotes: "notes",
        });
    });
});

describe("completeCurrentGrow staging", () => {
    it("does not list a leftover staging directory as an archive", async () => {
        await withTempEnv(async (sources) => {
            const dataDir = process.env.GROWCAST_DATA_DIR;
            assert.ok(dataDir);
            const staging = path.join(dataDir, "archives", ".tmp-2026-04-20-ghost");
            await mkdir(path.join(staging, "snapshots"), {recursive: true});
            await writeFile(
                path.join(staging, "grow.json"),
                JSON.stringify({archiveId: "2026-04-20-ghost"}),
            );

            assert.deepEqual(await listArchivedGrows(), []);
            assert.deepEqual(await readdir(path.join(dataDir, "archives")), [
                ".tmp-2026-04-20-ghost",
            ]);
            void sources;
        });
    });
});
