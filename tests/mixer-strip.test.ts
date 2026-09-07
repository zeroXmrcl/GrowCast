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
        assert.match(page, /MusicPanel/);
        const twitch = src(path.join("app", "admin", "restream-panel.tsx"));
        assert.doesNotMatch(twitch, /MixerStrip/);
    });

    it("wires MusicPanel files and URL save onto the stream racks", () => {
        const page = src(path.join("app", "admin", "stream", "page.tsx"));
        assert.match(page, /listMusicFiles/);
        assert.match(page, /MusicPanel/);
        const panel = src(path.join("app", "admin", "music-panel.tsx"));
        assert.match(panel, /title="Music"/);
        assert.match(panel, /saveProgramAudioUrlAction/);
        assert.match(panel, /\/api\/admin\/music/);
        assert.match(panel, /name="url"/);
        assert.match(panel, /name="file"/);
        assert.match(panel, /name="filename"/);
        assert.match(panel, /accept="\.mp3,\.ogg,\.wav,\.m4a"/);
        assert.match(panel, /URL wins while set/);
        assert.match(page, /waveSmoothPct=\{audio\.waveSmoothPct\}/);
        assert.match(panel, /WaveSmoothInput/);
        const smooth = src(path.join("components", "wave-smooth-input.tsx"));
        assert.match(smooth, /name="waveSmoothPct"/);
        assert.match(smooth, /Wave smoothness/);
        const actions = src(path.join("app", "admin", "actions.ts"));
        assert.match(actions, /export async function saveProgramAudioUrlAction/);
        assert.match(actions, /normalizeOptionalHttpUrl/);
        assert.match(actions, /parseWaveSmoothPct\(formData.get\("waveSmoothPct"\)\)/);
        assert.match(actions, /waveSmoothPct: existing\.waveSmoothPct/);
    });

    it("wires pause, volume, and send-alert fields to program audio actions", () => {
        const strip = src(path.join("app", "admin", "mixer-strip.tsx"));
        assert.match(strip, /name="paused"/);
        assert.match(strip, /name="volume"/);
        assert.match(strip, /name="alertBody"/);
        assert.match(strip, /saveProgramAudioAction/);
        assert.match(strip, /\/api\/admin\/program-alert/);
        assert.match(strip, /event.preventDefault/);
        assert.doesNotMatch(strip, /sendProgramAlertAction/);
        const page = src(path.join("app", "admin", "stream", "page.tsx"));
        assert.match(page, /readRestreamAudio/);
        assert.match(page, /MixerStrip audio=\{audio\}/);
        const actions = src(path.join("app", "admin", "actions.ts"));
        assert.match(actions, /export async function saveProgramAudioAction/);
        const applyAlert = src(path.join("lib", "admin", "apply-program-alert.ts"));
        assert.match(applyAlert, /publishOverlayAlert/);
        assert.match(applyAlert, /kind:\s*"manual"/);
        assert.match(actions, /writeRestreamAudio/);
        assert.match(actions, /audio_saved/);
        assert.match(actions, /readAlertsSettings/);
    });

    it("revalidates the program monitor after Broadcast grow save", () => {
        const actions = src(path.join("app", "admin", "actions.ts"));
        const start = actions.indexOf("export async function saveStreamAction");
        const end = actions.indexOf("export async function saveTimelapseAction");
        assert.ok(start >= 0 && end > start);
        const body = actions.slice(start, end);
        assert.match(body, /revalidatePath\("\/program"\)/);
        assert.match(body, /revalidatePath\("\/overlay"\)/);
    });

    it("wires AlertsPanel onto the stream racks", () => {
        const page = src(path.join("app", "admin", "stream", "page.tsx"));
        assert.match(page, /AlertsPanel/);
        assert.match(page, /readAlertsSettings/);
        assert.match(page, /readTwitchOAuthFile/);
        assert.match(page, /twitchLogin=\{oauth\?\.login/);
        const panel = src(path.join("app", "admin", "alerts-panel.tsx"));
        assert.match(panel, /title="Alerts"/);
        assert.match(panel, /saveAlertsSettingsAction/);
        assert.match(panel, /\/admin\/stream\/twitch-connect/);
        assert.match(panel, /Connect Twitch/);
        assert.match(panel, /Connected as \$\{twitchLogin\}/);
        assert.match(panel, /name="follow"/);
        assert.match(panel, /name="sub"/);
        assert.match(panel, /name="raid"/);
        assert.match(panel, /name="bits"/);
        assert.match(panel, /name="stingEnabled"/);
        assert.match(panel, /Alert sound/);
        assert.match(panel, /disabled=\{!connected\}/);
        assert.match(panel, /name="alertScalePct"/);
        assert.match(panel, /Alert scale/);
        const actions = src(path.join("app", "admin", "actions.ts"));
        assert.match(actions, /export async function saveAlertsSettingsAction/);
        assert.match(actions, /writeAlertsSettings/);
        assert.match(actions, /alerts_saved/);
        assert.match(actions, /parseOverlayScalePct\(formData.get\("alertScalePct"\)\)/);
    });
});
