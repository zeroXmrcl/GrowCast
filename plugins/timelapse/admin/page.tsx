import {saveTimelapseAction} from "@/plugins/timelapse/admin/actions";
import {AdminBandGroup} from "@/app/admin/admin-band";
import {AdminSaveForm} from "@/app/admin/admin-save-form";
import {TimelapseSettingsFields} from "@/plugins/timelapse/admin/timelapse-fields";
import {getTimelapseSettings} from "@/plugins/timelapse/host/timelapse-settings";
import {readTimelapseRtsp} from "@/plugins/timelapse/host/timelapse-sidecar-env";

export default async function AdminTimelapsePage() {
    const [timelapseSettings, rtspStream] = await Promise.all([
        getTimelapseSettings(),
        readTimelapseRtsp().catch(() => ""),
    ]);

    return (
        <AdminBandGroup>
            <AdminSaveForm action={saveTimelapseAction}>
                <TimelapseSettingsFields timelapseSettings={timelapseSettings} rtspStream={rtspStream}/>
            </AdminSaveForm>
        </AdminBandGroup>
    );
}
