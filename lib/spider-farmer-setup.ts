import type {AdminNoticeId} from "@/lib/admin/notice";
import {writeSpiderFarmerBrokerEnv} from "@/lib/ggs-sidecar-env";
import {ensureMeshToken} from "@/lib/mesh-token";
import {
    clearStoredControllers,
    writeStoredControllers,
} from "@/lib/setup-account";
import {
    SpiderFarmerLoginError,
    listSpiderFarmerControllers,
    spiderFarmerFailureNotice,
    spiderFarmerMailLogin,
    type SpiderFarmerController,
} from "@/lib/spider-farmer-login";

export type SpiderFarmerSetupResult =
    | {ok: true; account: string; serial: string; name: string}
    | {ok: false; choose: SpiderFarmerController[]}
    | {ok: false; notice: AdminNoticeId};

function normalizeSerial(value: string): string {
    return value.replace(/:/g, "").toUpperCase();
}

export async function prepareSpiderFarmer(input: {
    email: string;
    password: string;
    serial?: string;
    fetchImpl?: typeof fetch;
}): Promise<SpiderFarmerSetupResult> {
    const email = input.email.trim();
    const password = input.password;
    if (!email || !password.trim() || /[\r\n]/.test(email) || /[\r\n]/.test(password)) {
        return {ok: false, notice: "spider_farmer_missing"};
    }
    try {
        const broker = await spiderFarmerMailLogin(email, password, input.fetchImpl);
        if (!broker.restToken) {
            return {ok: false, notice: "spider_farmer_failed"};
        }
        const controllers = await listSpiderFarmerControllers(broker.restToken, input.fetchImpl);
        const requested = input.serial ? normalizeSerial(input.serial) : "";
        const chosen = requested
            ? controllers.find((controller) => controller.serial === requested)
            : controllers.length === 1
                ? controllers[0]
                : undefined;
        if (!chosen) {
            if (controllers.length === 0) {
                return {ok: false, notice: "spider_farmer_no_controller"};
            }
            await writeStoredControllers(controllers);
            return {ok: false, choose: controllers};
        }
        const meshToken = await ensureMeshToken();
        const lcSerials = controllers
            .filter((controller) => controller.prefix === "LC" && controller.serial !== chosen.serial)
            .map((controller) => controller.serial)
            .join(",");
        await writeSpiderFarmerBrokerEnv({
            email,
            mqttName: broker.mqttName,
            mqttPwd: broker.mqttPwd,
            userId: broker.userId,
            serial: chosen.serial,
            prefix: chosen.prefix,
            lcSerials,
            meshToken,
        });
        await clearStoredControllers();
        return {ok: true, account: email, serial: chosen.serial, name: chosen.name};
    } catch (error) {
        return {
            ok: false,
            notice: error instanceof SpiderFarmerLoginError
                ? spiderFarmerFailureNotice(error)
                : "spider_farmer_failed",
        };
    }
}
