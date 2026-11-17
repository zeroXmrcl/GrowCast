import {isRecord} from "@/lib/coerce";
import type {PluginConfigValues} from "@/lib/plugins/config";
import {PLUGIN_API_VERSION, PLUGIN_FUTURE_SKEW_MS, type PluginIngestBody, type PluginManifest} from "@/lib/plugins/types";

export const SECRET_KEYS = new Set([
    "password",
    "passwd",
    "token",
    "mqttPwd",
    "mqttName",
    "mqtt_password",
    "authorization",
    "secret",
    "apiKey",
    "apikey",
]);

export type IngestValidationError = {
    status: 422 | 429;
    error: string;
};

export type IngestValidationOk = {
    observedAt: string;
    metrics: Record<string, number>;
    state: Record<string, unknown> | null;
};

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function tokenizeExpr(expr: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < expr.length) {
        const ch = expr[i];
        if (ch === " " || ch === "\t") {
            i += 1;
            continue;
        }
        if ("+-*/()".includes(ch)) {
            tokens.push(ch);
            i += 1;
            continue;
        }
        if (ch === "." || (ch >= "0" && ch <= "9")) {
            let j = i;
            while (j < expr.length && /[0-9.]/.test(expr[j])) {
                j += 1;
            }
            tokens.push(expr.slice(i, j));
            i = j;
            continue;
        }
        if (IDENT.test(ch)) {
            let j = i;
            while (j < expr.length && /[a-zA-Z0-9_.]/.test(expr[j])) {
                j += 1;
            }
            tokens.push(expr.slice(i, j));
            i = j;
            continue;
        }
        throw new Error(`bad char ${ch}`);
    }
    return tokens;
}

function evalExpr(expr: string, config: PluginConfigValues): number {
    const tokens = tokenizeExpr(expr);
    let i = 0;
    function peek(): string | undefined {
        return tokens[i];
    }
    function eat(): string {
        const t = tokens[i];
        i += 1;
        return t;
    }
    function parsePrimary(): number {
        const t = eat();
        if (t === "(") {
            const v = parseAdd();
            if (eat() !== ")") {
                throw new Error("expected )");
            }
            return v;
        }
        if (t === "-") {
            return -parsePrimary();
        }
        if (t.startsWith("config.")) {
            const key = t.slice("config.".length);
            const value = config[key];
            if (typeof value !== "number" || !Number.isFinite(value)) {
                throw new Error(`config.${key} is not a number`);
            }
            return value;
        }
        const n = Number(t);
        if (!Number.isFinite(n)) {
            throw new Error(`bad number ${t}`);
        }
        return n;
    }
    function parseMul(): number {
        let v = parsePrimary();
        while (peek() === "*" || peek() === "/") {
            const op = eat();
            const r = parsePrimary();
            v = op === "*" ? v * r : v / r;
        }
        return v;
    }
    function parseAdd(): number {
        let v = parseMul();
        while (peek() === "+" || peek() === "-") {
            const op = eat();
            const r = parseMul();
            v = op === "+" ? v + r : v - r;
        }
        return v;
    }
    const value = parseAdd();
    if (i !== tokens.length) {
        throw new Error("trailing tokens");
    }
    if (!Number.isFinite(value)) {
        throw new Error("non-finite");
    }
    return value;
}

export function resolveBound(spec: number | string | undefined, config: PluginConfigValues): number | undefined {
    if (spec === undefined) {
        return undefined;
    }
    if (typeof spec === "number") {
        return spec;
    }
    try {
        return evalExpr(spec, config);
    } catch {
        return undefined;
    }
}

export function payloadHasSecretKey(value: unknown, depth = 0): boolean {
    if (depth > 8 || value === null || value === undefined) {
        return false;
    }
    if (Array.isArray(value)) {
        return value.some((item) => payloadHasSecretKey(item, depth + 1));
    }
    if (!isRecord(value)) {
        return false;
    }
    for (const [key, child] of Object.entries(value)) {
        if (SECRET_KEYS.has(key)) {
            return true;
        }
        if (payloadHasSecretKey(child, depth + 1)) {
            return true;
        }
    }
    return false;
}

export function validateIngestBody(
    manifest: PluginManifest,
    raw: unknown,
    config: PluginConfigValues,
    previousCounters: Record<string, number>,
    nowMs = Date.now(),
): IngestValidationOk | IngestValidationError {
    if (!isRecord(raw)) {
        return {status: 422, error: "body must be an object"};
    }
    if (payloadHasSecretKey(raw)) {
        return {status: 422, error: "payload contains a forbidden secret key"};
    }
    if (raw.apiVersion !== PLUGIN_API_VERSION) {
        return {status: 422, error: `apiVersion must be ${PLUGIN_API_VERSION}`};
    }
    if (typeof raw.observedAt !== "string" || !Number.isFinite(Date.parse(raw.observedAt))) {
        return {status: 422, error: "observedAt must be an ISO-8601 timestamp"};
    }
    const observedMs = Date.parse(raw.observedAt);
    if (observedMs - nowMs > PLUGIN_FUTURE_SKEW_MS) {
        return {status: 422, error: "observedAt is in the future"};
    }
    const metricsIn = raw.metrics;
    const metrics: Record<string, number> = {};
    if (metricsIn !== undefined) {
        if (!isRecord(metricsIn)) {
            return {status: 422, error: "metrics must be an object"};
        }
        for (const [key, sample] of Object.entries(metricsIn)) {
            const spec = manifest.metrics[key];
            if (!spec) {
                return {status: 422, error: `unknown metric "${key}"`};
            }
            if (!isRecord(sample)) {
                return {status: 422, error: `metric "${key}" must be an object`};
            }
            if (sample.value === null || sample.value === undefined) {
                continue;
            }
            if (typeof sample.value !== "number" || !Number.isFinite(sample.value)) {
                return {status: 422, error: `metric "${key}" is not a finite number`};
            }
            const min = resolveBound(spec.min, config);
            const max = resolveBound(spec.max, config);
            if (min !== undefined && sample.value < min) {
                return {status: 422, error: `metric "${key}" is below min ${min}`};
            }
            if (max !== undefined && sample.value > max) {
                return {status: 422, error: `metric "${key}" is above max ${max}`};
            }
            if (spec.kind === "counter") {
                const prev = previousCounters[key];
                if (prev !== undefined && sample.value < prev) {
                    // Counter reset: accepted, not booked as negative energy.
                }
            }
            metrics[key] = sample.value;
        }
    }
    let state: Record<string, unknown> | null = null;
    if (raw.state !== undefined) {
        if (!isRecord(raw.state)) {
            return {status: 422, error: "state must be an object"};
        }
        state = raw.state;
    }
    return {
        observedAt: new Date(observedMs).toISOString(),
        metrics,
        state,
    };
}

export function asIngestBody(value: IngestValidationOk): PluginIngestBody {
    return {
        apiVersion: PLUGIN_API_VERSION,
        observedAt: value.observedAt,
        metrics: Object.fromEntries(Object.entries(value.metrics).map(([key, value]) => [key, {value}])),
        state: value.state ?? undefined,
    };
}
