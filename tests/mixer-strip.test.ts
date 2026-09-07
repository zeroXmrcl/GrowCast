import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("mixer strip", () => {
    it("puts MixerStrip under ProgramMonitor, not in the Twitch rack", () => {
        const page = src(path.join("app", "admin", "stream", "page.tsx"));
        assert.match(page, /ProgramMonitor/);
        assert.match(page, /MixerStrip/);
        const twitch = src(path.join("app", "admin", "restream-panel.tsx"));
        assert.doesNotMatch(twitch, /MixerStrip/);
    });

    it("wires pause, volume, and send-alert fields to program audio actions", () => {
        const strip = src(path.join("app", "admin", "mixer-strip.tsx"));
        assert.match(strip, /name="paused"/);
        assert.match(strip, /name="volume"/);
        assert.match(strip, /name="alertBody"/);
        assert.match(strip, /saveProgramAudioAction/);
        assert.match(strip, /sendProgramAlertAction/);
        const page = src(path.join("app", "admin", "stream", "page.tsx"));
        assert.match(page, /readRestreamAudio/);
        assert.match(page, /MixerStrip audio=\{audio\}/);
        const actions = src(path.join("app", "admin", "actions.ts"));
        assert.match(actions, /export async function saveProgramAudioAction/);
        assert.match(actions, /export async function sendProgramAlertAction/);
        assert.match(actions, /writeRestreamAudio/);
        assert.match(actions, /audio_saved/);
        assert.match(actions, /alert_sent/);
    });
});
