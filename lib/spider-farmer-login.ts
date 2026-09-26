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
    return {mqttName, mqttPwd, userId};
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
