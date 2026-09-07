import path from "node:path";
import {growcastDataDir} from "@/lib/data-paths";

export function restreamDir(): string {
    return path.join(growcastDataDir(), "restream");
}

export function restreamControlFile(): string {
    return path.join(restreamDir(), "control.json");
}

export function restreamKeyFile(): string {
    return path.join(restreamDir(), "twitch.key");
}

export function restreamCaptureTokenFile(): string {
    return path.join(restreamDir(), "capture.token");
}

export function restreamStatusFile(): string {
    return path.join(restreamDir(), "status.json");
}

export function restreamChannelFile(): string {
    return path.join(restreamDir(), "channel.json");
}

export function restreamAudioFile(): string {
    return path.join(restreamDir(), "audio.json");
}

export function restreamMusicDir(): string {
    return path.join(restreamDir(), "music");
}

export function restreamAlertsFile(): string {
    return path.join(restreamDir(), "alerts.json");
}

export function restreamOAuthFile(): string {
    return path.join(restreamDir(), "twitch-oauth.json");
}

export function restreamEventsubSecretFile(): string {
    return path.join(restreamDir(), "eventsub.secret");
}
