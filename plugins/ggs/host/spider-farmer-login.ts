import {createCipheriv, createDecipheriv} from "node:crypto";
import type {AdminNoticeId} from "@/lib/admin/notice";

const LOGIN_URL = "https://api.spider-farmer.com/api/ios/ulogin/mailLogin/v2";
const KEY = Buffer.from("Meizhi1234567890", "utf8");
const IV = Buffer.from("1234567890123456", "utf8");

export class SpiderFarmerLoginError extends Error {
    readonly code: string;
    readonly msg: string;

    constructor(code: string, msg: string) {
        super(`${code} ${msg}`);
        this.name = "SpiderFarmerLoginError";
        this.code = code;
        this.msg = msg;
    }
}

export type SpiderFarmerBroker = {
    mqttName: string;
    mqttPwd: string;
    userId: string;
    restToken: string;
};

export type SpiderFarmerController = {
    serial: string;
    name: string;
    prefix: "CB" | "PS" | "LC";
    productType: string;
};

export function encryptSpiderFarmerBody(value: Record<string, unknown>): string {
    const cipher = createCipheriv("aes-128-cbc", KEY, IV);
    const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final(),
    ]);
    return encrypted.toString("base64");
}

export function decryptSpiderFarmerBody(text: string): Record<string, unknown> {
    let raw: Buffer;
    try {
        raw = Buffer.from(text.trim(), "base64");
    } catch {
        throw new SpiderFarmerLoginError("decrypt", "not base64");
    }
    let plain: string;
    try {
        const decipher = createDecipheriv("aes-128-cbc", KEY, IV);
        plain = Buffer.concat([decipher.update(raw), decipher.final()]).toString("utf8");
    } catch {
        throw new SpiderFarmerLoginError("decrypt", "bad ciphertext");
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(plain) as unknown;
    } catch {
        throw new SpiderFarmerLoginError("decrypt", "bad json");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new SpiderFarmerLoginError("decrypt", "not an object");
    }
    return parsed as Record<string, unknown>;
}

export function spiderFarmerSystemData(nowS: number): string {
    return JSON.stringify({
        reqId: nowS * 1000,
        appVersion: "2.5.2",
        osType: "iOS",
        osVersion: "27.0",
        deviceType: "iPhone",
        deviceId: "growcast-ggs",
        netType: "wifi",
        timestamp: nowS,
        timezone: "Europe/Berlin",
        language: "English",
    });
}

export function brokerFromLogin(payload: Record<string, unknown>): SpiderFarmerBroker {
    const code = payload.code == null ? "" : String(payload.code);
    if (code !== "000") {
        const msg = payload.msg == null ? "login failed" : String(payload.msg).slice(0, 180);
        throw new SpiderFarmerLoginError(code || "?", msg);
    }
    const data = payload.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new SpiderFarmerLoginError("000", "missing data");
    }
    const record = data as Record<string, unknown>;
    const mqttName = String(record.mqttName ?? "").trim();
    const mqttPwd = String(record.mqttPwd ?? "").trim();
    if (!mqttName || !mqttPwd) {
        throw new SpiderFarmerLoginError("000", "missing mqtt credentials");
    }
    const userId = String(record.userId ?? "").trim() || "175391";
    const restToken = String(record.token ?? "").trim();
    return {mqttName, mqttPwd, userId, restToken};
}

function decodeResponse(text: string): Record<string, unknown> {
    const stripped = text.trim();
    if (stripped.startsWith("{")) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(stripped) as unknown;
        } catch {
            throw new SpiderFarmerLoginError("decrypt", "bad json");
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new SpiderFarmerLoginError("decrypt", "not an object");
        }
        return parsed as Record<string, unknown>;
    }
    return decryptSpiderFarmerBody(stripped.replace(/^"|"$/g, ""));
}

export async function spiderFarmerMailLogin(
    email: string,
    password: string,
    fetchImpl: typeof fetch = fetch,
    nowS: number = Math.floor(Date.now() / 1000),
): Promise<SpiderFarmerBroker> {
    let response: Response;
    try {
        response = await fetchImpl(LOGIN_URL, {
            method: "POST",
            body: encryptSpiderFarmerBody({email, loginMethod: 1, password}),
            headers: {
                "Content-Type": "application/json",
                "User-Agent": "Dart/3.5 (dart:io)",
                systemdata: spiderFarmerSystemData(nowS),
            },
            signal: AbortSignal.timeout(20_000),
        });
    } catch {
        throw new SpiderFarmerLoginError("network", "unreachable");
    }
    if (!response.ok) {
        throw new SpiderFarmerLoginError(String(response.status), "http");
    }
    return brokerFromLogin(decodeResponse(await response.text()));
}

