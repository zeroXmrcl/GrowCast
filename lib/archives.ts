import {copyFile, mkdir, readdir, readFile, rename, rm, unlink} from "node:fs/promises";
import {atomicWriteFile} from "@/lib/atomic-file";
import path from "node:path";
import {asBoolean, asNumber, asString, isRecord} from "@/lib/coerce";
import {growcastDataDir} from "@/lib/data-paths";
import {
    getCurrentGrow,
    normalizeGrowRecord,
    replaceCurrentGrow,
    type GrowRecord,
} from "@/lib/db";
import {isDateOnly, todayDateOnly} from "@/lib/date-only";
import {pathExists, SNAPSHOT_DIR, TIMELAPSE_DIR} from "@/lib/extension-status";
import {mediaCollectionDir} from "@/lib/media-library";
import {
    IMAGE_EXTENSIONS,
    VIDEO_EXTENSIONS,
    isSafeMediaFilename,
} from "@/lib/safe-media-filename";

export type ArchiveCompletion = {
    harvestedAt: string;
    yieldGrams: number | null;
    finalNotes: string;
};

export type ArchivedGrowMedia = {
    snapshotCount: number;
    hasTimelapse: boolean;
    pictureCount: number;
};

export type ArchivedGrow = {
    archiveId: string;
    archivedAt: string;
    completion: ArchiveCompletion;
    media: ArchivedGrowMedia;
    grow: GrowRecord;
};

export type CompleteGrowInput = ArchiveCompletion & {
    expectedGrowId?: string;
};

export type CompleteGrowResult =
    | {ok: true; archive: ArchivedGrow}
    | {ok: false; error: string};

export const ARCHIVE_MEDIA_KINDS = ["snapshots", "timelapse", "pictures"] as const;
export type ArchiveMediaKind = (typeof ARCHIVE_MEDIA_KINDS)[number];

export function isArchiveMediaKind(value: string): value is ArchiveMediaKind {
    return (ARCHIVE_MEDIA_KINDS as readonly string[]).includes(value);
}

/** Source directories the completed grow's media is copied from (overridable for tests). */
export type ArchiveMediaSources = {
    snapshotsDir: string;
    timelapseDir: string;
    picturesDir: string;
};

const ARCHIVE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function archivesDir(): string {
    return path.join(growcastDataDir(), "archives");
}

export function isValidArchiveId(value: string): boolean {
    return ARCHIVE_ID_PATTERN.test(value);
}

export function archiveMediaDir(archiveId: string, kind: ArchiveMediaKind): string {
    return path.join(archivesDir(), archiveId, kind);
}

function archiveGrowFile(archiveId: string): string {
    return path.join(archivesDir(), archiveId, "grow.json");
}

function defaultMediaSources(): ArchiveMediaSources {
    return {
        snapshotsDir: SNAPSHOT_DIR,
        timelapseDir: TIMELAPSE_DIR,
        picturesDir: mediaCollectionDir("dashboard"),
    };
}

function slugify(value: string): string {
    const slug = value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
        .replace(/-+$/, "");
    return slug || "grow";
}

export function archiveMediaUrl(
    archiveId: string,
    kind: ArchiveMediaKind,
    filename: string,
): string {
    return `/api/archives/${archiveId}/${kind}/${encodeURIComponent(filename)}`;
}

function normalizeCompletion(
    input: {harvestedAt: string; yieldGrams: number | null; finalNotes: string},
    fallbackHarvestedAt: string,
): ArchiveCompletion {
    return {
        harvestedAt: isDateOnly(input.harvestedAt) ? input.harvestedAt : fallbackHarvestedAt,
        yieldGrams:
            typeof input.yieldGrams === "number" &&
            Number.isFinite(input.yieldGrams) &&
            input.yieldGrams >= 0
                ? input.yieldGrams
                : null,
        finalNotes: input.finalNotes.trim(),
    };
}

async function reserveArchiveId(growName: string): Promise<string> {
    const base = `${todayDateOnly()}-${slugify(growName)}`;
    let candidate = base;
    let suffix = 2;
    while (await pathExists(path.join(archivesDir(), candidate))) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
    return candidate;
}

