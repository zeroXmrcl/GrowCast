"use server";

import {revalidatePath} from "next/cache";
import {requireAdmin} from "@/lib/admin-auth";
import type {AdminActionResult} from "@/lib/admin/action-result";
import {writeEnergySettings} from "@/plugins/ggs/host/energy/settings";
import {logAdminGrowUpdateFailed, sanitizeError, withNextRequestLogContext} from "@/lib/logging";
import {prepareSpiderFarmer} from "@/plugins/ggs/host/spider-farmer-setup";
import {parseEnergySettingsForm, readEnergySettings} from "@/plugins/ggs/host/energy/settings";

export async function saveEnergyAction(formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/plugins/growcast.ggs", async () => {
        await requireAdmin();
        const previousEnergy = await readEnergySettings();
        const energy = parseEnergySettingsForm(formData, previousEnergy);
        if (!energy.ok || energy.settings === undefined) {
            logAdminGrowUpdateFailed({
                err: sanitizeError(energy.ok ? "missing_energy" : energy.error),
            });
            return {notice: "save_failed"};
        }
        try {
            await writeEnergySettings(energy.settings);
        } catch (error) {
            logAdminGrowUpdateFailed({err: sanitizeError(error)});
            return {notice: "save_failed"};
        }
        revalidatePath("/p/ggs/energy");
        revalidatePath("/overlay");
        revalidatePath("/admin/plugins/growcast.ggs");
        return {notice: "saved"};
    });
}

export async function connectSpiderFarmerAction(formData: FormData): Promise<AdminActionResult> {
    return withNextRequestLogContext("/admin/plugins/growcast.ggs", async () => {
        await requireAdmin();
        const email = String(formData.get("sfEmail") ?? "").trim();
        const password = String(formData.get("sfPassword") ?? "");
        const serial = String(formData.get("sfSerial") ?? "").trim();
        const result = await prepareSpiderFarmer({email, password, serial});
        if (!result.ok) {
            return {notice: "choose" in result ? "spider_farmer_choose" : result.notice};
        }
        revalidatePath("/admin/plugins/growcast.ggs");
        return {notice: "spider_farmer_connected"};
    });
}
