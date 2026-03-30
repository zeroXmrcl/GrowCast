import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type GrowDetails = {
  strain: string;
  stage: string;
  seededAt: string;
  lightSchedule: string;
  updatedAt: string;
  notes: string;
};

export type GrowSetup = {
  growTentSize: string;
  lightingType: string;
  lightWattage: number;
  lightBrand: string;
  ventilation: string;
  carbonFilter: boolean;
  growingMedium: string;
  potSizeLiters: number;
};

export type GrowStatus = {
  health: string;
  estimatedHarvestDate: string;
  notes: string;
};

export type GrowUpdate = {
  id: string;
  date: string;
  title: string;
  description: string;
  imageUrl: string;
  likes: number;
};

export type GrowRecord = {
  id: string;
  name: string;
  plant: string;
  plantAmount: number;
  streamUrl: string;
  details: GrowDetails;
  growSetup: GrowSetup;
  status: GrowStatus;
  updates: GrowUpdate[];

  // Backward-compatible flattened fields used by current dashboard/admin bindings.
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
  plantAmount?: number;
  streamUrl: string;
  strain?: string;
  stage?: string;
  seededAt?: string;
  lightSchedule?: string;
  notes?: string;
  growSetup?: Partial<GrowSetup>;
  status?: Partial<GrowStatus>;
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

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

const DEFAULT_GROW: GrowRecord = {
  id: "grow-001",
  name: "First Grow!",
  plant: "Cannabis",
  plantAmount: 1,
  streamUrl: "https://www.youtube.com/embed/Q6xRHQswS38",

  details: {
    strain: "CBD Cure",
    stage: "flowering",
    seededAt: "2026-03-01",
    lightSchedule: "12/12",
    updatedAt: "2026-03-30T21:58:00Z",
    notes: "This is my first grow, I'm excited to see how it turns out!",
  },

  growSetup: {
    growTentSize: "",
    lightingType: "",
    lightWattage: 0,
    lightBrand: "",
    ventilation: "",
    carbonFilter: false,
    growingMedium: "",
    potSizeLiters: 0,
  },

  status: {
    health: "healthy",
    estimatedHarvestDate: "",
    notes: "",
  },

  updates: [
    {
      id: "update-001",
      date: "2026-03-15",
      title: "Switched to flowering",
      description: "Changed light cycle to 12/12",
      imageUrl: "",
      likes: 0,
    },
  ],

  strain: "CBD Cure",
  stage: "flowering",
  seededAt: "2026-03-01",
  lightSchedule: "12/12",
  updatedAt: "2026-03-30T21:58:00Z",
  notes: "This is my first grow, I'm excited to see how it turns out!",
};

function normalizeGrowRecord(raw: unknown): GrowRecord {
  const parsed = (raw ?? {}) as Record<string, unknown>;
  const rawDetails = (parsed.details ?? {}) as Record<string, unknown>;
  const rawSetup = (parsed.growSetup ?? {}) as Record<string, unknown>;
  const rawStatus = (parsed.status ?? {}) as Record<string, unknown>;

  const seededAtCandidate = asString(rawDetails.seededAt, asString(parsed.seededAt, DEFAULT_GROW.details.seededAt));
  const seededAt = parseDateOnly(seededAtCandidate) ? seededAtCandidate : DEFAULT_GROW.details.seededAt;

  const details: GrowDetails = {
    strain: asString(rawDetails.strain, asString(parsed.strain, DEFAULT_GROW.details.strain)),
    stage: asString(rawDetails.stage, asString(parsed.stage, DEFAULT_GROW.details.stage)),
    seededAt,
    lightSchedule: asString(rawDetails.lightSchedule, asString(parsed.lightSchedule, DEFAULT_GROW.details.lightSchedule)),
    updatedAt: asString(rawDetails.updatedAt, asString(parsed.updatedAt, DEFAULT_GROW.details.updatedAt)),
    notes: asString(rawDetails.notes, asString(parsed.notes, DEFAULT_GROW.details.notes)),
  };

  const growSetup: GrowSetup = {
    growTentSize: asString(rawSetup.growTentSize, DEFAULT_GROW.growSetup.growTentSize),
    lightingType: asString(rawSetup.lightingType, DEFAULT_GROW.growSetup.lightingType),
    lightWattage: asNumber(rawSetup.lightWattage, DEFAULT_GROW.growSetup.lightWattage),
    lightBrand: asString(rawSetup.lightBrand, DEFAULT_GROW.growSetup.lightBrand),
    ventilation: asString(rawSetup.ventilation, DEFAULT_GROW.growSetup.ventilation),
    carbonFilter: asBoolean(rawSetup.carbonFilter, DEFAULT_GROW.growSetup.carbonFilter),
    growingMedium: asString(rawSetup.growingMedium, DEFAULT_GROW.growSetup.growingMedium),
    potSizeLiters: asNumber(rawSetup.potSizeLiters, DEFAULT_GROW.growSetup.potSizeLiters),
  };

  const status: GrowStatus = {
    health: asString(rawStatus.health, DEFAULT_GROW.status.health),
    estimatedHarvestDate: asString(rawStatus.estimatedHarvestDate, DEFAULT_GROW.status.estimatedHarvestDate),
    notes: asString(rawStatus.notes, DEFAULT_GROW.status.notes),
  };

  const updates = Array.isArray(parsed.updates)
    ? parsed.updates.map((item, index) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return {
          id: asString(row.id, `update-${index + 1}`),
          date: asString(row.date, ""),
          title: asString(row.title, ""),
          description: asString(row.description, ""),
          imageUrl: asString(row.imageUrl, ""),
          likes: asNumber(row.likes, 0),
        } satisfies GrowUpdate;
      })
    : DEFAULT_GROW.updates;

  return {
    id: asString(parsed.id, DEFAULT_GROW.id),
    name: asString(parsed.name, DEFAULT_GROW.name),
    plant: asString(parsed.plant, DEFAULT_GROW.plant),
    plantAmount: asNumber(parsed.plantAmount, DEFAULT_GROW.plantAmount),
    streamUrl: asString(parsed.streamUrl, DEFAULT_GROW.streamUrl),
    details,
    growSetup,
    status,
    updates,
    strain: details.strain,
    stage: details.stage,
    seededAt: details.seededAt,
    lightSchedule: details.lightSchedule,
    updatedAt: details.updatedAt,
    notes: details.notes,
  };
}

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
    return normalizeGrowRecord(JSON.parse(content));
  } catch {
    return DEFAULT_GROW;
  }
}

