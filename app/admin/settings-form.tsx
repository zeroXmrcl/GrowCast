import Link from "next/link";
import {AdminButton, AdminPanel} from "@/components/admin/ui";
import {SettingsFields} from "@/app/admin/settings-fields";
import type {EnergyActuatorRow, EnergySettings} from "@/lib/energy/settings";
import type {GrowRecord} from "@/lib/db";
import type {TimelapseSettings} from "@/lib/timelapse-settings";

type SettingsFormProps = {
    grow: GrowRecord;
    timelapseSettings: TimelapseSettings;
    energySettings: EnergySettings;
    energyActuators: EnergyActuatorRow[];
    saveAction: (formData: FormData) => Promise<void>;
};

export function AdminSettingsForm({
    grow,
    timelapseSettings,
    energySettings,
    energyActuators,
    saveAction,
}: SettingsFormProps) {
    return (
        <form
            id="admin-settings-form"
            action={saveAction}
            className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
        >
            <input type="hidden" name="growId" value={grow.id} />
            <SettingsFields
                grow={grow}
                timelapseSettings={timelapseSettings}
                energySettings={energySettings}
                energyActuators={energyActuators}
            />

            <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
                <AdminPanel title="Apply Changes" description="Changes will be live immediately.">
                    <AdminButton type="submit" tone="primary" className="w-full">
                        Save Changes
                    </AdminButton>
                </AdminPanel>

                <AdminPanel title="Quick Links" description="Jump to the most important sites.">
                    <div className="grid gap-2">
                        <Link
                            href="/"
                            target="_blank"
                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                        >
                            Open Dashboard
                        </Link>
                        <Link
                            href="/admin/archives"
                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                        >
                            Manage Archives
                        </Link>
                        <Link
                            href="https://growcast.0xmarcel.com/"
                            target="_blank"
                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                        >
                            GrowCast Website
                        </Link>
                        <Link
                            href="https://github.com/zeroXmrcl/GrowCast"
                            target="_blank"
                            className="rounded-xl border border-(--admin-border) bg-(--admin-bg) px-3 py-2 text-sm font-medium text-(--admin-text) transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
                        >
                            GitHub Repo
                        </Link>
                    </div>
                </AdminPanel>
            </div>
        </form>
    );
}
