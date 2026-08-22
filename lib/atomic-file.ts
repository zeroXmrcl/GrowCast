import {randomBytes} from "node:crypto";
import {mkdir, rename, unlink, writeFile} from "node:fs/promises";
import path from "node:path";

export function atomicTempPath(filePath: string): string {
    return `${filePath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
}

/** Write then rename so a crash cannot leave a truncated JSON file. */
export async function atomicWriteFile(filePath: string, contents: string): Promise<void> {
    await mkdir(path.dirname(filePath), {recursive: true});
    const tmp = atomicTempPath(filePath);
    try {
        await writeFile(tmp, contents, "utf8");
        await rename(tmp, filePath);
    } catch (error) {
        await unlink(tmp).catch(() => undefined);
        throw error;
    }
}
