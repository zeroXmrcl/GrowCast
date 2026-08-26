import Link from "next/link";
import {AdminButton, AdminPanel} from "@/components/admin/ui";
import type {ReactNode} from "react";

type SettingsFormProps = {
    growId?: string;
    saveAction: (formData: FormData) => Promise<void>;
    children: ReactNode;
};

export function AdminSettingsForm({growId, saveAction, children}: SettingsFormProps) {
    return (
        <form
            id="admin-settings-form"
            action={saveAction}
            className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"
        >
            {growId ? <input type="hidden" name="growId" value={growId}/> : null}
            {children}

            <div className="space-y-6 xl:sticky xl:top-20 xl:self-start">
                <AdminPanel title="Apply Changes">
                    <AdminButton type="submit" tone="primary" className="w-full">
                        Save Changes
                    </AdminButton>
                </AdminPanel>

                <AdminPanel title="Quick Links">
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
