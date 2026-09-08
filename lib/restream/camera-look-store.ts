import {chmod, readFile} from "node:fs/promises";
import {atomicWriteFile} from "@/lib/atomic-file";
import {
    EMPTY_CAMERA_LOOK,
    parseCameraLook,
    type CameraLook,
} from "@/lib/restream/camera-look";
import {restreamCameraLookFile, restreamDir} from "@/lib/restream/paths";

export async function readCameraLook(): Promise<CameraLook> {
    try {
        return parseCameraLook(JSON.parse(await readFile(restreamCameraLookFile(), "utf8")));
    } catch {
        return EMPTY_CAMERA_LOOK;
    }
}

export async function writeCameraLook(look: CameraLook): Promise<void> {
    const parsed = parseCameraLook(look);
    await atomicWriteFile(restreamCameraLookFile(), `${JSON.stringify(parsed, null, 2)}\n`);
    await chmod(restreamDir(), 0o700).catch(() => undefined);
    await chmod(restreamCameraLookFile(), 0o600);
}
