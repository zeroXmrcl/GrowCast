import path from "node:path";

/** Grow JSON and mesh plugin files. Override with GROWCAST_DATA_DIR (tests, custom mounts). */
export function growcastDataDir(): string {
    const override = process.env.GROWCAST_DATA_DIR?.trim();
    return override ? path.resolve(override) : path.join(process.cwd(), "data");
}
