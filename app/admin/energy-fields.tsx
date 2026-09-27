import {AdminBand} from "@/app/admin/admin-band";
import {AdminField, AdminInput} from "@/components/admin/ui";
import type {EnergyActuatorRow, EnergySettings} from "@/lib/energy/settings";

export function EnergySettingsFields({
    energySettings,
    energyActuators,
}: {
    energySettings: EnergySettings;
    energyActuators: EnergyActuatorRow[];
}) {
    return (
        <AdminBand id="energy" title="Energy" plain>
            <div className="grid gap-4 md:grid-cols-2">
                <AdminField label="Public €/kWh">
                    <AdminInput
                        name="energyPublicTariff"
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={energySettings.publicTariffEurPerKwh ?? ""}
                    />
                </AdminField>
                <AdminField label="Private €/kWh">
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
                {energyActuators.length > 0 ? (
                    <div className="space-y-4">
                        {energyActuators.map((row) => (
                            <AdminField key={row.key} label={row.label}>
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
                ) : null}
            </div>
        </AdminBand>
    );
}
