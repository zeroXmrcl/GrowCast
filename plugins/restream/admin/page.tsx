import {
    saveBroadcastToastAction,
    saveTwitchKeyAction,
    startTwitchRestreamAction,
    stopTwitchRestreamAction,
} from "@/plugins/restream/admin/actions";
import {AdminBand, AdminBandGroup} from "@/app/admin/admin-band";
import {AlertsPanel} from "@/plugins/restream/admin/alerts-panel";
import {CameraLookPanel} from "@/plugins/restream/admin/camera-look-panel";
import {MixerStrip} from "@/plugins/restream/admin/mixer-strip";
import {MusicPanel} from "@/plugins/restream/admin/music-panel";
import {ProgramMonitor} from "@/plugins/restream/admin/program-monitor";
import {RestreamPanel} from "@/plugins/restream/admin/restream-panel";
import {readAlertsSettings} from "@/plugins/restream/host/alerts-settings";
import {readRestreamAudio} from "@/plugins/restream/host/audio";
import {readCameraLook} from "@/plugins/restream/host/camera-look-store";
import {ensureRestreamCaptureToken} from "@/plugins/restream/host/capture";
import {listMusicFiles} from "@/plugins/restream/host/music-files";
import {readRestreamPublicView} from "@/plugins/restream/host/store";
import {readTwitchOAuthFile} from "@/plugins/restream/host/twitch-oauth";

export default async function AdminStreamPage() {
    const [restream, audio, alerts, oauth, look] = await Promise.all([
        readRestreamPublicView(),
        readRestreamAudio(),
        readAlertsSettings(),
        readTwitchOAuthFile(),
        readCameraLook(),
        ensureRestreamCaptureToken(),
    ]);

    return (
        <AdminBandGroup>
            <AdminBand id="program" title="Program">
                <ProgramMonitor/>
            </AdminBand>
            <AdminBand id="mixer" title="Mixer">
                <MixerStrip audio={audio}/>
            </AdminBand>
            <RestreamPanel
                view={restream}
                startAction={startTwitchRestreamAction}
                stopAction={stopTwitchRestreamAction}
                saveToastAction={saveBroadcastToastAction}
                saveKeyAction={saveTwitchKeyAction}
            />
            <CameraLookPanel look={look}/>
            <MusicPanel
                files={await listMusicFiles()}
                url={audio.url}
                waveSmoothPct={audio.waveSmoothPct}
                musicLook={audio.musicLook}
                waveBars={audio.waveBars}
            />
            <AlertsPanel settings={alerts} twitchLogin={oauth?.login ?? ""}/>
        </AdminBandGroup>
    );
}