async function listFilesByExtension(dir: string, extensions: Set<string>): Promise<string[]> {
    try {
        const entries = await readdir(dir, {withFileTypes: true});
        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => extensions.has(path.extname(name).toLowerCase()));
    } catch {
        return [];
    }
}

async function copyFiles(
    sourceDir: string,
    fileNames: string[],
    destinationDir: string,
): Promise<void> {
    for (const name of fileNames) {
        await copyFile(path.join(sourceDir, name), path.join(destinationDir, name));
    }
}

async function deleteFiles(sourceDir: string, fileNames: string[]): Promise<void> {
    await Promise.all(
        fileNames.map(async (name) => {
            try {
                await unlink(path.join(sourceDir, name));
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw error;
                }
            }
        }),
    );
}

function nextGrowId(currentId: string): string {
    const match = /^(.*?)(\d+)$/.exec(currentId);
    if (match) {
        const [, prefix, digits] = match;
        const next = String(Number(digits) + 1).padStart(digits.length, "0");
        return `${prefix}${next}`;
    }
    return `grow-${Date.now()}`;
}

/** Fresh grow for the next run: identity/lifecycle cleared, infra (stream, socials, setup, climate) kept. */
function buildNextGrow(previous: GrowRecord): GrowRecord {
    return {
        ...previous,
        id: nextGrowId(previous.id),
        name: "New Grow",
        details: {
            ...previous.details,
            strain: "",
            stage: "Seed",
            seededAt: todayDateOnly(),
            notes: "",
            updatedAt: new Date().toISOString(),
        },
        status: {
            health: "Healthy",
            estimatedHarvestDate: "",
            notes: "",
        },
    };
}

function normalizeArchivedGrow(raw: unknown, archiveId: string): ArchivedGrow | null {
    if (!isRecord(raw)) {
        return null;
    }

    const completion = isRecord(raw.completion) ? raw.completion : {};
    const media = isRecord(raw.media) ? raw.media : {};
    const rawYield = completion.yieldGrams;

    return {
        archiveId,
        archivedAt: asString(raw.archivedAt),
        completion: {
            harvestedAt: asString(completion.harvestedAt),
            yieldGrams:
                typeof rawYield === "number" && Number.isFinite(rawYield) ? rawYield : null,
            finalNotes: asString(completion.finalNotes),
        },
        media: {
            snapshotCount: asNumber(media.snapshotCount, 0),
            hasTimelapse: asBoolean(media.hasTimelapse, false),
            pictureCount: asNumber(media.pictureCount, 0),
        },
        grow: normalizeGrowRecord(raw.grow),
    };
}

async function readArchivedGrow(archiveId: string): Promise<ArchivedGrow | null> {
    try {
        const content = await readFile(archiveGrowFile(archiveId), "utf8");
        return normalizeArchivedGrow(JSON.parse(content), archiveId);
    } catch {
        return null;
    }
}

export async function getArchivedGrow(archiveId: string): Promise<ArchivedGrow | null> {
    if (!isValidArchiveId(archiveId)) {
        return null;
    }
    return readArchivedGrow(archiveId);
}

export async function listArchivedGrows(): Promise<ArchivedGrow[]> {
    let entries;
    try {
        entries = await readdir(archivesDir(), {withFileTypes: true});
    } catch {
        return [];
    }

    const records = await Promise.all(
        entries
            .filter((entry) => entry.isDirectory() && isValidArchiveId(entry.name))
            .map((entry) => readArchivedGrow(entry.name)),
    );

    return records
        .filter((record): record is ArchivedGrow => record !== null)
        .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

export async function getArchiveSnapshotFiles(archiveId: string): Promise<string[]> {
    if (!isValidArchiveId(archiveId)) {
        return [];
    }
    const files = await listFilesByExtension(
        archiveMediaDir(archiveId, "snapshots"),
        IMAGE_EXTENSIONS,
    );
    return files.sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));
}

export async function getArchivePictureFiles(archiveId: string): Promise<string[]> {
    if (!isValidArchiveId(archiveId)) {
        return [];
    }
    const files = await listFilesByExtension(
        archiveMediaDir(archiveId, "pictures"),
        IMAGE_EXTENSIONS,
    );
    return files.sort((a, b) =>
        a.localeCompare(b, undefined, {numeric: true, sensitivity: "base"}),
    );
}

