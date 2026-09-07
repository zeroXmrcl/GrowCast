import Link from "next/link";
import {redirect} from "next/navigation";
import {formatDateDisplay} from "@/app/(site)/grows/format";
import {completeGrowAction} from "@/app/admin/actions";
import {AdminChrome, AdminSignOutButton, SETTINGS_SECTION_LINKS} from "@/app/admin/admin-chrome";
import {AdminFlashNotice} from "@/app/admin/admin-notice";
import {CompleteGrowPanel} from "@/app/admin/complete-grow-panel";
import {AdminPanel} from "@/components/admin/ui";
import {isAdminAuthenticated} from "@/lib/admin-auth";
import {listArchivedGrows} from "@/lib/archives";
import {getCurrentGrow} from "@/lib/db";

type AdminArchivesPageProps = {
    searchParams: Promise<{
        notice?: string;
    }>;
};

export default async function AdminArchivesPage({searchParams}: AdminArchivesPageProps) {
    const params = await searchParams;

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
            <AdminFlashNotice notice={params.notice}/>
            <CompleteGrowPanel growId={grow.id} completeAction={completeGrowAction}/>

            {archives.length === 0 ? (
                <AdminPanel title="No archives yet">
                    <p className="text-sm text-(--admin-muted)">
                        Complete the current grow above to create the first archive.
                    </p>
                </AdminPanel>
            ) : (
                <AdminPanel title="Archives">
                    <div className="space-y-2">
                        {archives.map((archive) => {
                            const subtitle = [archive.grow.plant, archive.grow.details.strain]
                                .filter(Boolean)
                                .join(" • ");

                            return (
                                <Link
                                    key={archive.archiveId}
                                    href={`/admin/archives/${archive.archiveId}`}
                                    className="flex items-center justify-between gap-4 rounded-md border border-(--admin-border) bg-(--admin-surface) px-3 py-3 transition hover:border-zinc-500 hover:bg-(--admin-surface-muted)"
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
                </AdminPanel>
            )}
        </AdminChrome>
    );
}
