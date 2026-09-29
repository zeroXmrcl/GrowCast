import {chmod, mkdir, writeFile} from "node:fs/promises";
import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {atomicWriteFile} from "@/lib/atomic-file";
import {growcastDataDir} from "@/lib/data-paths";
import type {SpiderFarmerController} from "@/lib/spider-farmer-login";

export type StoredAdminAccount = {
    username: string;
    passwordHash: string;
    sessionSecret: string;
};

function setupDir(): string {
    return path.join(growcastDataDir(), "setup");
}

export function adminAccountPath(): string {
    return path.join(setupDir(), "admin.json");
}

export function setupCompletePath(): string {
    return path.join(setupDir(), "complete");
}

export function controllerListPath(): string {
    return path.join(setupDir(), "controllers.json");
}

export function readStoredAdminAccount(): StoredAdminAccount | null {
    try {
        const parsed = JSON.parse(readFileSync(adminAccountPath(), "utf8")) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return null;
        }
        const record = parsed as Record<string, unknown>;
        const username = typeof record.username === "string" ? record.username : "";
        const passwordHash = typeof record.passwordHash === "string" ? record.passwordHash : "";
        const sessionSecret = typeof record.sessionSecret === "string" ? record.sessionSecret : "";
        if (!username || !passwordHash || !sessionSecret) {
            return null;
        }
        return {username, passwordHash, sessionSecret};
    } catch {
        return null;
    }
}

export async function writeStoredAdminAccount(account: StoredAdminAccount): Promise<void> {
    const file = adminAccountPath();
    await atomicWriteFile(file, `${JSON.stringify(account)}\n`);
    await chmod(file, 0o600).catch(() => undefined);
}

export function isSetupComplete(): boolean {
    return existsSync(setupCompletePath());
}

export async function markSetupComplete(): Promise<void> {
    const file = setupCompletePath();
    await mkdir(path.dirname(file), {recursive: true});
    await writeFile(file, "ok\n", {encoding: "utf8", mode: 0o600});
}

export function readStoredControllers(): SpiderFarmerController[] {
    try {
        const parsed = JSON.parse(readFileSync(controllerListPath(), "utf8")) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.flatMap((item) => {
            if (!item || typeof item !== "object") {
                return [];
            }
            const record = item as Record<string, unknown>;
            const serial = typeof record.serial === "string" ? record.serial : "";
            const name = typeof record.name === "string" ? record.name : serial;
            const prefix = record.prefix === "LC" || record.prefix === "PS" || record.prefix === "CB"
                ? record.prefix
                : "CB";
            const productType = typeof record.productType === "string" ? record.productType : "";
            if (!serial) {
                return [];
            }
            return [{serial, name, prefix, productType}];
        });
    } catch {
        return [];
    }
}

export async function writeStoredControllers(controllers: SpiderFarmerController[]): Promise<void> {
    const file = controllerListPath();
    await atomicWriteFile(file, `${JSON.stringify(controllers)}\n`);
    await chmod(file, 0o600).catch(() => undefined);
}

export async function clearStoredControllers(): Promise<void> {
    const file = controllerListPath();
    await writeFile(file, "[]\n", {encoding: "utf8", mode: 0o600}).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return;
        }
        throw error;
    });
}

function skippedStepsPath(): string {
    return path.join(setupDir(), "skipped.json");
}

export async function readSkippedSteps(): Promise<string[]> {
    try {
        const parsed = JSON.parse(readFileSync(skippedStepsPath(), "utf8")) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }
        return parsed.filter((item): item is string => typeof item === "string");
    } catch {
        return [];
    }
}

export async function writeSkippedStep(step: string): Promise<void> {
    const steps = await readSkippedSteps();
    if (!steps.includes(step)) {
        steps.push(step);
    }
    const file = skippedStepsPath();
    await mkdir(path.dirname(file), {recursive: true});
    await atomicWriteFile(file, `${JSON.stringify(steps)}\n`);
    await chmod(file, 0o600).catch(() => undefined);
}
