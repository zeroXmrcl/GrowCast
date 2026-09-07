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

    it("bakes EXIF orientation 6 into pixels without Sharp", async () => {
        const input = await sharp({
            create: {width: 200, height: 100, channels: 3, background: {r: 40, g: 120, b: 60}},
        })
            .jpeg({quality: 90})
            .withMetadata({orientation: 6})
            .toBuffer();

        const result = await encodeUploadedImage(input, {allowSharp: false});
        assert.equal(result.ok, true);
        if (!result.ok) {
            return;
        }
        const meta = await sharp(result.value.data).metadata();
        assert.equal(meta.width, 100);
        assert.equal(meta.height, 200);
        assert.ok(meta.orientation === undefined || meta.orientation === 1);
    });
});

