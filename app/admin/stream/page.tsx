import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {
    saveBroadcastToastAction,
    saveStreamAction,
    saveTwitchKeyAction,
    startTwitchRestreamAction,
    stopTwitchRestreamAction,
} from "@/app/admin/actions";
import {AdminBand, AdminBandGroup} from "@/app/admin/admin-band";
import {AdminSaveForm} from "@/app/admin/admin-save-form";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {AlertsPanel} from "@/app/admin/alerts-panel";
import {CameraLookPanel} from "@/app/admin/camera-look-panel";
import {MixerStrip} from "@/app/admin/mixer-strip";
import {MusicPanel} from "@/app/admin/music-panel";
import {ProgramMonitor} from "@/app/admin/program-monitor";
import {RestreamPanel} from "@/app/admin/restream-panel";
import {StreamSettingsFields} from "@/app/admin/stream-fields";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";
import {overlayPublicUrl} from "@/lib/overlay-layout";
import {readAlertsSettings} from "@/lib/restream/alerts-settings";
import {readRestreamAudio} from "@/lib/restream/audio";
import {readCameraLook} from "@/lib/restream/camera-look-store";
import {ensureRestreamCaptureToken} from "@/lib/restream/capture";
import {listMusicFiles} from "@/lib/restream/music-files";
import {readRestreamPublicView} from "@/lib/restream/store";
import {readTwitchOAuthFile} from "@/lib/restream/twitch-oauth";
import {shareCardMetadataOrigin} from "@/lib/share-card";

export default async function AdminStreamPage() {

    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const [grow, headerList, restream, audio, alerts, oauth, look] = await Promise.all([
        getCurrentGrow(),
        headers(),
        readRestreamPublicView(),
        readRestreamAudio(),
        readAlertsSettings(),
        readTwitchOAuthFile(),
        readCameraLook(),
        ensureRestreamCaptureToken(),
    ]);
    const overlayUrl = overlayPublicUrl(shareCardMetadataOrigin(headerList));

    return (
        <AdminChrome
            title="Broadcast"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
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
                <AdminSaveForm action={saveStreamAction}>
                    <input type="hidden" name="growId" value={grow.id}/>
                    <StreamSettingsFields grow={grow} overlayUrl={overlayUrl}/>
                </AdminSaveForm>
            </AdminBandGroup>
        </AdminChrome>
    );
}
