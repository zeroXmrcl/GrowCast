"use client";

import {AdminBandGroup, PluginSaveForm, usePluginAdminState} from "@/lib/plugins/admin-kit";
import {TimelapseSettingsFields} from "@/plugins/timelapse/admin/timelapse-fields";
import type {TimelapseSettings} from "@/plugins/timelapse/host/timelapse-settings";

type TimelapseAdminState = {
    timelapseSettings: TimelapseSettings;
    rtspStream: string;
};

export default function AdminTimelapsePage() {
    const {data, reload} = usePluginAdminState<TimelapseAdminState>("admin-state");
    if (!data) {
        return <p className="text-sm text-(--admin-muted)">Loading Timelapse…</p>;
    }
    return (
        <AdminBandGroup>
            <PluginSaveForm actionPath="settings" onSaved={reload}>
                <TimelapseSettingsFields timelapseSettings={data.timelapseSettings} rtspStream={data.rtspStream}/>
            </PluginSaveForm>
        </AdminBandGroup>
    );
}
