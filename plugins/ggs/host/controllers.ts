import {chmod, writeFile} from "node:fs/promises";
import {readFileSync} from "node:fs";
import path from "node:path";
import {atomicWriteFile} from "@/lib/atomic-file";
import {growcastDataDir} from "@/lib/data-paths";
import type {SpiderFarmerController} from "@/plugins/ggs/host/spider-farmer-login";

export function controllerListPath(): string {
    return path.join(growcastDataDir(), "setup", "controllers.json");
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
