import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type GrowRecord = {
  id: string;
  name: string;
  plant: string;
  streamUrl: string;
  strain: string;
  stage: string;
  seededAt: string;
  lightSchedule: string;
  updatedAt: string;
  notes: string;
};

export type GrowUpdateInput = {
  name: string;
  plant: string;
  streamUrl: string;
  strain: string;
  stage: string;
  seededAt?: string;
  lightSchedule: string;
  notes: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "current-grow.json");

function parseDateOnly(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }

  return date;
}

const DEFAULT_GROW: GrowRecord = {
  id: "grow-001",
  name: "First Grow!",
  plant: "Tomatoes",
  streamUrl: "",
  strain: "Kitchen Tomatoes",
  stage: "Flowering",
  seededAt: "2026-03-01",
  lightSchedule: "12h/12h",
  updatedAt: "2026-03-30 21:18",
  notes: "This is my first grow in this tent, I'm excited to see how it turns out!",
};

async function ensureDataFile(): Promise<void> {
  try {
    await readFile(DATA_FILE, "utf8");
  } catch {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(DEFAULT_GROW, null, 2), "utf8");
  }
}

export async function getCurrentGrow(): Promise<GrowRecord> {
  await ensureDataFile();

  try {
    const content = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(content) as Partial<GrowRecord>;

    const seededAt =
      typeof parsed.seededAt === "string" && parseDateOnly(parsed.seededAt)
        ? parsed.seededAt
        : DEFAULT_GROW.seededAt;

    return {
      ...DEFAULT_GROW,
      ...parsed,
      seededAt,
    };
  } catch {
    return DEFAULT_GROW;
  }
}

export async function updateCurrentGrow(input: GrowUpdateInput): Promise<GrowRecord> {
  const current = await getCurrentGrow();

  const seededAt =
    typeof input.seededAt === "string" && parseDateOnly(input.seededAt)
      ? input.seededAt
      : current.seededAt;

  const nextGrow: GrowRecord = {
    ...current,
    ...input,
    seededAt,
    updatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(nextGrow, null, 2), "utf8");

  return nextGrow;
}
