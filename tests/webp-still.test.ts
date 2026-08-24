import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {describe, it} from "node:test";
import {existsSync} from "node:fs";
import {
    convertWebpBufferToJpeg,
    MAX_WEBP_COMPRESSED_BYTES,
    webpWasmDecoderFiles,
} from "../lib/webp-still.ts";

const require = createRequire(import.meta.url);
const webp = require("webp-wasm") as {
    encode: (
        image: {data: Uint8ClampedArray; width: number; height: number},
        options: Record<string, unknown>,
    ) => Promise<Buffer>;
};

describe("webpWasmDecoderFiles", () => {
    it("points at process.cwd node_modules, not a bundled /ROOT path", () => {
        const files = webpWasmDecoderFiles();
        assert.equal(files.wasm.includes(`${"ROOT"}`), false);
        assert.match(files.wasm, /webp_node_dec\.wasm$/);
        assert.equal(existsSync(files.wasm), true);
        assert.equal(existsSync(files.factory), true);
    });
});

describe("convertWebpBufferToJpeg", () => {
    it("decodes a WebP still to a JPEG without native Sharp", async () => {
        const pixels = new Uint8ClampedArray([0, 160, 80, 255]);
        const encoded = await webp.encode({data: pixels, width: 1, height: 1}, {});
        const jpeg = await convertWebpBufferToJpeg(Buffer.from(encoded));
        assert.equal(jpeg[0], 0xff);
        assert.equal(jpeg[1], 0xd8);
        assert.ok(jpeg.length > 32);
    });

    it("rejects oversized compressed input before decode", async () => {
        const huge = Buffer.alloc(MAX_WEBP_COMPRESSED_BYTES + 1);
        await assert.rejects(
            () => convertWebpBufferToJpeg(huge),
            /compressed input exceeds size limit/,
        );
    });
});
