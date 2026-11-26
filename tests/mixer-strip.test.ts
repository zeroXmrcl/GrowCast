import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("mixer strip", () => {
    it("puts MixerStrip under ProgramMonitor, not in the Twitch rack", () => {
        const page = src(path.join("plugins", "restream", "admin", "page.tsx"));
        assert.match(page, /ProgramMonitor/);
        assert.match(page, /MixerStrip/);
        assert.match(page, /MusicPanel/);
        const twitch = src(path.join("plugins", "restream", "admin", "restream-panel.tsx"));
        assert.doesNotMatch(twitch, /MixerStrip/);
    });

    it("wires MusicPanel files and URL save onto the stream racks", () => {
        const page = src(path.join("plugins", "restream", "admin", "page.tsx"));
        const host = src(path.join("plugins", "restream", "host", "index.ts"));
        assert.match(host, /listMusicFiles/);
        assert.match(page, /MusicPanel/);
        const panel = src(path.join("plugins", "restream", "admin", "music-panel.tsx"));
        assert.match(panel, /title="Music"/);
        assert.match(panel, /actionPath="program-audio-url"/);
        assert.match(panel, /\/api\/admin\/music/);
        assert.match(panel, /name="url"/);
        assert.match(panel, /name="file"/);
        assert.match(panel, /multiple/);
        assert.match(panel, /Upload tracks/);
        assert.match(panel, /name="filename"/);
        assert.match(panel, /accept="\.mp3,\.ogg,\.wav,\.m4a"/);
        assert.match(page, /waveSmoothPct=\{audio\.waveSmoothPct\}/);
        assert.match(page, /musicLook=\{audio\.musicLook\}/);
        assert.match(page, /waveBars=\{audio\.waveBars\}/);
        assert.match(host, /readRestreamAudio/);
        assert.match(panel, /WaveSmoothInput/);
        assert.match(panel, /name="musicLook"/);
        assert.match(panel, /value="wave"/);
        assert.match(panel, /value="player"/);
        assert.match(panel, /WaveBarsInput/);
        const bars = src(path.join("plugins", "restream", "ui", "wave-bars-input.tsx"));
        assert.match(bars, /name="waveBars"/);
        assert.match(bars, /WAVE_BARS_MIN/);
        assert.match(bars, /Bars/);
        const smooth = src(path.join("plugins", "restream", "ui", "wave-smooth-input.tsx"));
        assert.match(smooth, /name="waveSmoothPct"/);
        assert.match(smooth, /Wave smoothness/);
        const actions = src(path.join("plugins", "restream", "admin", "actions.ts"));
        assert.match(actions, /export async function saveProgramAudioUrlAction/);
        assert.match(actions, /normalizeOptionalHttpUrl/);
        assert.match(actions, /parseWaveSmoothPct\(formData.get\("waveSmoothPct"\)\)/);
        assert.match(actions, /parseMusicLook\(formData.get\("musicLook"\)\)/);
        assert.match(actions, /parseWaveBars\(formData.get\("waveBars"\)\)/);
        assert.match(actions, /waveSmoothPct: existing\.waveSmoothPct/);
        assert.match(actions, /musicLook: existing\.musicLook/);
        assert.match(actions, /waveBars: existing\.waveBars/);
    });

    it("wires pause, volume, and send-alert fields to program audio actions", () => {
        const strip = src(path.join("plugins", "restream", "admin", "mixer-strip.tsx"));
        assert.match(strip, /name="paused"/);
        assert.match(strip, /name="volume"/);
        assert.match(strip, /name="alertBody"/);
        assert.match(strip, /actionPath="program-audio"/);
        assert.match(strip, /\/api\/admin\/program-alert/);
        assert.match(strip, /event.preventDefault/);
        assert.doesNotMatch(strip, /sendProgramAlertAction/);
        const page = src(path.join("plugins", "restream", "admin", "page.tsx"));
        assert.match(page, /MixerStrip audio=\{audio\}/);
        const actions = src(path.join("plugins", "restream", "admin", "actions.ts"));
        assert.match(actions, /export async function saveProgramAudioAction/);
        const applyAlert = src(path.join("plugins", "restream", "admin", "apply-program-alert.ts"));
        assert.match(applyAlert, /publishOverlayAlert/);
        assert.match(applyAlert, /kind:\s*"manual"/);
        assert.match(actions, /writeRestreamAudio/);
        assert.match(actions, /audio_saved/);
    });

    it("revalidates the program monitor after Broadcast plugin saves", () => {
        const actions = src(path.join("plugins", "restream", "admin", "actions.ts"));
        assert.match(actions, /revalidatePath\("\/p\/restream\/program"\)/);
        assert.match(src(path.join("app", "admin", "actions.ts")), /revalidatePath\("\/overlay"\)/);
    });

    it("wires AlertsPanel onto the stream racks", () => {
        const page = src(path.join("plugins", "restream", "admin", "page.tsx"));
        const host = src(path.join("plugins", "restream", "host", "index.ts"));
        assert.match(page, /AlertsPanel/);
        assert.match(host, /readAlertsSettings/);
        assert.match(host, /readTwitchOAuthFile/);
        assert.match(page, /twitchLogin=\{oauthLogin\}/);
        const panel = src(path.join("plugins", "restream", "admin", "alerts-panel.tsx"));
        assert.match(panel, /title="Alerts"/);
        assert.match(panel, /actionPath="alerts"/);
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
        const actions = src(path.join("plugins", "restream", "admin", "actions.ts"));
        assert.match(actions, /export async function saveAlertsSettingsAction/);
        assert.match(actions, /writeAlertsSettings/);
        assert.match(actions, /alerts_saved/);
        assert.match(actions, /parseOverlayScalePct\(formData.get\("alertScalePct"\)\)/);
    });
});
