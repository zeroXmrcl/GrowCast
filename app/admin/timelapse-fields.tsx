import {AdminBand} from "@/app/admin/admin-band";
import {AdminOptionalTimeInput} from "@/components/admin/optional-time-input";
import {
    AdminCheckboxRow,
    AdminField,
    AdminInput,
    AdminSelect,
} from "@/components/admin/ui";
import type {TimelapseSettings} from "@/lib/timelapse-settings";

export function TimelapseSettingsFields({
    timelapseSettings,
    rtspStream = "",
}: {
    timelapseSettings: TimelapseSettings;
    rtspStream?: string;
}) {
    return (
        <>
            <AdminBand id="capture" title="Capture">
                <div className="space-y-4">
                    <AdminField label="Camera RTSP URL">
                        <AdminInput
                            name="rtspStream"
                            defaultValue={rtspStream}
                            placeholder="rtsp://user:password@camera-ip:554/stream"
                            autoComplete="off"
                        />
                    </AdminField>
                    <AdminCheckboxRow
                        name="timelapsePaused"
                        defaultChecked={timelapseSettings.paused}
                        label="Pause timelapse"
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                        <AdminField label="Timezone">
                            <AdminInput
                                name="timelapseTimezone"
                                defaultValue={timelapseSettings.timezone}
                                placeholder="UTC"
                            />
                        </AdminField>
                        <AdminField label="Interval (minutes)">
                            <AdminInput
                                name="timelapseInterval"
                                type="number"
                                min={1}
                                step={1}
                                defaultValue={timelapseSettings.intervalMinutes ?? ""}
                            />
                        </AdminField>
                    </div>
                </div>
            </AdminBand>
            <AdminBand id="triggers" title="Triggers">
                <div className="grid gap-4 md:grid-cols-3">
                    <AdminField label="Time 1">
                        <AdminOptionalTimeInput
                            name="timelapseTime1"
                            defaultValue={timelapseSettings.time1}
                        />
                    </AdminField>
                    <AdminField label="Time 2">
                        <AdminOptionalTimeInput
                            name="timelapseTime2"
                            defaultValue={timelapseSettings.time2}
                        />
                    </AdminField>
                    <AdminField label="Time 3">
                        <AdminOptionalTimeInput
                            name="timelapseTime3"
                            defaultValue={timelapseSettings.time3}
                        />
                    </AdminField>
                </div>
            </AdminBand>
            <AdminBand id="output" title="Output">
                <div className="grid gap-4 md:grid-cols-2">
                    <AdminField label="Timelapse Length (seconds)">
                        <AdminInput
                            name="timelapseLength"
                            type="number"
                            min={1}
                            step={1}
                            defaultValue={timelapseSettings.timelapseLengthSeconds}
                        />
                    </AdminField>
                    <AdminField label="Timelapse Quality">
                        <AdminSelect
                            name="timelapseQuality"
                            defaultValue={timelapseSettings.timelapseQuality}
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </AdminSelect>
                    </AdminField>
                </div>
            </AdminBand>
        </>
    );
}
