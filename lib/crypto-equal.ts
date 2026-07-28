import {timingSafeEqual} from "node:crypto";

/** Constant-time equality for UTF-8 text (length mismatch → false). */
export function safeEqualText(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
}

/** Constant-time equality for buffers (length mismatch → false). */
export function safeEqualBuffer(left: Buffer, right: Buffer): boolean {
    if (left.length !== right.length) {
        return false;
    }

    return timingSafeEqual(left, right);
}
