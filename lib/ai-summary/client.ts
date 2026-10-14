import {hasXaiApiKey, xaiApiBase, xaiApiKey, xaiModel} from "@/lib/ai-summary/config";
import {logAiSummary} from "@/lib/ai-summary/log";
import {AI_SUMMARY_SYSTEM_PROMPT} from "@/lib/ai-summary/prompt";
import {extractJsonObject, GROW_SUMMARY_JSON_SCHEMA, parseAiSummaryPayload} from "@/lib/ai-summary/schema";
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

export async function requestGrowSummary(input: {
    userText: string;
    still: SummaryStill | null;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
}): Promise<AiSummaryPayload | null> {
    const env = input.env ?? process.env;
    const apiKey = xaiApiKey(env);
    if (!apiKey) {
        return null;
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
        if (!response.ok) {
            logAiSummary("xai_http_failed", {status: response.status});
            return null;
        }
        const payload: unknown = await response.json();
        const parsed = parseAiSummaryPayload(extractJsonObject(messageText(payload)));
        if (!parsed) {
            logAiSummary("xai_invalid_json");
        }
        return parsed;
    } catch {
        logAiSummary("xai_request_failed");
        return null;
    } finally {
        clearTimeout(timer);
    }
}

export {hasXaiApiKey};
