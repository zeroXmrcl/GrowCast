"use server";

import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {clearPendingAdminLogin, loginAdmin, requireAdmin, verifyAdminSecondFactor} from "@/lib/admin-auth";
import {parseAdminSettingsForm, parseCompleteGrowForm} from "@/lib/admin/parse-grow-form";
import {saveAdminSettings} from "@/lib/admin/save-settings";
import type {AdminActionResult} from "@/lib/admin/action-result";
import {completeCurrentGrow} from "@/lib/archives";
import {clientIdentityKey, loginRateLimitKey, secondFactorRateLimitKey} from "@/lib/request-trust";
import {hasXaiApiKey} from "@/lib/ai-summary/config";
import {generateDailyAiSummary} from "@/lib/ai-summary/generate";
import {allowAiSummaryRegenerate} from "@/lib/ai-summary/rate-limit";
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
        if (result.code === "totp_required") {
            redirect("/admin?step=totp");
        }

        if (result.code === "totp_unavailable") {
            redirect("/admin?error=totp_unavailable");
        }

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

export async function verifySecondFactorAction(formData: FormData): Promise<void> {
    const h = await headers();
    const clientKey = secondFactorRateLimitKey(h);
    const code = String(formData.get("code") ?? "");
    const kind = formData.get("kind") === "recovery" ? "recovery" : "totp";
    const result = await verifyAdminSecondFactor(code, kind, clientKey);

    if (!result.ok) {
        if (result.code === "rate_limited") {
            redirect(`/admin?error=rate_limited&retry=${result.retryAfterSeconds ?? 900}`);
        }
        if (result.code === "totp_unavailable") {
            redirect("/admin?error=totp_unavailable");
        }
        if (result.code === "pending_expired" || result.code === "login_disabled") {
            redirect("/admin?error=signin_expired");
        }
        redirect("/admin?step=totp&error=totp_invalid");
    }

    redirect("/admin");
}

export async function cancelSecondFactorAction(): Promise<void> {
    await clearPendingAdminLogin();
    redirect("/admin");
}

export async function saveGrowAction(formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin", async () => {
        await requireAdmin();

        const parsed = parseAdminSettingsForm(formData);
        const result = await saveAdminSettings(parsed);

        if (!result.ok) {
            logAdminGrowUpdateFailed({err: sanitizeError(result.error)});
            return {notice: result.error === "stale_grow" ? "stale_grow" : "save_failed"};
        }

        logAdminGrowUpdated();
        revalidatePath("/");
        revalidatePath("/overlay");
        revalidatePath("/admin");
        return {notice: "saved"};
    });
}

export async function completeGrowAction(formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/archives", async () => {
        await requireAdmin();

        if (formData.get("confirmArchive") !== "on") {
            return {notice: "archive_not_confirmed"};
        }

        const input = parseCompleteGrowForm(formData);
        const result = await completeCurrentGrow(input);

        if (!result.ok) {
            logAdminGrowArchiveFailed({err: sanitizeError(result.error)});
            return {notice: result.error === "stale_grow" ? "stale_grow" : "archive_failed"};
        }

        logAdminGrowArchived({
            archiveId: result.archive.archiveId,
            ...(result.warning ? {warning: result.warning} : {}),
        });
        revalidatePath("/");
        revalidatePath("/grows");
        revalidatePath(`/grows/${result.archive.archiveId}`);
        revalidatePath("/admin");
        revalidatePath("/admin/archives");
        const notice =
            result.warning === "reset_failed"
                ? "archived_reset_warning"
                : result.warning === "media_cleanup_failed"
                  ? "archived_cleanup_warning"
                  : "archived";
        return {notice};
    });
}

export async function regenerateAiSummaryAction(formData: FormData): Promise<AdminActionResult> {
    void formData;
    return withNextRequestLogContext("/admin", async () => {
        await requireAdmin();
        const h = await headers();
        const limited = allowAiSummaryRegenerate(`ai-summary-regen:${clientIdentityKey(h)}`);
        if (!limited.ok) {
            return {notice: "ai_summary_rate_limited"};
        }
        if (!hasXaiApiKey()) {
            return {notice: "ai_summary_no_key"};
        }
        const result = await generateDailyAiSummary({force: true});
        if (!result.ok) {
            if (result.reason === "no_key") {
                return {notice: "ai_summary_no_key"};
            }
            if (result.reason === "daily_cap") {
                return {notice: "ai_summary_daily_cap"};
            }
            return {notice: "ai_summary_failed"};
        }
        revalidatePath("/");
        revalidatePath("/admin");
        return {notice: "ai_summary_ready"};
    });
}
