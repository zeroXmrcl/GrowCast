import assert from "node:assert/strict";
import {describe, it} from "node:test";
import sharp from "sharp";
import {encodeUploadedImage} from "../lib/image-encode.ts";

describe("encodeUploadedImage", () => {
    it("decodes a 24MP-class jpeg without Sharp (iPhone camera photos)", async () => {
        const input = await sharp({
            create: {width: 5600, height: 4200, channels: 3, background: {r: 40, g: 80, b: 20}},
        })
            .jpeg({quality: 70})
            .toBuffer();

        const result = await encodeUploadedImage(input, {allowSharp: false});
        assert.equal(result.ok, true);
        if (!result.ok) {
            return;
        }
        assert.ok(result.value.data.length > 100);
        assert.ok(result.value.extension === "jpeg" || result.value.extension === "webp");
    });
});
