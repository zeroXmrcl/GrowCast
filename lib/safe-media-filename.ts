import path from "node:path";

export const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
export const VIDEO_EXTENSIONS = new Set([".mp4"]);

export function isSafeMediaFilename(
    name: string,
    allowedExtensions: Set<string> = IMAGE_EXTENSIONS,
): boolean {
    if (name.length === 0 || name.length > 255) {
        return false;
    }
    if (name.startsWith(".")) {
        return false;
    }
    if (
        name.includes("/") ||
        name.includes("\\") ||
        name.includes("..") ||
        name.includes("\0")
    ) {
        return false;
    }
    return allowedExtensions.has(path.extname(name).toLowerCase());
}
