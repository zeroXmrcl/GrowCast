/**
 * List plugin series day files whose points have no metric values.
 * Default is a dry run. Pass --apply to delete the listed files.
 * Does not prune by age. Recent empty files stay until you pass --apply.
 *
 *   ./scripts/prune-empty-plugin-series
 *   ./scripts/prune-empty-plugin-series --data-dir ./data
 *   GROWCAST_DATA_DIR=./data ./scripts/prune-empty-plugin-series --apply
 */
import path from "node:path";
import {listEmptyMetricSeriesFiles, removeEmptyMetricSeriesFiles} from "@/lib/plugins/series";

function argValue(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    if (index === -1) {
        return undefined;
    }
    return process.argv[index + 1];
}

async function main(): Promise<void> {
    const apply = process.argv.includes("--apply");
    const dataDir = path.resolve(argValue("--data-dir") ?? process.env.GROWCAST_DATA_DIR ?? path.join(process.cwd(), "data"));
    const files = await listEmptyMetricSeriesFiles(dataDir);
    if (files.length === 0) {
        console.log(`No empty-metric series files under ${dataDir}`);
        return;
    }
    console.log(`${apply ? "Deleting" : "Would delete"} ${files.length} empty-metric series file(s):`);
    for (const file of files) {
        console.log(file);
    }
    if (!apply) {
        console.log("Dry run. Re-run with --apply to delete these files.");
        return;
    }
    await removeEmptyMetricSeriesFiles(files);
    console.log(`Deleted ${files.length} file(s).`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "prune failed");
    process.exit(1);
});
