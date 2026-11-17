"use client";

import {AdminBand, AdminBandGroup, usePluginAdminState} from "@/lib/plugins/admin-kit";
import {AlertsPanel} from "@/plugins/restream/admin/alerts-panel";
import {CameraLookPanel} from "@/plugins/restream/admin/camera-look-panel";
import {MixerStrip} from "@/plugins/restream/admin/mixer-strip";
import {MusicPanel} from "@/plugins/restream/admin/music-panel";
import {ProgramMonitor} from "@/plugins/restream/admin/program-monitor";
import {RestreamPanel} from "@/plugins/restream/admin/restream-panel";
import type {AlertsSettings} from "@/plugins/restream/host/alerts-settings";
import type {RestreamAudio} from "@/plugins/restream/host/audio";
import type {CameraLook} from "@/plugins/restream/host/camera-look";
import type {RestreamPublicView} from "@/plugins/restream/host/store";

type RestreamAdminState = {
    restream: RestreamPublicView;
    audio: RestreamAudio;
    alerts: AlertsSettings;
    oauthLogin: string;
    look: CameraLook;
    musicFiles: string[];
};

export default function AdminStreamPage() {
    const {data} = usePluginAdminState<RestreamAdminState>("admin-state");
    if (!data) {
        return <p className="text-sm text-(--admin-muted)">Loading Broadcast…</p>;
    }
    const {restream, audio, alerts, oauthLogin, look, musicFiles} = data;

    return (
        <AdminBandGroup>
            <AdminBand id="program" title="Program">
                <ProgramMonitor/>
            </AdminBand>
            <AdminBand id="mixer" title="Mixer">
                <MixerStrip audio={audio}/>
            </AdminBand>
            <RestreamPanel view={restream} />
            <CameraLookPanel look={look}/>
            <MusicPanel
                files={musicFiles}
                url={audio.url}
                waveSmoothPct={audio.waveSmoothPct}
                musicLook={audio.musicLook}
                waveBars={audio.waveBars}
            />
            <AlertsPanel settings={alerts} twitchLogin={oauthLogin} />
        </AdminBandGroup>
    );
}
