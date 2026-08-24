import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {describe, it} from "node:test";
import {convertWebpBufferToJpeg} from "../lib/webp-still.ts";

const require = createRequire(import.meta.url);
const webp = require("webp-wasm") as {
    encode: (
        image: {data: Uint8ClampedArray; width: number; height: number},
        options: Record<string, unknown>,
    ) => Promise<Buffer>;
};

describe("convertWebpBufferToJpeg", () => {
    it("decodes a WebP still to a JPEG without native Sharp", async () => {
        const pixels = new Uint8ClampedArray([0, 160, 80, 255]);
        const encoded = await webp.encode({data: pixels, width: 1, height: 1}, {});
        const jpeg = await convertWebpBufferToJpeg(Buffer.from(encoded));
        assert.equal(jpeg[0], 0xff);
        assert.equal(jpeg[1], 0xd8);
        assert.ok(jpeg.length > 32);
    });
});
