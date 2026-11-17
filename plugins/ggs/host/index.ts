import {isAdminAuthenticated} from "@/lib/admin-auth";
import {noticeJson} from "@/lib/admin/notice-response";
import {berlinDateOnly, berlinDateWindow} from "@/lib/berlin-date";
import {airVpdKPa} from "@/lib/air-vpd";
import {PLUGIN_API_VERSION, type PluginHostModule, type PluginIngestBody} from "@/lib/plugins/types";
import {connectSpiderFarmerAction, saveEnergyAction} from "@/plugins/ggs/admin/actions";
import {energyActuatorRows, readEnergySettings} from "@/plugins/ggs/host/energy/settings";
import {readStoredControllers} from "@/plugins/ggs/host/controllers";
import {accrueEnergyOnIngest} from "@/plugins/ggs/host/energy/accrue";
import {recordClimateOnIngestBestEffort} from "@/plugins/ggs/host/climate/writer";
import {parseIngestBody, withStale, type GgsLiveIngest} from "@/plugins/ggs/host/ggs-live";
import {readGgsLive, saveGgsLive} from "@/plugins/ggs/host/ggs-live-store";
import {publishLive} from "@/plugins/ggs/host/ggs-live-hub";
import {climateHistoryGetResponse} from "@/plugins/ggs/host/climate/history-http";
import {readClimateDay} from "@/plugins/ggs/host/climate/store";
import {stageClimateArchive, resetClimateCurrentLocked} from "@/plugins/ggs/host/climate/archive";
import {stageEnergyArchive, resetEnergyCurrentLocked} from "@/plugins/ggs/host/energy/archive";
import {energyGetResponse, tariffKindForEnergyGet} from "@/plugins/ggs/host/energy/http";
import {
    liveClimateGetResponse,
    liveClimateStreamResponse,
} from "@/plugins/ggs/host/ggs-live-http";
import {pickClimateDevice} from "@/plugins/ggs/host/live-climate-view";
import {readSpiderFarmerBrokerStatus} from "@/plugins/ggs/host/ggs-sidecar-env";
import {prepareSpiderFarmer} from "@/plugins/ggs/host/spider-farmer-setup";
import type {PluginSetupResult} from "@/lib/plugins/types";

export function fromMeshState(raw: unknown): PluginIngestBody | {error: string} {
    const parsed = parseIngestBody(raw);
    if (!parsed.ok) {
        return {error: parsed.error};
    }
    return {
        apiVersion: PLUGIN_API_VERSION,
        observedAt: parsed.value.updatedAt,
        state: parsed.value as unknown as Record<string, unknown>,
    };
}

export async function onIngest(input: Parameters<NonNullable<PluginHostModule["onIngest"]>>[0]): Promise<void> {
    if (!input.state) {
        return;
    }
    const parsed = parseIngestBody(input.state);
    if (!parsed.ok) {
        return;
    }
    const snapshot: GgsLiveIngest = parsed.value;
    await saveGgsLive(snapshot);
    await recordClimateOnIngestBestEffort(snapshot);
    try {
        await accrueEnergyOnIngest(snapshot);
    } catch {
        /* energy is best-effort on the live path */
    }
    try {
        const {nowDeviceRowsFromSnapshot, nowWattsFromSnapshot} = await import("@/plugins/ggs/host/energy/scoreboard");
        const {readEnergySettings} = await import("@/plugins/ggs/host/energy/settings");
        const settings = await readEnergySettings();
        const watts = nowWattsFromSnapshot(snapshot, settings.overrides);
        input.state.energy = {
            nowWatts: watts === null ? null : Math.round(watts),
            devices: nowDeviceRowsFromSnapshot(snapshot, settings.overrides),
        };
    } catch {
        /* tent watts on plugin state are best-effort */
    }
    publishLive(withStale(snapshot));
}

function actionNotice(notice: string): Response {
    const failed = /failed|missing|invalid|need_|choose|no_controller|bad_password|unknown_account/.test(notice);
    return noticeJson(notice, failed ? 400 : 200);
}

export async function handleAction(request: Request, remainder: string): Promise<Response> {
    if (!(await isAdminAuthenticated())) {
        return Response.json({error: "Unauthorized"}, {status: 401, headers: {"Cache-Control": "no-store"}});
    }
    const pathName = remainder.replace(/^\/+|\/+$/g, "");
    if (pathName === "energy" && request.method === "GET") {
        return energyGetResponse(request, tariffKindForEnergyGet(true, request));
    }
    if (pathName === "admin-state" && request.method === "GET") {
        const [energySettings, live, spiderFarmer, controllers] = await Promise.all([
            readEnergySettings(),
            readGgsLive(),
            readSpiderFarmerBrokerStatus().catch(() => ({
                configured: false,
                account: null,
                serial: null,
                pathKind: "missing" as const,
            })),
            readStoredControllers(),
        ]);
        return Response.json({
            energySettings,
            energyActuators: energyActuatorRows(live, energySettings),
            spiderFarmer,
            controllers,
            live: live ? withStale(live) : null,
        }, {headers: {"Cache-Control": "no-store"}});
    }
    if (pathName === "energy" && request.method === "POST") {
        return actionNotice((await saveEnergyAction(await request.formData())).notice);
    }
    if (pathName === "spider-farmer" && request.method === "POST") {
        return actionNotice((await connectSpiderFarmerAction(await request.formData())).notice);
    }
    return Response.json({error: "Not found"}, {status: 404, headers: {"Cache-Control": "no-store"}});
}

