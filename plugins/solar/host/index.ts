import {isAdminAuthenticated} from "@/lib/admin-auth";
import {noticeJson} from "@/lib/admin/notice-response";
import {isUsableSeededAt} from "@/lib/ai-summary/stage";
import {getCurrentGrow} from "@/lib/db";
import {pluginIdForExport} from "@/lib/plugins/capabilities";
import {readPluginConfig, readPluginSecrets, stripSecrets, writePluginConfig} from "@/lib/plugins/config";
import {findDiscoveredPlugin} from "@/lib/plugins/discovery";
import {readPluginLive, readPluginSeries} from "@/lib/plugins/store";
import type {PluginHostModule} from "@/lib/plugins/types";
import {allocateSolarInstant, type AllocationMode, type BatteryDischargeOrigin} from "./allocation";
import {daysInMsRange, parseSolarRange, rangeWindowMs} from "./ranges";
import {buildSolarView, growCycleFromCurrent} from "./view";

const PLUGIN_ID = "growcast.solar";

function asMode(value: unknown): AllocationMode {
    return value === "tent-first" || value === "tent-last" ? value : "proportional";
}

function asOrigin(value: unknown): BatteryDischargeOrigin {
    return value === "always-grid" || value === "mix" ? value : "always-solar";
}

function tentWattsFromGgs(state: Record<string, unknown> | null): number | null {
    if (!state || typeof state !== "object") {
        return null;
    }
    const energy = (state as {energy?: {nowWatts?: unknown}}).energy;
    const watts = energy?.nowWatts;
    return typeof watts === "number" && Number.isFinite(watts) ? watts : null;
}

function tentDevicesFromGgs(state: Record<string, unknown> | null): Array<{
    name: string;
    label: string;
    kind: string;
    watts: number | null;
}> {
    if (!state || typeof state !== "object") {
        return [];
    }
    const energy = (state as {energy?: {devices?: unknown}}).energy;
    if (!Array.isArray(energy?.devices)) {
        return [];
    }
    return energy.devices.filter((row) => row && typeof row === "object") as Array<{
        name: string;
        label: string;
        kind: string;
        watts: number | null;
    }>;
}

export async function onIngest(
    input: Parameters<NonNullable<PluginHostModule["onIngest"]>>[0],
): Promise<void> {
    const config = await readPluginConfig(input.pluginId);
    const tentPlugin = await pluginIdForExport("tentEnergy") ?? await pluginIdForExport("energy");
    const tentLive = tentPlugin ? await readPluginLive(tentPlugin) : null;
    const tentW = tentWattsFromGgs(tentLive?.state ?? null)
        ?? (typeof input.metrics["tent.power"] === "number" ? input.metrics["tent.power"] : null);
    const split = allocateSolarInstant({
        pvW: input.metrics["pv.power"] ?? null,
        batteryW: input.metrics["battery.power"] ?? null,
        gridW: input.metrics["grid.power"] ?? null,
        houseW: input.metrics["house.power"] ?? null,
        tentW,
        batterySolarMix: 1,
    }, asMode(config.allocationMode), asOrigin(config.batteryDischargeOrigin));
    input.metrics["tent.power"] = tentW;
    input.metrics["tent.from_solar"] = split.tentFromSolarW;
    input.metrics["tent.from_grid"] = split.tentFromGridW;
    input.metrics["tent.from_pv"] = split.tentFromPvW;
    input.metrics["tent.from_battery"] = split.tentFromBatteryW;
    const grow = await getCurrentGrow();
    const growCycle = growCycleFromCurrent(grow.details.seededAt, isUsableSeededAt(grow.details.seededAt));
    const state = input.state ?? {};
    state.allocation = split;
    state.tentEnergy = tentLive?.state ?? null;
    state.tentDevices = tentDevicesFromGgs(tentLive?.state ?? null);
    state.growCycle = growCycle;
    input.state = state;
}

function json(body: unknown, status = 200): Response {
    return Response.json(body, {status, headers: {"Cache-Control": "no-store"}});
}

async function currentGrowCycle() {
    const grow = await getCurrentGrow();
    return growCycleFromCurrent(grow.details.seededAt, isUsableSeededAt(grow.details.seededAt));
}

export async function handlePublic(request: Request, remainder: string): Promise<Response> {
    const pathName = remainder.replace(/^\/+|\/+$/g, "");
    if (pathName !== "range") {
        return json({error: "Not found"}, 404);
    }
    const url = new URL(request.url);
    const range = parseSolarRange(url.searchParams.get("window") ?? url.searchParams.get("range"));
    const sample = url.searchParams.get("sample") === "1";
    const config = await readPluginConfig(PLUGIN_ID);
    const timezone = String(config.timezone || "Europe/Berlin");
    const live = await readPluginLive(PLUGIN_ID);
    const grow = await currentGrowCycle();
    const nowMs = Date.now();
    const window = rangeWindowMs(range === "live" ? "24h" : range, nowMs, grow, timezone);
    const days = window.ok ? daysInMsRange(window.startMs, window.endMs, timezone) : [];
    const series = days.length === 0
        ? {}
        : await readPluginSeries(PLUGIN_ID, [
            "pv.power",
            "battery.power",
            "battery.soc",
            "grid.power",
            "house.power",
            "tent.power",
            "tent.from_solar",
            "tent.from_pv",
            "tent.from_battery",
            "tent.from_grid",
        ], days);
    const liveMetrics: Record<string, number | null> = {};
    for (const [key, metric] of Object.entries(live.metrics)) {
        liveMetrics[key] = metric.value;
    }
    liveMetrics["tent.power"] = liveMetrics["tent.power"] ?? tentWattsFromGgs(live.state);
    const view = buildSolarView({
        range,
        nowMs,
        timezone,
        sample,
        grow,
        config,
        liveMetrics,
        liveState: live.state,
        observedAt: live.observedAt,
        stale: live.stale,
        series,
    });
    return json(view);
}

export async function handleAction(request: Request, remainder: string): Promise<Response> {
    if (!(await isAdminAuthenticated())) {
        return json({error: "Unauthorized"}, 401);
    }
    const pathName = remainder.replace(/^\/+|\/+$/g, "");
    const discovered = await findDiscoveredPlugin(PLUGIN_ID);
    if (!discovered) {
        return json({error: "Unknown plugin"}, 404);
    }
    if (pathName === "admin-state" && request.method === "GET") {
        const config = await readPluginConfig(PLUGIN_ID);
        const secrets = await readPluginSecrets(PLUGIN_ID);
        return json({
            config: stripSecrets(discovered.manifest, config),
            passwordSet: Boolean(secrets.password),
            fields: discovered.manifest.config,
        });
    }
    if (pathName === "config" && request.method === "POST") {
        const contentType = request.headers.get("content-type") ?? "";
        let body: Record<string, unknown> = {};
        if (contentType.includes("application/json")) {
            const raw = await request.json().catch(() => null);
            body = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        } else {
            const form = await request.formData();
            body = Object.fromEntries(form.entries());
        }
        try {
            await writePluginConfig(PLUGIN_ID, discovered.manifest, body);
        } catch (error) {
            return json({error: error instanceof Error ? error.message : "Invalid config"}, 422);
        }
        return noticeJson("saved");
    }
    return json({error: "Not found"}, 404);
}
