import {chmod, readFile} from "node:fs/promises";
import {atomicWriteFile} from "@/lib/atomic-file";
import {asNumber, isRecord} from "@/lib/coerce";
import {restreamCameraLookFile, restreamDir} from "@/lib/restream/paths";

export const CAMERA_LOOK_MIN = -100;
export const CAMERA_LOOK_MAX = 100;
export const CAMERA_LOOK_MESSAGE_TYPE = "growcast-camera-look";
export const CAMERA_LOOK_DRAFT_EVENT = "growcast-camera-look-draft";
export const PROGRAM_CAMERA_POLL_MS = 2000;

export type CameraLook = {
    brightness: number;
    contrast: number;
    saturation: number;
    temperature: number;
};

export const EMPTY_CAMERA_LOOK: CameraLook = {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
};

export function parseCameraLookPct(value: unknown): number {
    const n = asNumber(value, Number.NaN);
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.min(CAMERA_LOOK_MAX, Math.max(CAMERA_LOOK_MIN, Math.round(n)));
}

export function parseCameraLook(raw: unknown): CameraLook {
    if (!isRecord(raw)) {
        return EMPTY_CAMERA_LOOK;
    }
    return {
        brightness: parseCameraLookPct(raw.brightness),
        contrast: parseCameraLookPct(raw.contrast),
        saturation: parseCameraLookPct(raw.saturation),
        temperature: parseCameraLookPct(raw.temperature),
    };
}

export function cameraLookFilterCss(look: CameraLook): string {
    const parts: string[] = [];
    if (look.brightness !== 0) {
        parts.push(`brightness(${1 + look.brightness / 100})`);
    }
    if (look.contrast !== 0) {
        parts.push(`contrast(${1 + look.contrast / 100})`);
    }
    if (look.saturation !== 0) {
        parts.push(`saturate(${1 + look.saturation / 100})`);
    }
    return parts.join(" ");
}

export function cameraLookTemperatureStyle(temperature: number): {
    display: "none" | "block";
    background?: string;
    mixBlendMode?: "soft-light";
    opacity?: number;
} {
    if (temperature === 0) {
        return {display: "none"};
    }
    return {
        display: "block",
        background: temperature > 0 ? "#ff8c4b" : "#4b8cff",
        mixBlendMode: "soft-light",
        opacity: Math.min(0.5, Math.abs(temperature) / 200),
    };
}

export function isCameraLookMessage(raw: unknown): raw is CameraLook & {type: string} {
    if (!isRecord(raw) || raw.type !== CAMERA_LOOK_MESSAGE_TYPE) {
        return false;
    }
    return true;
}

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