export function spiderFarmerFailureNotice(error: SpiderFarmerLoginError): AdminNoticeId {
    if (error.code === "100" && /not registered/i.test(error.msg)) {
        return "spider_farmer_unknown_account";
    }
    if (error.code === "100" && /password/i.test(error.msg)) {
        return "spider_farmer_bad_password";
    }
    return "spider_farmer_failed";
}

const DEVICE_LIST_URL = "https://api.spider-farmer.com/api/android/udm/getDeviceList/v1";

export function controllerPrefix(productType: string): SpiderFarmerController["prefix"] {
    const pt = productType.toUpperCase();
    if (pt.includes("LC") || pt.includes("LIGHT")) {
        return "LC";
    }
    if (pt.includes("PS") || pt.includes("AC")) {
        return "PS";
    }
    return "CB";
}

function normalizeSerial(value: string): string {
    return value.replace(/:/g, "").toUpperCase();
}

function systemDataWithToken(token: string, nowS: number): string {
    return JSON.stringify({
        reqId: nowS * 1000,
        appVersion: "2.5.2",
        osType: "android",
        timestamp: nowS,
        token,
    });
}

function controllersFromList(list: unknown): SpiderFarmerController[] {
    if (!Array.isArray(list)) {
        return [];
    }
    const seen = new Set<string>();
    const controllers: SpiderFarmerController[] = [];
    for (const item of list) {
        if (!item || typeof item !== "object") {
            continue;
        }
        const record = item as Record<string, unknown>;
        const serial = normalizeSerial(String(record.deviceSerialnum ?? ""));
        if (!serial || serial.length > 32 || seen.has(serial)) {
            continue;
        }
        seen.add(serial);
        const productType = String(record.productType ?? "").trim();
        const name = String(record.deviceName ?? "").trim() || serial;
        controllers.push({
            serial,
            name: name.slice(0, 80),
            prefix: controllerPrefix(productType),
            productType: productType.slice(0, 40),
        });
    }
    controllers.sort((a, b) => {
        if (a.prefix === b.prefix) {
            return a.name.localeCompare(b.name);
        }
        if (a.prefix === "CB") {
            return -1;
        }
        if (b.prefix === "CB") {
            return 1;
        }
        return a.prefix.localeCompare(b.prefix);
    });
    return controllers;
}

export async function listSpiderFarmerControllers(
    token: string,
    fetchImpl: typeof fetch = fetch,
    nowS: number = Math.floor(Date.now() / 1000),
): Promise<SpiderFarmerController[]> {
    if (!token.trim()) {
        throw new SpiderFarmerLoginError("token", "missing");
    }
    const groups = Array.from({length: 21}, (_, group) => group);
    const lists = await Promise.all(groups.map(async (group) => {
        let response: Response;
        try {
            response = await fetchImpl(DEVICE_LIST_URL, {
                method: "POST",
                body: JSON.stringify({currentPage: 1, type: null, deviceProductGroup: group}),
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "Dart/3.5 (dart:io)",
                    systemdata: systemDataWithToken(token, nowS),
                },
                signal: AbortSignal.timeout(20_000),
            });
        } catch {
            throw new SpiderFarmerLoginError("network", "unreachable");
        }
        if (!response.ok) {
            throw new SpiderFarmerLoginError(String(response.status), "http");
        }
        const payload = decodeResponse(await response.text());
        const code = payload.code == null ? "" : String(payload.code);
        if (code === "102") {
            throw new SpiderFarmerLoginError("102", "token invalid");
        }
        if (code && code !== "000") {
            return [];
        }
        const data = payload.data;
        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return [];
        }
        return controllersFromList((data as Record<string, unknown>).list);
    }));
    const seen = new Set<string>();
    const merged: SpiderFarmerController[] = [];
    for (const controller of lists.flat()) {
        if (seen.has(controller.serial)) {
            continue;
        }
        seen.add(controller.serial);
        merged.push(controller);
    }
    merged.sort((a, b) => {
        if (a.prefix === b.prefix) {
            return a.name.localeCompare(b.name);
        }
        if (a.prefix === "CB") {
            return -1;
        }
        if (b.prefix === "CB") {
            return 1;
        }
        return a.prefix.localeCompare(b.prefix);
    });
    return merged;
}
