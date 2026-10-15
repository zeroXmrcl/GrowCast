import {hasXaiApiKey, xaiApiBase, xaiApiKey, xaiModel} from "@/lib/ai-summary/config";
import {logAiSummary} from "@/lib/ai-summary/log";
import {AI_SUMMARY_SYSTEM_PROMPT} from "@/lib/ai-summary/prompt";
import type {ClimateMetricKey} from "@/lib/climate/types";
import {extractJsonObject, GROW_SUMMARY_JSON_SCHEMA, parseModelSummary} from "@/lib/ai-summary/schema";
import type {AiSummaryPayload} from "@/lib/ai-summary/types";
import type {SummaryStill} from "@/lib/ai-summary/image";

export const XAI_REQUEST_TIMEOUT_MS = 60_000;
export const XAI_MAX_OUTPUT_TOKENS = 1536;

export type XaiChatMessage = {
    role: "system" | "user";
    content: string | Array<Record<string, unknown>>;
};

export function buildXaiMessages(userText: string, still: SummaryStill | null): XaiChatMessage[] {
    const userContent: Array<Record<string, unknown>> = [{type: "text", text: userText}];
    if (still) {
        userContent.push({
            type: "image_url",
            image_url: {url: still.dataUrl, detail: "low"},
        });
    }
    return [
        {role: "system", content: AI_SUMMARY_SYSTEM_PROMPT},
        {role: "user", content: still ? userContent : userText},
    ];
}

function messageText(payload: unknown): string {
    if (!payload || typeof payload !== "object") {
        return "";
    }
    const record = payload as Record<string, unknown>;
    const choices = Array.isArray(record.choices) ? record.choices : [];
    const first = choices[0];
    if (first && typeof first === "object") {
        const message = (first as {message?: {content?: unknown}}).message;
        if (typeof message?.content === "string") {
            return message.content;
        }
        if (Array.isArray(message?.content)) {
            return message.content
                .map((part) => {
                    if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
                        return part.text;
                    }
                    return "";
                })
                .join("");
        }
    }
    if (typeof record.output_text === "string") {
        return record.output_text;
    }
    return "";
}

export type GrowSummaryRequest =
    | {ok: true; ai: AiSummaryPayload; illegal: ClimateMetricKey[]}
    | {ok: false; reason: "transport" | "invalid" | "pre_connect"};

const PRE_CONNECT_CODES = new Set([
    "ENOTFOUND",
    "EAI_AGAIN",
    "EAI_NONAME",
    "ECONNREFUSED",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "ENETDOWN",
]);

function errorCodes(error: unknown): string[] {
    const codes: string[] = [];
    let current: unknown = error;
    for (let depth = 0; depth < 6 && current && typeof current === "object"; depth += 1) {
        const rec = current as {code?: unknown; cause?: unknown};
        if (typeof rec.code === "string" && rec.code.length > 0) {
            codes.push(rec.code);
        }
        current = rec.cause;
    }
    return codes;
}

export function isPreConnectNetworkError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }
    const rec = error as {name?: unknown; code?: unknown};
    if (rec.name === "AbortError" || rec.code === "ABORT_ERR") {
        return false;
    }
    return errorCodes(error).some((code) => PRE_CONNECT_CODES.has(code));
}

export async function requestGrowSummary(input: {
    userText: string;
    still: SummaryStill | null;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
}): Promise<GrowSummaryRequest> {
    if (!input.fetchImpl && process.env.NODE_ENV === "test") {
        logAiSummary("xai_test_refused_global_fetch");
        return {ok: false, reason: "transport"};
    }
    const env = input.env ?? process.env;
    const apiKey = xaiApiKey(env);
    if (!apiKey) {
        return {ok: false, reason: "transport"};
    }
    const fetchImpl = input.fetchImpl ?? fetch;
    const body = {
        model: xaiModel(env),
        temperature: 0.3,
        max_tokens: XAI_MAX_OUTPUT_TOKENS,
        messages: buildXaiMessages(input.userText, input.still),
        response_format: {
            type: "json_schema",
            json_schema: {
                name: "grow_daily_summary",
                strict: true,
                schema: GROW_SUMMARY_JSON_SCHEMA,
            },
        },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), XAI_REQUEST_TIMEOUT_MS);
    let sawResponse = false;
    try {
        const response = await fetchImpl(`${xaiApiBase(env)}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        sawResponse = true;
        if (!response.ok) {
            logAiSummary("xai_http_failed", {status: response.status});
            return {ok: false, reason: "transport"};
        }
        const payload: unknown = await response.json();
        const parsed = parseModelSummary(extractJsonObject(messageText(payload)));
        if (!parsed) {
            logAiSummary("xai_invalid_json");
            return {ok: false, reason: "invalid"};
        }
        return {ok: true, ai: parsed.ai, illegal: parsed.illegal};
    } catch (error) {
        if (!sawResponse && isPreConnectNetworkError(error)) {
            logAiSummary("xai_pre_connect_failed");
            return {ok: false, reason: "pre_connect"};
        }
        logAiSummary("xai_request_failed");
        return {ok: false, reason: "transport"};
    } finally {
        clearTimeout(timer);
    }
}

export {hasXaiApiKey};
