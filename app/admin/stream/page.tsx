import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {
    saveBroadcastToastAction,
    saveStreamAction,
    saveTwitchKeyAction,
    startTwitchRestreamAction,
    stopTwitchRestreamAction,
} from "@/app/admin/actions";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {AdminFlashNotice} from "@/app/admin/admin-notice";
import {AlertsPanel} from "@/app/admin/alerts-panel";
import {MixerStrip} from "@/app/admin/mixer-strip";
import {MusicPanel} from "@/app/admin/music-panel";
import {ProgramMonitor} from "@/app/admin/program-monitor";
import {RestreamPanel} from "@/app/admin/restream-panel";
import {StreamSettingsFields} from "@/app/admin/stream-fields";
import {AdminButton} from "@/components/admin/ui";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {getCurrentGrow} from "@/lib/db";
import {overlayPublicUrl} from "@/lib/overlay-layout";
import {readAlertsSettings} from "@/lib/restream/alerts-settings";
import {readRestreamAudio} from "@/lib/restream/audio";
import {ensureRestreamCaptureToken} from "@/lib/restream/capture";
import {listMusicFiles} from "@/lib/restream/music-files";
import {readRestreamPublicView} from "@/lib/restream/store";
import {readTwitchOAuthFile} from "@/lib/restream/twitch-oauth";
import {shareCardMetadataOrigin} from "@/lib/share-card";

type StreamPageProps = {
    searchParams: Promise<{
        notice?: string;
    }>;
};

export default async function AdminStreamPage({searchParams}: StreamPageProps) {
    const params = await searchParams;

    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const [grow, headerList, restream, audio, alerts, oauth] = await Promise.all([
        getCurrentGrow(),
        headers(),
        readRestreamPublicView(),
        readRestreamAudio(),
        readAlertsSettings(),
        readTwitchOAuthFile(),
        ensureRestreamCaptureToken(),
    ]);
    const overlayUrl = overlayPublicUrl(shareCardMetadataOrigin(headerList));

    return (
        <AdminChrome
            title="Broadcast"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
            <AdminFlashNotice notice={params.notice}/>
            <form id="broadcast-grow" action={saveStreamAction} className="hidden">
                <input type="hidden" name="growId" value={grow.id}/>
            </form>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-start">
                <div>
                    <ProgramMonitor/>
                    <MixerStrip audio={audio}/>
                </div>
                <div className="space-y-4 lg:sticky lg:top-20">
                    <RestreamPanel
                        view={restream}
                        startAction={startTwitchRestreamAction}
                        stopAction={stopTwitchRestreamAction}
                        saveToastAction={saveBroadcastToastAction}
                        saveKeyAction={saveTwitchKeyAction}
                    />
                    <MusicPanel
                        files={await listMusicFiles()}
                        url={audio.url}
                        waveSmoothPct={audio.waveSmoothPct}
                    />
                    <AlertsPanel settings={alerts} twitchLogin={oauth?.login ?? ""}/>
                    <StreamSettingsFields
                        grow={grow}
                        overlayUrl={overlayUrl}
                        growForm="broadcast-grow"
                    />
                    <AdminButton form="broadcast-grow" type="submit" tone="primary" className="w-full">
                        Save Changes
                    </AdminButton>
                </div>
            </div>
        </AdminChrome>
    );
}
