/** Keys that belong to the old process layout, not the data/ sidecar files. */
const SKIP_LEGACY_KEYS = new Set([
    "SF_PASSWORD",
    "API_URL",
    "API_TOKEN",
    "GROWCAST_URL",
    "GROWCAST_MESH_TOKEN",
    "LOG_LEVEL",
    "SNAPSHOT_DIR_OUT",
    "TIMELAPSE_DIR_OUT",
]);

function unquote(value: string): string {
    if (
        (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2)
        || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
        return value.slice(1, -1);
    }
    return value;
}

export function parseEnvKeys(source: string): Map<string, string> {
    const values = new Map<string, string>();
    for (const line of source.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !line.includes("=")) {
            continue;
        }
        const eq = line.indexOf("=");
        const key = line.slice(0, eq).trim();
        const value = unquote(line.slice(eq + 1).trim());
        if (key) {
            values.set(key, value);
        }
    }
    return values;
}

/**
 * Copy legacy plugin env into the sidecar file.
 * A non-empty value already in `existing` is kept. Empty legacy values and
 * process-local keys are ignored.
 */
export function mergeMissingEnv(existing: string, incoming: string): {text: string; changed: boolean} {
    const current = parseEnvKeys(existing);
    const legacy = parseEnvKeys(incoming);
    const additions = new Map<string, string>();
    for (const [key, value] of legacy) {
        if (!value || SKIP_LEGACY_KEYS.has(key)) {
            continue;
        }
        if ((current.get(key) ?? "").trim()) {
            continue;
        }
        additions.set(key, value);
    }
    if (additions.size === 0) {
        return {text: existing, changed: false};
    }
    const written = new Set<string>();
    const next: string[] = [];
    for (const line of existing.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !line.includes("=")) {
            if (line.length > 0 || next.length > 0) {
                next.push(line);
            }
            continue;
        }
        const key = line.slice(0, line.indexOf("=")).trim();
        if (additions.has(key) && !(current.get(key) ?? "").trim()) {
            if (!written.has(key)) {
                next.push(`${key}=${additions.get(key)}`);
                written.add(key);
            }
            continue;
        }
        next.push(line);
    }
    for (const [key, value] of additions) {
        if (!written.has(key)) {
            next.push(`${key}=${value}`);
        }
    }
    while (next.length > 0 && next[next.length - 1] === "") {
        next.pop();
    }
    return {text: `${next.join("\n")}\n`, changed: true};
}

/** Schedule fields from data/mesh/growcast.timelapse.json. Empty values are skipped. */
export function timelapseScheduleFromMesh(raw: unknown): Record<string, string> {
    if (!raw || typeof raw !== "object") {
        return {};
    }
    const record = raw as Record<string, unknown>;
    const settings = record.settings && typeof record.settings === "object"
        ? record.settings as Record<string, unknown>
        : record;
    const updates: Record<string, string> = {};
    const put = (key: string, value: unknown) => {
        if (value === null || value === undefined || value === "") {
            return;
        }
        updates[key] = String(value).trim();
    };
    put("TZ", settings.timezone);
    put("TIME_1", settings.time_1 ?? settings.time1);
    put("TIME_2", settings.time_2 ?? settings.time2);
    put("TIME_3", settings.time_3 ?? settings.time3);
    put("INTERVAL", settings.interval ?? settings.intervalMinutes);
    put("TIMELAPSE_LENGTH_SECONDS", settings.timelapseLength ?? settings.timelapseLengthSeconds);
    put("TIMELAPSE_QUALITY", settings.timelapseQuality);
    return updates;
}
