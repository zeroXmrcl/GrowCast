import {readdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";

function climateDir(): string {
    const dataDir = process.env.GROWCAST_DATA_DIR ?? path.join(process.cwd(), "data");
    return path.join(dataDir, "plugins", "growcast.ggs", "climate", "current");
}

export async function onGrowArchived(ctx: {destDir: string}): Promise<void> {
    const days: Record<string, unknown> = {};
    let names: string[] = [];
    try {
        names = await readdir(climateDir());
    } catch {
        names = [];
    }
    for (const name of names) {
        if (!name.endsWith(".json")) {
            continue;
        }
        days[name.slice(0, -5)] = JSON.parse(await readFile(path.join(climateDir(), name), "utf8")) as unknown;
    }
    await writeFile(path.join(ctx.destDir, "climate.json"), JSON.stringify({days}));
}

export async function onGrowReset(): Promise<void> {
    await rm(climateDir(), {recursive: true, force: true});
}

export async function climatePointsForWindow(): Promise<unknown[]> {
    let names: string[] = [];
    try {
        names = await readdir(climateDir());
    } catch {
        return [];
    }
    const points: unknown[] = [];
    for (const name of names) {
        if (!name.endsWith(".json")) {
            continue;
        }
        const raw = JSON.parse(await readFile(path.join(climateDir(), name), "utf8")) as {points?: unknown};
        if (Array.isArray(raw.points)) {
            points.push(...raw.points);
        }
    }
    return points;
}
