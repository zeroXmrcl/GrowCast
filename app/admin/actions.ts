"use server";

import {revalidatePath} from "next/cache";
import {headers} from "next/headers";
import {redirect} from "next/navigation";
import {loginAdmin, requireAdmin} from "@/lib/admin-auth";
import {parseAdminSettingsForm} from "@/lib/admin/parse-grow-form";
import {saveAdminSettings} from "@/lib/admin/save-settings";

async function getRequestIp(): Promise<string> {
    const h = await headers();

    const cfIp = h.get("cf-connecting-ip");
    if (cfIp) {
        return cfIp;
    }

    const xff = h.get("x-forwarded-for");
    if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first) {
            return first;
        }
    }

    const realIp = h.get("x-real-ip");
    if (realIp) {
        return realIp;
    }

    return "unknown";
}

export async function loginAction(formData: FormData): Promise<void> {
    const ip = await getRequestIp();
    const clientKey = `admin-login:${ip}`;

    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await loginAdmin(username, password, clientKey);

    if (!result.ok) {
        console.warn("admin login fail", {
            ip,
            username,
            at: new Date().toISOString(),
        });

        if (result.code === "rate_limited") {
            redirect(`/admin?error=rate_limited&retry=${result.retryAfterSeconds ?? 900}`);
        }

        if (result.code === "login_disabled") {
            redirect("/admin?error=login_disabled");
        }

        redirect("/admin?error=invalid_credentials");
    }

    console.info("admin login successful", {
        ip,
        at: new Date().toISOString(),
    });

    redirect("/admin");
}

export async function saveGrowAction(formData: FormData): Promise<void> {
    await requireAdmin();

    const parsed = parseAdminSettingsForm(formData);
    const result = await saveAdminSettings(parsed);

    if (!result.ok) {
        console.error("admin save failed", {
            at: new Date().toISOString(),
            message: result.error,
        });
        redirect("/admin?error=save_failed");
    }

    revalidatePath("/");
    revalidatePath("/admin");
    redirect("/admin?saved=1");
}
