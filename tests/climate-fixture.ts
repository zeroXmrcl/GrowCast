import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import type {ClimatePoint} from "../lib/ai-summary/climate.ts";
import {pluginDataDir} from "../lib/plugins/paths.ts";

export async function writeClimateDay(input: {date: string; points: ClimatePoint[]}): Promise<void> {
    const dir = path.join(pluginDataDir("growcast.ggs"), "climate", "current");
    await mkdir(dir, {recursive: true});
    await writeFile(
        path.join(dir, `${input.date}.json`),
        JSON.stringify({date: input.date, points: input.points}),
    );
}
