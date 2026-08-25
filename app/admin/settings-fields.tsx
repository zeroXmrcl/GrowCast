import {AdminOptionalTimeInput} from "@/components/admin/optional-time-input";
import {
    AdminCheckboxRow,
    AdminField,
    AdminInput,
    AdminPanel,
    AdminSelect,
    AdminTextarea,
} from "@/components/admin/ui";
import type {EnergyActuatorRow, EnergySettings} from "@/lib/energy/settings";
import type {GrowRecord} from "@/lib/db";
import type {TimelapseSettings} from "@/lib/timelapse-settings";

type SettingsFieldsProps = {
    grow: GrowRecord;
    timelapseSettings: TimelapseSettings;
    energySettings: EnergySettings;
    energyActuators: EnergyActuatorRow[];
    overlayUrl: string;
};

export function SettingsFields({
    grow,
    timelapseSettings,
    energySettings,
    energyActuators,
    overlayUrl,
}: SettingsFieldsProps) {
    return (
        <div className="space-y-6">
            <AdminPanel id="general" title="General">
                <div className="grid gap-4 md:grid-cols-2">
                    <AdminField label="Grow Name">
                        <AdminInput name="name" defaultValue={grow.name} required/>
                    </AdminField>
                    <AdminField label="Plant">
                        <AdminInput name="plant" defaultValue={grow.plant}/>
                    </AdminField>
                    <AdminField label="Plant Amount">
                        <AdminInput
                            name="plantAmount"
                            type="number"
                            min={0}
                            defaultValue={grow.plantAmount}
                        />
                    </AdminField>
                    <AdminField label="Strain">
                        <AdminInput name="strain" defaultValue={grow.details.strain}/>
                    </AdminField>
                </div>
                <div className="mt-4">
                    <AdminCheckboxRow
                        name="showSettingsLink"
                        defaultChecked={grow.showSettingsLink}
                        label="Show Settings link in the site header"
                        description="When disabled, the link is hidden for all visitors. The admin area stays reachable at /admin."
                    />
                </div>
            </AdminPanel>

            <AdminPanel id="lifecycle" title="Lifecycle">
                <div className="grid gap-4 md:grid-cols-2">
                    <AdminField label="Stage">
                        <AdminSelect name="stage" defaultValue={grow.details.stage}>
                            <option value="Seed">Seed</option>
                            <option value="Seedling">Seedling</option>
                            <option value="Vegetative">Vegetative</option>
                            <option value="Flowering">Flowering</option>
                            <option value="Drying">Drying</option>
                        </AdminSelect>
                    </AdminField>
                    <AdminField label="Date of Seeding">
                        <AdminInput
                            name="seededAt"
                            type="date"
                            defaultValue={grow.details.seededAt}
                        />
                    </AdminField>
                    <AdminField label="Light Schedule">
                        <AdminInput
                            name="lightSchedule"
                            defaultValue={grow.details.lightSchedule}
                        />
                    </AdminField>
                </div>
            </AdminPanel>

            <AdminPanel id="climate" title="Climate">
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase text-(--admin-subtle)">
                            Day
                        </p>
                        <AdminField label="Temperature (C)">
                            <AdminInput
                                name="temperatureDay"
                                type="number"
                                min={0}
                                step="0.1"
                                defaultValue={grow.climate.temperatureDay}
                            />
                        </AdminField>
                        <AdminField label="Humidity (%)">
                            <AdminInput
                                name="humidityDay"
                                type="number"
                                min={0}
                                max={100}
                                step="1"
                                defaultValue={grow.climate.humidityDay}
                            />
                        </AdminField>
                    </div>
                    <div className="space-y-4">
                        <p className="text-xs font-semibold uppercase text-(--admin-subtle)">
                            Night
                        </p>
                        <AdminField label="Temperature (C)">
                            <AdminInput
                                name="temperatureNight"
                                type="number"
                                min={0}
                                step="0.1"
                                defaultValue={grow.climate.temperatureNight}
                            />
                        </AdminField>
                        <AdminField label="Humidity (%)">
                            <AdminInput
                                name="humidityNight"
                                type="number"
                                min={0}
                                max={100}
                                step="1"
                                defaultValue={grow.climate.humidityNight}
                            />
                        </AdminField>
                    </div>
                </div>
            </AdminPanel>

            <AdminPanel
                id="energy"
                title="Energy"
                description="Public visitors see the public tariff. A signed-in admin session uses the private tariff on the same page. Empty means unset (€ shown as —)."
            >
                <div className="grid gap-4 md:grid-cols-2">
                    <AdminField label="Public €/kWh" hint="Used for anonymous visitors.">
                        <AdminInput
                            name="energyPublicTariff"
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={energySettings.publicTariffEurPerKwh ?? ""}
                        />
                    </AdminField>
                    <AdminField label="Private €/kWh" hint="Used when an admin session cookie is present.">
                        <AdminInput
                            name="energyPrivateTariff"
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={energySettings.privateTariffEurPerKwh ?? ""}
                        />
                    </AdminField>
                </div>
                <div className="mt-6">
                    <p className="mb-3 text-xs font-semibold uppercase text-(--admin-subtle)">
                        Watts when on
                    </p>
                    {energyActuators.length === 0 ? (
                        <p className="text-sm text-(--admin-muted)">
                            Overrides appear when live devices are flowing. Outlets with no catalog
                            row stay at 0 W until a value is set here.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {energyActuators.map((row) => (
                                <AdminField key={row.key} label={row.label} hint={row.hint}>
                                    <input type="hidden" name="energyOverrideKey" value={row.key}/>
                                    <AdminInput
                                        name="energyOverrideWatts"
                                        type="number"
                                        min={0}
                                        step="0.1"
                                        defaultValue={row.watts}
                                        placeholder="catalog"
                                    />
                                </AdminField>
                            ))}
                        </div>
                    )}
                </div>
            </AdminPanel>

            <AdminPanel id="status" title="Status">
                <div className="grid gap-4 md:grid-cols-2">
                    <AdminField label="Health">
                        <AdminSelect name="health" defaultValue={grow.status.health}>
                            <option value="Healthy">Healthy</option>
                            <option value="Warning">Warning</option>
                            <option value="Critical">Critical</option>
                        </AdminSelect>
                    </AdminField>
                    <AdminField label="Estimated Harvest Date">
                        <AdminInput
                            name="estimatedHarvestDate"
                            type="date"
                            defaultValue={grow.status.estimatedHarvestDate}
                            disabled
                        />
                    </AdminField>
                </div>
                <div className="mt-4">
                    <AdminField label="Health Notes">
                        <AdminTextarea
                            name="statusNotes"
                            defaultValue={grow.status.notes}
                            rows={4}
                        />
                    </AdminField>
                </div>
            </AdminPanel>

            <AdminPanel id="notes" title="Notes">
                <AdminField label="Markdown supported">
                    <AdminTextarea
                        name="notes"
                        defaultValue={grow.details.notes}
                        rows={6}
                    />
                </AdminField>
            </AdminPanel>

            <AdminPanel id="hardware" title="Hardware">
                <div className="grid gap-4 md:grid-cols-2">
                    <AdminField label="Medium">
                        <AdminInput
                            name="growingMedium"
                            defaultValue={grow.growSetup.growingMedium}
                            placeholder="Soil, coco, hydro..."
                        />
                    </AdminField>
                    <AdminField label="Pot Size (L)">
                        <AdminInput
                            name="potSizeLiters"
                            type="number"
                            min={0}
                            defaultValue={grow.growSetup.potSizeLiters}
                        />
                    </AdminField>
                </div>
                <div className="mt-4">
                    <AdminField label="Setup Description (MD-Supported)">
                        <AdminTextarea
                            name="setupText"
                            defaultValue={grow.growSetup.setupText}
                            rows={8}
                            placeholder={"Tent: ...\nLight: ...\nFan: ..."}
                        />
                    </AdminField>
                </div>
            </AdminPanel>

            <AdminPanel id="stream" title="Stream">
                <div className="space-y-4">
                    <AdminCheckboxRow
                        name="showGrowName"
                        defaultChecked={grow.showGrowName}
                        label="Show grow name above stream"
                        description="Displays the grow-name as header above the stream."
                    />
                    <AdminField label="Stream URL">
                        <AdminInput
                            name="streamUrl"
                            defaultValue={grow.streamUrl}
                            placeholder="https://..."
                        />
                    </AdminField>
                </div>
            </AdminPanel>

            <AdminPanel
                id="overlay"
                title="Overlay"
                description="Add this URL as an OBS Browser Source over the tent camera."
            >
                <div className="space-y-4">
                    <div>
                        <p className="mb-3 text-xs font-semibold uppercase text-(--admin-subtle)">
                            Overlay layout
                        </p>
                        <div className="grid gap-3 md:grid-cols-2">
                            <label className="flex items-start gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
                                <input
                                    type="radio"
                                    name="overlayLayout"
                                    value="left-rail"
                                    defaultChecked={grow.overlayLayout !== "bottom-bar"}
                                    className="mt-0.5 h-4 w-4 border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-(--admin-text)">
                                        Left rail
                                    </span>
                                    <span className="mt-1 block text-xs text-(--admin-muted)">
                                        Stacked column inset from the left edge.
                                    </span>
                                </span>
                            </label>
                            <label className="flex items-start gap-3 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3">
                                <input
                                    type="radio"
                                    name="overlayLayout"
                                    value="bottom-bar"
                                    defaultChecked={grow.overlayLayout === "bottom-bar"}
                                    className="mt-0.5 h-4 w-4 border-(--admin-border-strong) bg-(--admin-surface) accent-zinc-300"
                                />
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-(--admin-text)">
                                        Bottom bar
                                    </span>
                                    <span className="mt-1 block text-xs text-(--admin-muted)">
                                        One strip along the bottom of the frame.
                                    </span>
                                </span>
                            </label>
                        </div>
                    </div>
                    <AdminField
                        label="OBS URL"
                        hint="Browser Source 1920×1080, transparent, keep running when not visible."
                    >
                        <AdminInput readOnly value={overlayUrl}/>
                    </AdminField>
                </div>
            </AdminPanel>

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

            <AdminPanel id="socials" title="Socials">
                <div className="grid gap-4 md:grid-cols-2">
                    <AdminField label="YouTube">
                        <AdminInput
                            name="youtube"
                            defaultValue={grow.socials.youtube}
                            placeholder="https://www.youtube.com/..."
                        />
                    </AdminField>
                    <AdminField label="X (Formerly Twitter)">
                        <AdminInput
                            name="twitter"
                            defaultValue={grow.socials.twitter}
                            placeholder="https://www.x.com/..."
                        />
                    </AdminField>
                    <AdminField label="Instagram">
                        <AdminInput
                            name="instagram"
                            defaultValue={grow.socials.instagram}
                            placeholder="https://www.instagram.com/..."
                        />
                    </AdminField>
                    <AdminField label="GrowDiaries">
                        <AdminInput
                            name="growDiaries"
                            defaultValue={grow.socials.growDiaries}
                            placeholder="https://growdiaries.com/..."
                        />
                    </AdminField>
                    <AdminField label="Discord Invite">
                        <AdminInput
                            name="discordInvite"
                            defaultValue={grow.socials.discordInvite}
                            placeholder="https://discord.gg/..."
                        />
                    </AdminField>
                    <AdminField label="Custom URL">
                        <AdminInput
                            name="customWebsite"
                            defaultValue={grow.socials.customWebsite}
                            placeholder="https://growcast.0xmarcel.com/"
                        />
                    </AdminField>
                </div>
            </AdminPanel>
        </div>
    );
}
