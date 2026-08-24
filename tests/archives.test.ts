import assert from "node:assert/strict";
import {access, mkdir, mkdtemp, readdir, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {describe, it} from "node:test";
import {parseCompleteGrowForm} from "../lib/admin/parse-grow-form.ts";
import {
    archivesDir,
    completeCurrentGrow,
    getArchivedGrow,
    getArchivePictureFiles,
    getArchiveSnapshotFiles,
    getArchiveTimelapseFile,
    isValidArchiveId,
    listArchivedGrows,
    type ArchiveMediaSources,
} from "../lib/archives.ts";
import {getCurrentGrow, updateCurrentGrow} from "../lib/db.ts";

type TempEnv = {
    root: string;
    sources: ArchiveMediaSources;
};

async function withTempEnv<T>(fn: (env: TempEnv) => Promise<T>): Promise<T> {
    const root = await mkdtemp(path.join(os.tmpdir(), "growcast-archive-"));
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
        return await fn({root, sources});
    } finally {
        if (previous === undefined) {
            delete process.env.GROWCAST_DATA_DIR;
        } else {
            process.env.GROWCAST_DATA_DIR = previous;
        }
        await rm(root, {recursive: true, force: true});
    }
}

describe("completeCurrentGrow", () => {
    it("archives details and media, then resets the current grow", async () => {
        await withTempEnv(async ({sources}) => {
            await updateCurrentGrow({
                name: "Blue Dream Run",
                plant: "Cannabis",
                plantAmount: 2,
                streamUrl: "https://example.com/stream",
                details: {
                    strain: "Blue Dream",
                    stage: "Drying",
                    seededAt: "2026-01-01",
                    lightSchedule: "12/12",
                    notes: "grow notes",
                },
                growSetup: {setupText: "tent", growingMedium: "Coco", potSizeLiters: 11},
                socials: {youtube: "https://youtube.com/@example"},
            });

            await writeFile(path.join(sources.snapshotsDir, "1000.webp"), "a");
            await writeFile(path.join(sources.snapshotsDir, "1001.webp"), "b");
            await writeFile(path.join(sources.snapshotsDir, "ignore.txt"), "x");
            await writeFile(path.join(sources.timelapseDir, "latest_timelapse.mp4"), "v");
            await writeFile(path.join(sources.picturesDir, "IMG_1.jpeg"), "p");

            const result = await completeCurrentGrow(
                {harvestedAt: "2026-04-20", yieldGrams: 120.5, finalNotes: "  great run  "},
                sources,
            );

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }

            const {archive} = result;
            assert.equal(isValidArchiveId(archive.archiveId), true);
            assert.match(archive.archiveId, /^\d{4}-\d{2}-\d{2}-blue-dream-run$/);
            assert.equal(archive.completion.harvestedAt, "2026-04-20");
            assert.equal(archive.completion.yieldGrams, 120.5);
            assert.equal(archive.completion.finalNotes, "great run");
            assert.equal(archive.media.snapshotCount, 2);
            assert.equal(archive.media.hasTimelapse, true);
            assert.equal(archive.media.pictureCount, 1);
            assert.equal(archive.grow.name, "Blue Dream Run");
            assert.equal(archive.grow.details.strain, "Blue Dream");

            assert.deepEqual(await getArchiveSnapshotFiles(archive.archiveId), [
                "1001.webp",
                "1000.webp",
            ]);
            assert.equal(
                await getArchiveTimelapseFile(archive.archiveId),
                "latest_timelapse.mp4",
            );
            assert.deepEqual(await getArchivePictureFiles(archive.archiveId), ["IMG_1.jpeg"]);

            const remainingSnapshots = await readdir(sources.snapshotsDir);
            assert.deepEqual(remainingSnapshots, ["ignore.txt"]);
            assert.deepEqual(await readdir(sources.timelapseDir), []);
            assert.deepEqual(await readdir(sources.picturesDir), []);

            const loaded = await getArchivedGrow(archive.archiveId);
            assert.ok(loaded);
            assert.equal(loaded.grow.details.seededAt, "2026-01-01");
            assert.equal(loaded.completion.yieldGrams, 120.5);

            const current = await getCurrentGrow();
            assert.equal(current.id, "grow-002");
            assert.equal(current.name, "New Grow");
            assert.equal(current.details.strain, "");
            assert.equal(current.details.stage, "Seed");
            assert.equal(current.details.notes, "");
            assert.match(current.details.seededAt, /^\d{4}-\d{2}-\d{2}$/);
            assert.notEqual(current.details.seededAt, "2026-01-01");
            assert.equal(current.status.health, "Healthy");
            assert.equal(current.status.estimatedHarvestDate, "");
            assert.equal(current.status.notes, "");
            assert.equal(current.streamUrl, "https://example.com/stream");
            assert.equal(current.socials.youtube, "https://youtube.com/@example");
            assert.equal(current.growSetup.growingMedium, "Coco");
            assert.equal(current.growSetup.potSizeLiters, 11);
            assert.equal(current.plant, "Cannabis");
            assert.equal(current.plantAmount, 2);
            assert.equal(current.details.lightSchedule, "12/12");
        });
    });

    it("suffixes the archive id on same-day name collisions and lists newest first", async () => {
        await withTempEnv(async ({sources}) => {
            const first = await completeCurrentGrow(
                {harvestedAt: "2026-04-01", yieldGrams: null, finalNotes: "first"},
                sources,
            );
            assert.equal(first.ok, true);
            if (!first.ok) {
                return;
            }

            await updateCurrentGrow({
                name: first.archive.grow.name,
                plant: "Tomatoes",
                streamUrl: "",
            });

            const second = await completeCurrentGrow(
                {harvestedAt: "2026-04-02", yieldGrams: null, finalNotes: "second"},
                sources,
            );
            assert.equal(second.ok, true);
            if (!second.ok) {
                return;
            }

            assert.equal(second.archive.archiveId, `${first.archive.archiveId}-2`);

            const archives = await listArchivedGrows();
            assert.equal(archives.length, 2);
            assert.ok(archives[0].archivedAt >= archives[1].archivedAt);
            assert.deepEqual(
                archives.map((a) => a.archiveId).sort(),
                [first.archive.archiveId, second.archive.archiveId].sort(),
            );
        });
    });

    it("normalizes invalid harvest dates and negative yields", async () => {
        await withTempEnv(async ({sources}) => {
            const result = await completeCurrentGrow(
                {harvestedAt: "not-a-date", yieldGrams: -5, finalNotes: ""},
                sources,
            );

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }

            assert.match(result.archive.completion.harvestedAt, /^\d{4}-\d{2}-\d{2}$/);
            assert.equal(result.archive.completion.yieldGrams, null);
        });
    });

    it("archives a grow with zero media when source folders are missing", async () => {
        await withTempEnv(async ({root}) => {
            const missingSources: ArchiveMediaSources = {
                snapshotsDir: path.join(root, "missing-snapshots"),
                timelapseDir: path.join(root, "missing-timelapse"),
                picturesDir: path.join(root, "missing-pictures"),
            };

            const result = await completeCurrentGrow(
                {harvestedAt: "2026-04-20", yieldGrams: null, finalNotes: ""},
                missingSources,
            );

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }

            assert.equal(result.archive.media.snapshotCount, 0);
            assert.equal(result.archive.media.hasTimelapse, false);
            assert.equal(result.archive.media.pictureCount, 0);
            assert.deepEqual(await getArchiveSnapshotFiles(result.archive.archiveId), []);
        });
    });

    it("rejects a stale grow id and does not create another archive", async () => {
        await withTempEnv(async ({sources}) => {
            const first = await completeCurrentGrow(
                {harvestedAt: "2026-04-20", yieldGrams: null, finalNotes: ""},
                sources,
            );
            assert.equal(first.ok, true);
            if (!first.ok) {
                return;
            }

            const second = await completeCurrentGrow(
                {
                    harvestedAt: "2026-04-21",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: first.archive.grow.id,
                },
                sources,
            );
            assert.equal(second.ok, false);
            if (!second.ok) {
                assert.equal(second.error, "stale_grow");
            }
            assert.equal((await listArchivedGrows()).length, 1);
        });
    });

    it("rejects a second complete of the same grow id and keeps the published archive", async () => {
        await withTempEnv(async ({sources}) => {
            const live = await updateCurrentGrow({
                name: "Once",
                plant: "Basil",
                streamUrl: "",
            });
            const first = await completeCurrentGrow(
                {
                    harvestedAt: "2026-04-20",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
            );
            assert.equal(first.ok, true);
            if (!first.ok) {
                return;
            }

            const duplicate = await completeCurrentGrow(
                {
                    harvestedAt: "2026-04-21",
                    yieldGrams: null,
                    finalNotes: "retry",
                    expectedGrowId: live.id,
                },
                sources,
            );
            assert.equal(duplicate.ok, false);
            if (!duplicate.ok) {
                assert.ok(duplicate.error === "stale_grow" || duplicate.error === "already_archived");
            }
            const archives = await listArchivedGrows();
            assert.equal(archives.length, 1);
            assert.equal(archives[0].archiveId, first.archive.archiveId);
        });
    });

    it("keeps a published archive if the post-rename live reset throws", async () => {
        await withTempEnv(async ({sources}) => {
            const live = await updateCurrentGrow({
                name: "Keep Archive",
                plant: "Basil",
                streamUrl: "",
            });
            await writeFile(path.join(sources.snapshotsDir, "1000.webp"), "snap");

            const result = await completeCurrentGrow(
                {
                    harvestedAt: "2026-04-20",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
                async () => {
                    throw new Error("reset exploded");
                },
            );

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.equal(result.warning, "reset_failed");
            assert.equal(result.archive.grow.id, live.id);

            const archives = await listArchivedGrows();
            assert.equal(archives.length, 1);
            const publishedId = archives[0].archiveId;
            assert.equal(archives[0].grow.id, live.id);
            await access(path.join(archivesDir(), publishedId));
            const loaded = await getArchivedGrow(publishedId);
            assert.ok(loaded);
            assert.equal(loaded.grow.name, "Keep Archive");
            assert.deepEqual(await getArchiveSnapshotFiles(publishedId), ["1000.webp"]);

            const current = await getCurrentGrow();
            assert.equal(current.id, live.id);
            assert.equal(current.name, "Keep Archive");
        });
    });

    it("reports success with a cleanup warning when live media deletes fail after publish", async () => {
        await withTempEnv(async ({sources}) => {
            const live = await updateCurrentGrow({
                name: "Cleanup Fail",
                plant: "Basil",
                streamUrl: "",
            });
            await writeFile(path.join(sources.snapshotsDir, "1000.webp"), "snap");

            const result = await completeCurrentGrow(
                {
                    harvestedAt: "2026-04-20",
                    yieldGrams: null,
                    finalNotes: "",
                    expectedGrowId: live.id,
                },
                sources,
                async () => {
                    await rm(path.join(sources.snapshotsDir, "1000.webp"));
                    await mkdir(path.join(sources.snapshotsDir, "1000.webp"));
                },
            );

            assert.equal(result.ok, true);
            if (!result.ok) {
                return;
            }
            assert.equal(result.warning, "media_cleanup_failed");
            const archives = await listArchivedGrows();
            assert.equal(archives.length, 1);
            assert.equal(archives[0].grow.id, live.id);
            await access(path.join(archivesDir(), archives[0].archiveId));
        });
    });
});

describe("parseCompleteGrowForm", () => {
    it("parses completion fields with optional yield", () => {
        const form = new FormData();
        form.set("harvestedAt", "2026-04-20");
        form.set("yieldGrams", "150.5");
        form.set("finalNotes", "solid harvest");

        assert.deepEqual(parseCompleteGrowForm(form), {
            harvestedAt: "2026-04-20",
            yieldGrams: 150.5,
            finalNotes: "solid harvest",
        });
    });

    it("parses growId as expectedGrowId for complete CAS", () => {
        const form = new FormData();
        form.set("harvestedAt", "2026-04-20");
        form.set("growId", "grow-001");

        assert.deepEqual(parseCompleteGrowForm(form), {
            harvestedAt: "2026-04-20",
            yieldGrams: null,
            finalNotes: "",
            expectedGrowId: "grow-001",
        });
    });

    it("returns null yield and empty strings when fields are missing", () => {
        const form = new FormData();

        assert.deepEqual(parseCompleteGrowForm(form), {
            harvestedAt: "",
            yieldGrams: null,
            finalNotes: "",
        });
    });
});
