"use server";

import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {loginAdmin, requireAdmin} from "@/lib/admin-auth";
import {parseAdminSettingsForm, parseCompleteGrowForm} from "@/lib/admin/parse-grow-form";
import {saveAdminSettings} from "@/lib/admin/save-settings";
import {withNotice} from "@/lib/admin/notice";
import {completeCurrentGrow} from "@/lib/archives";
import {loginRateLimitKey} from "@/lib/request-trust";
import {
    logAdminGrowArchiveFailed,
    logAdminGrowArchived,
    logAdminGrowUpdateFailed,
    logAdminGrowUpdated,
    sanitizeError,
    withNextRequestLogContext,
} from "@/lib/logging";

export async function loginAction(formData: FormData): Promise<void> {
    const h = await headers();
    const clientKey = loginRateLimitKey(h);

    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await loginAdmin(username, password, clientKey);

    if (!result.ok) {
        if (result.code === "rate_limited") {
            redirect(`/admin?error=rate_limited&retry=${result.retryAfterSeconds ?? 900}`);
        }

        if (result.code === "login_disabled") {
            redirect("/admin?error=login_disabled");
        }

        redirect("/admin?error=invalid_credentials");
    }

    redirect("/admin");
}

export async function saveGrowAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin", async () => {
        await requireAdmin();

        const parsed = parseAdminSettingsForm(formData);
        const result = await saveAdminSettings(parsed);

        if (!result.ok) {
            logAdminGrowUpdateFailed({err: sanitizeError(result.error)});
            redirect(withNotice("/admin", result.error === "stale_grow" ? "stale_grow" : "save_failed"));
        }

        logAdminGrowUpdated();
        revalidatePath("/");
        revalidatePath("/admin");
        redirect(withNotice("/admin", "saved"));
    });
}

export async function completeGrowAction(formData: FormData): Promise<void> {
    await withNextRequestLogContext("/admin", async () => {
        await requireAdmin();

        if (formData.get("confirmArchive") !== "on") {
            redirect(withNotice("/admin", "archive_not_confirmed"));
        }

        const input = parseCompleteGrowForm(formData);
        const result = await completeCurrentGrow(input);

        if (!result.ok) {
            logAdminGrowArchiveFailed({err: sanitizeError(result.error)});
            redirect(withNotice("/admin", result.error === "stale_grow" ? "stale_grow" : "archive_failed"));
        }

        logAdminGrowArchived({archiveId: result.archive.archiveId});
        revalidatePath("/");
        revalidatePath("/gallery");
        revalidatePath("/grows");
        revalidatePath(`/grows/${result.archive.archiveId}`);
        revalidatePath("/admin");
        redirect(withNotice("/admin", "archived"));
    });
}