export async function updateCurrentGrow(input: GrowUpdateInput): Promise<GrowRecord> {
  const current = await getCurrentGrow();

  const seededAt =
    typeof input.seededAt === "string" && parseDateOnly(input.seededAt)
      ? input.seededAt
      : current.details.seededAt;

  const details: GrowDetails = {
    ...current.details,
    strain: input.strain ?? current.details.strain,
    stage: input.stage ?? current.details.stage,
    seededAt,
    lightSchedule: input.lightSchedule ?? current.details.lightSchedule,
    notes: input.notes ?? current.details.notes,
    updatedAt: new Date().toISOString(),
  };

  const nextGrow: GrowRecord = {
    ...current,
    name: input.name,
    plant: input.plant,
    plantAmount: Number.isFinite(input.plantAmount) ? Number(input.plantAmount) : current.plantAmount,
    streamUrl: input.streamUrl,
    growSetup: {
      ...current.growSetup,
      ...(input.growSetup ?? {}),
    },
    status: {
      ...current.status,
      ...(input.status ?? {}),
    },
    details,
    strain: details.strain,
    stage: details.stage,
    seededAt: details.seededAt,
    lightSchedule: details.lightSchedule,
    updatedAt: details.updatedAt,
    notes: details.notes,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(nextGrow, null, 2), "utf8");

  return nextGrow;
}