export async function handlePublic(request: Request, remainder: string): Promise<Response> {
    const path = remainder.replace(/^\/+|\/+$/g, "");
    if (path === "energy") {
        return energyGetResponse(request, "public");
    }
    if (path === "live-climate") {
        return liveClimateGetResponse();
    }
    if (path === "live-climate/stream") {
        return liveClimateStreamResponse(request);
    }
    if (path === "climate-history") {
        return climateHistoryGetResponse(request);
    }
    return Response.json({error: "Not found"}, {status: 404, headers: {"Cache-Control": "no-store"}});
}

export async function onGrowArchived(ctx: {
    destDir: string;
    growId: string;
    seededAt: string;
    archivedAt: string;
}): Promise<void> {
    await stageEnergyArchive(ctx.destDir, ctx.growId, ctx.archivedAt);
    await stageClimateArchive(ctx.destDir, ctx.growId, ctx.archivedAt, ctx.seededAt);
}

export async function onGrowReset(): Promise<void> {
    try {
        await resetEnergyCurrentLocked();
    } catch {
        /* reset is best-effort after archive */
    }
    try {
        await resetClimateCurrentLocked();
    } catch {
        /* reset is best-effort after archive */
    }
}

export async function climatePointsForWindow(startMs: number, endMs: number) {
    const startDate = berlinDateOnly(startMs);
    const endDate = berlinDateOnly(endMs - 1);
    const dates = berlinDateWindow(endDate, 3).filter((date) => date >= startDate && date <= endDate);
    if (!dates.includes(startDate)) {
        dates.push(startDate);
    }
    dates.sort();
    const points = [];
    for (const date of dates) {
        const day = await readClimateDay(date);
        if (day) {
            points.push(...day.points);
        }
    }
    return points.sort((a, b) => a.t.localeCompare(b.t));
}

export async function setupStatus() {
    const climate = await readSpiderFarmerBrokerStatus();
    return {
        complete: climate.configured,
        detail: climate.configured ? climate.serial : null,
    };
}

export async function handleSetup(formData: FormData): Promise<PluginSetupResult> {
    const result = await prepareSpiderFarmer({
        email: String(formData.get("sfEmail") ?? ""),
        password: String(formData.get("sfPassword") ?? ""),
        serial: String(formData.get("sfSerial") ?? ""),
    });
    if (result.ok) {
        return {ok: true, detail: result.name};
    }
    if ("choose" in result) {
        return {
            ok: false,
            message: "This account has more than one controller. Choose the climate controller.",
            choose: result.choose,
        };
    }
    if (result.notice === "spider_farmer_bad_password") {
        return {ok: false, message: "Spider Farmer did not accept that password."};
    }
    if (result.notice === "spider_farmer_unknown_account") {
        return {ok: false, message: "That email is not a Spider Farmer account."};
    }
    if (result.notice === "spider_farmer_no_controller") {
        return {ok: false, message: "Spider Farmer accepted the login and returned no controllers."};
    }
    if (result.notice === "spider_farmer_missing") {
        return {ok: false, message: "Enter the Spider Farmer email and password."};
    }
    return {ok: false, message: "Could not reach Spider Farmer. Try again."};
}

export async function liveReadings() {
    const snapshot = await readGgsLive();
    if (!snapshot) {
        return null;
    }
    const publicLive = withStale(snapshot);
    const device = pickClimateDevice(publicLive);
    if (!device) {
        return {
            values: {tempC: null, humidityPct: null, vpd: null, co2: null, ppfd: null},
            isDay: null,
            asOf: publicLive.updatedAt,
        };
    }
    const tempC = typeof device.sensor.tempC === "number" ? device.sensor.tempC : null;
    const humidityPct = typeof device.sensor.humidityPct === "number" ? device.sensor.humidityPct : null;
    return {
        values: {
            tempC,
            humidityPct,
            vpd: airVpdKPa(tempC, humidityPct),
            co2: typeof device.sensor.co2 === "number" ? device.sensor.co2 : null,
            ppfd: typeof device.sensor.ppfd === "number" ? device.sensor.ppfd : null,
        },
        isDay: typeof device.sensor.isDay === "boolean" ? device.sensor.isDay : null,
        asOf: publicLive.updatedAt,
    };
}