export async function getArchiveTimelapseFile(archiveId: string): Promise<string | null> {
    if (!isValidArchiveId(archiveId)) {
        return null;
    }
    const files = await listFilesByExtension(
        archiveMediaDir(archiveId, "timelapse"),
        VIDEO_EXTENSIONS,
    );
    files.sort((a, b) => b.localeCompare(a, undefined, {numeric: true}));
    return files[0] ?? null;
}

/**
 * Freeze the current grow into data/archives/<archiveId>/ and reset the current grow.
 * Media is copied into a hidden staging dir, grow.json is written last, then the
 * dir is renamed onto the public id. Sources are deleted only after the current
 * grow reset succeeds. Failed attempts stay invisible to listArchivedGrows.
 */
export type ResetLiveGrow = (grow: GrowRecord) => Promise<void>;

export async function completeCurrentGrow(
    input: CompleteGrowInput,
    sources: ArchiveMediaSources = defaultMediaSources(),
    resetLiveGrow?: ResetLiveGrow,
): Promise<CompleteGrowResult> {
    const grow = await getCurrentGrow();
    if (input.expectedGrowId && input.expectedGrowId !== grow.id) {
        return {ok: false, error: "stale_grow"};
    }
    const already = await findArchiveForGrowId(grow.id);
    if (already) {
        return {ok: false, error: "already_archived"};
    }

    const archiveId = await reserveArchiveId(grow.name);
    const stagingRoot = path.join(archivesDir(), `.tmp-${archiveId}`);
    const destinationRoot = path.join(archivesDir(), archiveId);

    try {
        const snapshotFiles = await listFilesByExtension(sources.snapshotsDir, IMAGE_EXTENSIONS);
        const timelapseFiles = await listFilesByExtension(sources.timelapseDir, VIDEO_EXTENSIONS);
        const pictureFiles = await listFilesByExtension(sources.picturesDir, IMAGE_EXTENSIONS);

        const archive: ArchivedGrow = {
            archiveId,
            archivedAt: new Date().toISOString(),
            completion: normalizeCompletion(input, todayDateOnly()),
            media: {
                snapshotCount: snapshotFiles.length,
                hasTimelapse: timelapseFiles.length > 0,
                pictureCount: pictureFiles.length,
            },
            grow,
        };

        for (const kind of ARCHIVE_MEDIA_KINDS) {
            await mkdir(path.join(stagingRoot, kind), {recursive: true});
        }

        await copyFiles(sources.snapshotsDir, snapshotFiles, path.join(stagingRoot, "snapshots"));
        await copyFiles(sources.timelapseDir, timelapseFiles, path.join(stagingRoot, "timelapse"));
        await copyFiles(sources.picturesDir, pictureFiles, path.join(stagingRoot, "pictures"));
        await atomicWriteFile(
            path.join(stagingRoot, "grow.json"),
            JSON.stringify(archive, null, 2),
        );
        await rename(stagingRoot, destinationRoot);
        const reset = resetLiveGrow ?? ((current: GrowRecord) => replaceCurrentGrow(buildNextGrow(current)));
        await reset(grow);

        const cleanup = await Promise.allSettled([
            deleteFiles(sources.snapshotsDir, snapshotFiles),
            deleteFiles(sources.timelapseDir, timelapseFiles),
            deleteFiles(sources.picturesDir, pictureFiles),
        ]);
        if (cleanup.some((entry) => entry.status === "rejected")) {
            return {ok: false, error: "media_cleanup_failed"};
        }

        return {ok: true, archive};
    } catch (error) {
        await rm(stagingRoot, {recursive: true, force: true}).catch(() => undefined);
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function findArchiveForGrowId(growId: string): Promise<ArchivedGrow | null> {
    if (!growId) {
        return null;
    }
    const archives = await listArchivedGrows();
    return archives.find((entry) => entry.grow.id === growId) ?? null;
}

/** Editable subset of an archived grow; everything else stays frozen. */
export type ArchiveEditInput = {
    name: string;
    plant: string;
    strain: string;
    seededAt: string;
    harvestedAt: string;
    yieldGrams: number | null;
    finalNotes: string;
};

export type UpdateArchivedGrowResult =
    | {ok: true; archive: ArchivedGrow}
    | {ok: false; error: "not_found" | "update_failed"};

export async function updateArchivedGrow(
    archiveId: string,
    edits: ArchiveEditInput,
): Promise<UpdateArchivedGrowResult> {
    const existing = await getArchivedGrow(archiveId);
    if (!existing) {
        return {ok: false, error: "not_found"};
    }

    // The archiveId (and its name-based slug) stays stable so public URLs keep working.
    const next: ArchivedGrow = {
        ...existing,
        completion: normalizeCompletion(edits, existing.completion.harvestedAt),
        grow: {
            ...existing.grow,
            name: edits.name.trim() || existing.grow.name,
            plant: edits.plant.trim(),
            details: {
                ...existing.grow.details,
                strain: edits.strain.trim(),
                seededAt: isDateOnly(edits.seededAt)
                    ? edits.seededAt
                    : existing.grow.details.seededAt,
            },
        },
    };

    try {
        await atomicWriteFile(archiveGrowFile(archiveId), JSON.stringify(next, null, 2));
        return {ok: true, archive: next};
    } catch {
        return {ok: false, error: "update_failed"};
    }
}

async function recountArchiveMedia(archiveId: string): Promise<ArchivedGrowMedia> {
    const [snapshots, pictures, videos] = await Promise.all([
        listFilesByExtension(archiveMediaDir(archiveId, "snapshots"), IMAGE_EXTENSIONS),
        listFilesByExtension(archiveMediaDir(archiveId, "pictures"), IMAGE_EXTENSIONS),
        listFilesByExtension(archiveMediaDir(archiveId, "timelapse"), VIDEO_EXTENSIONS),
    ]);

    return {
        snapshotCount: snapshots.length,
        pictureCount: pictures.length,
        hasTimelapse: videos.length > 0,
    };
}

export type DeleteArchiveMediaResult =
    | {ok: true; deleted: number; media: ArchivedGrowMedia}
    | {ok: false; error: "not_found" | "invalid_request" | "delete_failed"};

export async function deleteArchiveMediaFiles(
    archiveId: string,
    kind: ArchiveMediaKind,
    filenames: string[],
): Promise<DeleteArchiveMediaResult> {
    if (!isValidArchiveId(archiveId) || filenames.length === 0) {
        return {ok: false, error: "invalid_request"};
    }

    const allowedExtensions = kind === "timelapse" ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS;
    const dir = path.resolve(archiveMediaDir(archiveId, kind));

    for (const name of filenames) {
        if (!isSafeMediaFilename(name, allowedExtensions)) {
            return {ok: false, error: "invalid_request"};
        }
        if (path.dirname(path.resolve(dir, name)) !== dir) {
            return {ok: false, error: "invalid_request"};
        }
    }

    const existing = await getArchivedGrow(archiveId);
    if (!existing) {
        return {ok: false, error: "not_found"};
    }

    let deleted = 0;
    try {
        for (const name of filenames) {
            try {
                await unlink(path.resolve(dir, name));
                deleted += 1;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                    throw error;
                }
            }
        }

        const media = await recountArchiveMedia(archiveId);
        const next: ArchivedGrow = {...existing, media};
        await atomicWriteFile(archiveGrowFile(archiveId), JSON.stringify(next, null, 2));

        return {ok: true, deleted, media};
    } catch {
        return {ok: false, error: "delete_failed"};
    }
}

export type DeleteArchivedGrowResult =
    | {ok: true}
    | {ok: false; error: "not_found" | "delete_failed"};

export async function deleteArchivedGrow(archiveId: string): Promise<DeleteArchivedGrowResult> {
    if (!isValidArchiveId(archiveId)) {
        return {ok: false, error: "not_found"};
    }

    const dir = path.join(archivesDir(), archiveId);
    if (!(await pathExists(dir))) {
        return {ok: false, error: "not_found"};
    }

    try {
        await rm(dir, {recursive: true, force: true});
        return {ok: true};
    } catch {
        return {ok: false, error: "delete_failed"};
    }
}
