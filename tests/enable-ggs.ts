import {enablePlugin} from "../lib/plugins/registry.ts";

export async function enableGgsForTests(): Promise<void> {
    await enablePlugin("growcast.ggs");
}
