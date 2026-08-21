"use server";

import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {loginAdmin, requireAdmin} from "@/lib/admin-auth";
import {parseAdminSettingsForm} from "@/lib/admin/parse-grow-form";
import {saveAdminSettings} from "@/lib/admin/save-settings";
import {
    extractClientIp,
    logAdminGrowUpdateFailed,
    logAdminGrowUpdated,
    sanitizeError,
    withNextRequestLogContext,
} from "@/lib/logging";

async function getRequestIp(): Promise<string> {
    const h = await headers();
    return extractClientIp(h) ?? "unknown";
}

export async function loginAction(formData: FormData): Promise<void> {
    const ip = await getRequestIp();
    const clientKey = `admin-login:${ip}`;

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
            redirect("/admin?error=save_failed");
        }

        logAdminGrowUpdated();
        revalidatePath("/");
        revalidatePath("/admin");
        redirect("/admin?saved=1");
    });
}
