import {AdminField, AdminInput, AdminPanel} from "@/components/admin/ui";
import type {EnergyActuatorRow, EnergySettings} from "@/lib/energy/settings";

export function EnergySettingsFields({
    energySettings,
    energyActuators,
}: {
    energySettings: EnergySettings;
    energyActuators: EnergyActuatorRow[];
}) {
    return (
        <div className="space-y-6">
            <AdminPanel id="energy" title="Energy">
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
        </div>
    );
}
