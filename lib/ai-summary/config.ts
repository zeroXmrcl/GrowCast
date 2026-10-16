const DEFAULT_MODEL = "grok-4.3";
const DEFAULT_BASE = "https://api.x.ai/v1";

export function xaiApiKey(env: NodeJS.ProcessEnv = process.env): string {
    return (env.XAI_API_KEY ?? "").trim();
}

export function hasXaiApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
    return xaiApiKey(env).length > 0;
}

export function aiSummaryDemoMode(env: NodeJS.ProcessEnv = process.env): boolean {
    const raw = (env.AI_SUMMARY_DEMO ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true";
}

export function aiSummaryWidgetEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    return hasXaiApiKey(env) || aiSummaryDemoMode(env);
}

export function xaiModel(env: NodeJS.ProcessEnv = process.env): string {
    const configured = (env.XAI_MODEL ?? "").trim();
    return configured || DEFAULT_MODEL;
}

export function xaiApiBase(env: NodeJS.ProcessEnv = process.env): string {
    const configured = (env.XAI_API_BASE ?? "").trim().replace(/\/+$/, "");
    return configured || DEFAULT_BASE;
}

export const DEFAULT_XAI_MODEL = DEFAULT_MODEL;
