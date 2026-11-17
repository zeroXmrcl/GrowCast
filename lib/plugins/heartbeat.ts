import {isRecord} from "@/lib/coerce";
import {writePluginHeartbeat} from "@/lib/plugins/store";
import type {PluginHeartbeat} from "@/lib/plugins/types";

export async function recordPluginHeartbeat(pluginId: string, raw: unknown): Promise<{ok: true} | {ok: false; error: string}> {
    if (!isRecord(raw) || typeof raw.ok !== "boolean") {
        return {ok: false, error: "heartbeat requires { ok: boolean }"};
    }
    const heartbeat: PluginHeartbeat = {
        ok: raw.ok,
        status: typeof raw.status === "string" ? raw.status.slice(0, 200) : undefined,
        at: new Date().toISOString(),
    };
    await writePluginHeartbeat(pluginId, heartbeat);
    return {ok: true};
}
