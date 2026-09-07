import {publishOverlayAlert} from "@/lib/overlay-alert-hub";
import {readAlertsSettings} from "@/lib/restream/alerts-settings";

export type ApplyProgramAlertResult =
    | {ok: true}
    | {ok: false; reason: "empty"};

export async function applyProgramAlert(body: string): Promise<ApplyProgramAlertResult> {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
        return {ok: false, reason: "empty"};
    }
    publishOverlayAlert(
        {
            id: crypto.randomUUID(),
            kind: "manual",
            title: "Alert",
            body: trimmed,
            createdAt: Date.now(),
        },
        await readAlertsSettings(),
    );
    return {ok: true};
}
