import {copyFile, mkdir, readdir, readFile, rename, unlink, writeFile} from "node:fs/promises";
import path from "node:path";
import {asBoolean, asNumber, asString, isRecord} from "@/lib/coerce";
import {growcastDataDir} from "@/lib/data-paths";
import {
    getCurrentGrow,
    normalizeGrowRecord,
    replaceCurrentGrow,
    type GrowRecord,
} from "@/lib/db";
import {pathExists, SNAPSHOT_DIR, TIMELAPSE_DIR} from "@/lib/extension-status";

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

export type CompleteGrowInput = ArchiveCompletion;

export type CompleteGrowResult =
    | {ok: true; archive: ArchivedGrow}
    | {ok: false; error: string};

export const ARCHIVE_MEDIA_KINDS = ["snapshots", "timelapse", "pictures"] as const;
export type ArchiveMediaKind = (typeof ARCHIVE_MEDIA_KINDS)[number];

export function isArchiveMediaKind(value: string): value is ArchiveMediaKind {
    return (ARCHIVE_MEDIA_KINDS as readonly string[]).includes(value);
}

/** Source directories the completed grow's media is moved out of (overridable for tests). */
export type ArchiveMediaSources = {
    snapshotsDir: string;
    timelapseDir: string;
    picturesDir: string;
};

const IMAGE_EXTENSIONS = new Set([".webp", ".jpg", ".jpeg", ".png"]);
const VIDEO_EXTENSIONS = new Set([".mp4"]);
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
        picturesDir: path.join(process.cwd(), "public", "yourPictures"),
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

function todayDateOnly(): string {
    return new Date().toISOString().slice(0, 10);
}

function isDateOnly(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
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

/** Rename with EXDEV fallback: extensions/ and data/ are separate bind mounts in Docker. */
async function moveFile(source: string, destination: string): Promise<void> {
    try {
        await rename(source, destination);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
            throw error;
        }
        await copyFile(source, destination);
        await unlink(source);
    }
}

async function moveFiles(
    sourceDir: string,
    fileNames: string[],
    destinationDir: string,
): Promise<void> {
    for (const name of fileNames) {
        await moveFile(path.join(sourceDir, name), path.join(destinationDir, name));
    }
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

    const archives: ArchivedGrow[] = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || !isValidArchiveId(entry.name)) {
            continue;
        }
        const record = await readArchivedGrow(entry.name);
        if (record) {
            archives.push(record);
        }
    }

    return archives.sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
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
 * Order: register archive (grow.json) → move media → reset current grow.
 * Any failure aborts with an error and leaves the current grow untouched.
 */
export async function completeCurrentGrow(
    input: CompleteGrowInput,
    sources: ArchiveMediaSources = defaultMediaSources(),
): Promise<CompleteGrowResult> {
    try {
        const grow = await getCurrentGrow();
        const archiveId = await reserveArchiveId(grow.name);

        const snapshotFiles = await listFilesByExtension(sources.snapshotsDir, IMAGE_EXTENSIONS);
        const timelapseFiles = await listFilesByExtension(sources.timelapseDir, VIDEO_EXTENSIONS);
        const pictureFiles = await listFilesByExtension(sources.picturesDir, IMAGE_EXTENSIONS);

        const archive: ArchivedGrow = {
            archiveId,
            archivedAt: new Date().toISOString(),
            completion: {
                harvestedAt: isDateOnly(input.harvestedAt) ? input.harvestedAt : todayDateOnly(),
                yieldGrams:
                    typeof input.yieldGrams === "number" &&
                    Number.isFinite(input.yieldGrams) &&
                    input.yieldGrams >= 0
                        ? input.yieldGrams
                        : null,
                finalNotes: input.finalNotes.trim(),
            },
            media: {
                snapshotCount: snapshotFiles.length,
                hasTimelapse: timelapseFiles.length > 0,
                pictureCount: pictureFiles.length,
            },
            grow,
        };

        for (const kind of ARCHIVE_MEDIA_KINDS) {
            await mkdir(archiveMediaDir(archiveId, kind), {recursive: true});
        }
        await writeFile(archiveGrowFile(archiveId), JSON.stringify(archive, null, 2), "utf8");

        await moveFiles(sources.snapshotsDir, snapshotFiles, archiveMediaDir(archiveId, "snapshots"));
        await moveFiles(sources.timelapseDir, timelapseFiles, archiveMediaDir(archiveId, "timelapse"));
        await moveFiles(sources.picturesDir, pictureFiles, archiveMediaDir(archiveId, "pictures"));

        await replaceCurrentGrow(buildNextGrow(grow));

        return {ok: true, archive};
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
