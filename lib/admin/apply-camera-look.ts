import {isRecord} from "@/lib/coerce";
import {parseCameraLook} from "@/lib/restream/camera-look";
import {writeCameraLook} from "@/lib/restream/camera-look-store";

export type ApplyCameraLookResult =
    | {ok: true}
    | {ok: false; reason: "invalid_json"};

export async function applyCameraLook(raw: unknown): Promise<ApplyCameraLookResult> {
    if (!isRecord(raw)) {
        return {ok: false, reason: "invalid_json"};
    }
    await writeCameraLook(parseCameraLook(raw));
    return {ok: true};
}
