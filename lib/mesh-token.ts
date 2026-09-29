import {randomBytes} from "node:crypto";
import {chmod, mkdir, readFile, writeFile} from "node:fs/promises";
import {readFileSync} from "node:fs";
import path from "node:path";
import {growcastDataDir} from "@/lib/data-paths";

export function meshTokenPath(): string {
    return path.join(growcastDataDir(), "mesh.token");
}

function trimToken(value: string | undefined): string | undefined {
    const token = value?.trim() ?? "";
    return token.length > 0 ? token : undefined;
}

/** Token already on disk. Does not create one. */
export function readStoredMeshToken(): string | undefined {
    try {
        return trimToken(readFileSync(meshTokenPath(), "utf8"));
    } catch {
        return undefined;
    }
}

/**
 * Env token wins and is copied onto disk so sidecars share it.
 * Otherwise the file is kept. A missing token is generated once.
 */
export async function ensureMeshToken(
    env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
    const fromEnv = trimToken(env.GROWCAST_MESH_TOKEN);
    const file = meshTokenPath();
    await mkdir(path.dirname(file), {recursive: true});
    if (fromEnv) {
        const current = readStoredMeshToken();
        if (current !== fromEnv) {
            await writeFile(file, `${fromEnv}\n`, {encoding: "utf8", mode: 0o600});
            await chmod(file, 0o600).catch(() => undefined);
        }
        return fromEnv;
    }
    const stored = readStoredMeshToken();
    if (stored) {
        return stored;
    }
    const created = randomBytes(32).toString("base64url");
    await writeFile(file, `${created}\n`, {encoding: "utf8", mode: 0o600});
    await chmod(file, 0o600).catch(() => undefined);
    return created;
}

export async function readMeshTokenFile(): Promise<string | undefined> {
    try {
        return trimToken(await readFile(meshTokenPath(), "utf8"));
    } catch {
        return undefined;
    }
}
