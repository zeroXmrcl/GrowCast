import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {mergeMissingEnv, timelapseScheduleFromMesh} from "../lib/legacy-sidecar-env.ts";

describe("legacy sidecar env", () => {
    it("fills a missing camera url and keeps one that is already set", () => {
        const legacy = "RTSP_STREAM=rtsp://cam/1\nTZ=Europe/Berlin\nAPI_TOKEN=old\nSF_PASSWORD=secret\n";
        const empty = mergeMissingEnv("", legacy);
        assert.equal(empty.changed, true);
        assert.match(empty.text, /^RTSP_STREAM=rtsp:\/\/cam\/1$/m);
        assert.match(empty.text, /^TZ=Europe\/Berlin$/m);
        assert.equal(empty.text.includes("API_TOKEN"), false);
        assert.equal(empty.text.includes("SF_PASSWORD"), false);

        const kept = mergeMissingEnv("RTSP_STREAM=rtsp://keep\n", legacy);
        assert.match(kept.text, /^RTSP_STREAM=rtsp:\/\/keep$/m);
        assert.match(kept.text, /^TZ=Europe\/Berlin$/m);

        const blank = mergeMissingEnv("RTSP_STREAM=\n", "RTSP_STREAM=rtsp://cam/1\n");
        assert.equal(blank.text, "RTSP_STREAM=rtsp://cam/1\n");
    });

    it("reads schedule keys from the mesh file without inventing blanks", () => {
        assert.deepEqual(timelapseScheduleFromMesh({
            timezone: "Europe/Berlin",
            time_1: "08:00",
            time_2: "",
            interval: 15,
            timelapseLength: 12,
            timelapseQuality: "high",
        }), {
            TZ: "Europe/Berlin",
            TIME_1: "08:00",
            INTERVAL: "15",
            TIMELAPSE_LENGTH_SECONDS: "12",
            TIMELAPSE_QUALITY: "high",
        });
    });
});
