import { readdir } from "node:fs/promises";
import { join } from "node:path";

export const directory = join(process.cwd(), "public", "yourPictures");

export default async function getDashPics(): Promise<string[]> {
    try {
        const entries = await readdir(directory, { withFileTypes: true });

        return entries
            .filter((entry) => entry.isFile())
            .map((entry) => entry.name)
            .filter((name) => /\.(webp|jpg|jpeg|png)$/i.test(name))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            .map((name) => `/yourPictures/${encodeURIComponent(name)}`);
    } catch {
        return [];
    }
}