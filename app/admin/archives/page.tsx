import Link from "next/link";
import {redirect} from "next/navigation";
import {formatDateDisplay} from "@/app/(site)/grows/format";
import {completeGrowAction} from "@/app/admin/actions";
import {AdminBand, AdminBandGroup} from "@/app/admin/admin-band";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {CompleteGrowPanel} from "@/app/admin/complete-grow-panel";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {listArchivedGrows} from "@/lib/archives";
import {getCurrentGrow} from "@/lib/db";

export default async function AdminArchivesPage() {
    if (!(await isAdminAuthenticated())) {
        redirect("/admin");
    }

    const [archives, grow] = await Promise.all([listArchivedGrows(), getCurrentGrow()]);

    return (
        <AdminChrome
            title="Archives"
            sections={SETTINGS_SECTION_LINKS}
            actions={<AdminSignOutButton/>}
        >
            <AdminBandGroup>
                <CompleteGrowPanel growId={grow.id} completeAction={completeGrowAction}/>

                <AdminBand id="past" title="Past grows">
                    {archives.length === 0 ? (
                        <p className="text-sm text-(--admin-muted)">
                            Complete the current grow above to create the first archive.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {archives.map((archive) => {
                                const subtitle = [archive.grow.plant, archive.grow.details.strain]
                                    .filter(Boolean)
                                    .join(" • ");

                                return (
                                    <Link
                                        key={archive.archiveId}
                                        href={`/admin/archives/${archive.archiveId}`}
                                        className="flex items-center justify-between gap-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium text-(--admin-text)">
                                                {archive.grow.name}
                                            </p>
                                            {subtitle ? (
                                                <p className="mt-0.5 truncate text-xs text-(--admin-muted)">
                                                    {subtitle}
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="shrink-0 text-right text-xs text-(--admin-muted)">
                                            <p>Harvested {formatDateDisplay(archive.completion.harvestedAt)}</p>
                                            <p className="mt-0.5">
                                                {archive.media.snapshotCount} snapshots
                                            </p>
                                        </div>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </AdminBand>
            </AdminBandGroup>
        </AdminChrome>
    );
}
