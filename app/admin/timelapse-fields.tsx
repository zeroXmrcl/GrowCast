import {AdminOptionalTimeInput} from "@/components/admin/optional-time-input";
import {
    AdminCheckboxRow,
    AdminField,
    AdminInput,
    AdminPanel,
    AdminSelect,
} from "@/components/admin/ui";
import type {TimelapseSettings} from "@/lib/timelapse-settings";

export function TimelapseSettingsFields({
    timelapseSettings,
}: {
    timelapseSettings: TimelapseSettings;
}) {
    return (
        <div className="space-y-6">
            <AdminPanel id="timelapse" title="Timelapse">
                <div className="space-y-4">
                    <AdminCheckboxRow
                        name="timelapsePaused"
                        defaultChecked={timelapseSettings.paused}
                        label="Pause timelapse"
                        description="Stops the plugin from taking new snapshots until it is resumed."
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                        <AdminField
                            label="Timezone"
                            hint="Use an IANA timezone such as UTC or Europe/Berlin."
                        >
                            <AdminInput
                                name="timelapseTimezone"
                                defaultValue={timelapseSettings.timezone}
                                placeholder="UTC"
                            />
                        </AdminField>
                        <AdminField
                            label="Interval (minutes)"
                            hint="Leave empty to use trigger times only."
                        >
                            <AdminInput
                                name="timelapseInterval"
                                type="number"
                                min={1}
                                step={1}
                                defaultValue={timelapseSettings.intervalMinutes ?? ""}
                            />
                        </AdminField>
                    </div>
                    <div>
                        <p className="mb-3 text-xs font-semibold uppercase text-(--admin-subtle)">
                            Trigger Times
                        </p>
                        <p className="mb-3 text-xs text-(--admin-subtle)">
                            Optional. Use any of the three, or none (interval-only). Clear a slot
                            to turn it off.
                        </p>
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
                    </div>
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
                </div>
            </AdminPanel>
        </div>
    );
}
