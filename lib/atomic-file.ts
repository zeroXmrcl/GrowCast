import {randomBytes} from "node:crypto";
import {chmod, mkdir, rename, unlink, writeFile} from "node:fs/promises";
import path from "node:path";

export function atomicTempPath(filePath: string): string {
    return `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
}

async function renameOver(tmp: string, filePath: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            await rename(tmp, filePath);
            return;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (attempt < 4 && (code === "EPERM" || code === "EBUSY" || code === "EACCES")) {
                await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
                continue;
            }
            throw error;
        }
    }
}

/** Write then rename so a crash cannot leave a truncated JSON file. */
export async function atomicWriteFile(
    filePath: string,
    contents: string,
    mode?: number,
): Promise<void> {
    await mkdir(path.dirname(filePath), {recursive: true});
    const tmp = atomicTempPath(filePath);
    try {
        await writeFile(tmp, contents, {encoding: "utf8", mode});
        await renameOver(tmp, filePath);
        if (mode !== undefined) {
            await chmod(filePath, mode).catch(() => undefined);
        }
    } catch (error) {
        await unlink(tmp).catch(() => undefined);
        throw error;
    }
}
