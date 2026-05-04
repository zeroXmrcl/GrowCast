import fs from "fs";
import path from "path";

export default function getSetupImages() {
    const dir = path.join(process.cwd(), "public/setup");

    if (!fs.existsSync(dir)) return [];

    const files = fs.readdirSync(dir);

    return files
        .filter((file) =>
            [".jpg", ".jpeg", ".png", ".webp"].includes(
                path.extname(file).toLowerCase()
            )
        )
        .sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
        )
        .map((file) => `/setup/${file}`);
}