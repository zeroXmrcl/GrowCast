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
  setupText: string;
  growingMedium: string;
  potSizeLiters: number;
};

export type GrowStatus = {
  health: string;
  estimatedHarvestDate: string;
  notes: string;
};

export type Climate = {
  temperature: number;
  humidity: number;
}

export type Socials = {
  youtube: string;
  twitter: string;
  instagram: string;
  growDiaries: string;
  discordInvite: string;
  customWebsite: string;
};

export type GrowRecord = {
  id: string;
  name: string;
  showGrowName: boolean;
  plant: string;
  plantAmount: number;
  streamUrl: string;
  details: GrowDetails;
  growSetup: GrowSetup;
  status: GrowStatus;
  socials: Socials;
  climate: Climate;
};

export type GrowUpdateInput = {
  name: string;
  showGrowName?: boolean;
  plant: string;
  plantAmount?: number;
  streamUrl: string;
  details?: Partial<Omit<GrowDetails, "updatedAt">>;
  growSetup?: Partial<GrowSetup>;
  status?: Partial<GrowStatus>;
  socials?: Partial<Socials>;
  climate?: Partial<Climate>;
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

function normalizeSeededAt(value: string, fallback: string): string {
  return parseDateOnly(value) ? value : fallback;
}

function readNestedString<T extends string>(
  root: Record<string, unknown>,
  nested: Record<string, unknown>,
  key: T,
  fallback: string,
): string {
  return asString(nested[key], asString(root[key], fallback));
}

function mergeDefined<T extends Record<string, unknown>>(current: T, updates?: Partial<T>): T {
  if (!updates) {
    return current;
  }

  const next = { ...current } as T;
  for (const [key, value] of Object.entries(updates) as Array<[keyof T, T[keyof T] | undefined]>) {
    if (value !== undefined) {
      next[key] = value;
    }
  }

  return next;
}

function mergeGrowDetails(
  current: GrowDetails,
  updates?: GrowUpdateInput["details"],
): GrowDetails {
  const next = mergeDefined(current, updates);

  return {
    ...next,
    seededAt: normalizeSeededAt(next.seededAt, current.seededAt),
    updatedAt: new Date().toISOString(),
  };
}

async function saveCurrentGrow(record: GrowRecord): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(record, null, 2), "utf8");
}

const DEFAULT_GROW: GrowRecord = {
  id: "grow-001",
  name: "My First Tomato Grow",
  showGrowName: false,
  plant: "Tomatoes",
  plantAmount: 3,
  streamUrl: "",

  details: {
    strain: "Cherry Tomato",
    stage: "Vegetative",
    seededAt: "2026-03-01",
    lightSchedule: "16/8",
    updatedAt: "2026-03-30T21:58:00Z",
    notes: "First attempt growing tomatoes – hoping for a good harvest!",
  },

  growSetup: {
    setupText: "Indoor on a windowsill",
    growingMedium: "Soil",
    potSizeLiters: 10,
  },

  status: {
    health: "Healthy",
    estimatedHarvestDate: "2026-06-15",
    notes: "Growing steadily so far",
  },

  climate: {
    temperature: 25,
    humidity: 60,
  },

  socials: {
    youtube: "",
    twitter: "",
    instagram: "",
    growDiaries: "",
    discordInvite: "",
    customWebsite: "",
  },
};

function normalizeGrowRecord(raw: unknown): GrowRecord {
  const parsed = (raw ?? {}) as Record<string, unknown>;
  const rawDetails = (parsed.details ?? {}) as Record<string, unknown>;
  const rawSetup = (parsed.growSetup ?? {}) as Record<string, unknown>;
  const rawStatus = (parsed.status ?? {}) as Record<string, unknown>;
  const rawClimate = (parsed.climate ?? {}) as Record<string, unknown>;
  const rawSettings = (parsed.socials ?? parsed.otherSettings ?? {}) as Record<string, unknown>;

  const details: GrowDetails = {
    strain: readNestedString(parsed, rawDetails, "strain", DEFAULT_GROW.details.strain),
    stage: readNestedString(parsed, rawDetails, "stage", DEFAULT_GROW.details.stage),
    seededAt: normalizeSeededAt(
      readNestedString(parsed, rawDetails, "seededAt", DEFAULT_GROW.details.seededAt),
      DEFAULT_GROW.details.seededAt,
    ),
    lightSchedule: readNestedString(parsed, rawDetails, "lightSchedule", DEFAULT_GROW.details.lightSchedule),
    updatedAt: readNestedString(parsed, rawDetails, "updatedAt", DEFAULT_GROW.details.updatedAt),
    notes: readNestedString(parsed, rawDetails, "notes", DEFAULT_GROW.details.notes),
  };

  const growSetup: GrowSetup = {
    setupText: asString(rawSetup.setupText, DEFAULT_GROW.growSetup.setupText),
    growingMedium: asString(rawSetup.growingMedium, DEFAULT_GROW.growSetup.growingMedium),
    potSizeLiters: asNumber(rawSetup.potSizeLiters, DEFAULT_GROW.growSetup.potSizeLiters),
  };

  const status: GrowStatus = {
    health: asString(rawStatus.health, DEFAULT_GROW.status.health),
    estimatedHarvestDate: asString(rawStatus.estimatedHarvestDate, DEFAULT_GROW.status.estimatedHarvestDate),
    notes: asString(rawStatus.notes, DEFAULT_GROW.status.notes),
  };

  const climate: Climate = {
    temperature: asNumber(rawClimate.temperature, DEFAULT_GROW.climate.temperature),
    humidity: asNumber(rawClimate.humidity, DEFAULT_GROW.climate.humidity),
  }

  const socials: Socials = {
    youtube: asString(rawSettings.youtube, DEFAULT_GROW.socials.youtube),
    twitter: asString(rawSettings.twitter, DEFAULT_GROW.socials.twitter),
    instagram: asString(rawSettings.instagram, DEFAULT_GROW.socials.instagram),
    growDiaries: asString(rawSettings.growDiaries, DEFAULT_GROW.socials.growDiaries),
    discordInvite: asString(rawSettings.discordInvite, DEFAULT_GROW.socials.discordInvite),
    customWebsite: asString(rawSettings.customWebsite, DEFAULT_GROW.socials.customWebsite),
  };

  return {
    id: asString(parsed.id, DEFAULT_GROW.id),
    name: asString(parsed.name, DEFAULT_GROW.name),
    showGrowName: asBoolean(parsed.showGrowName, DEFAULT_GROW.showGrowName),
    plant: asString(parsed.plant, DEFAULT_GROW.plant),
    plantAmount: asNumber(parsed.plantAmount, DEFAULT_GROW.plantAmount),
    streamUrl: asString(parsed.streamUrl, DEFAULT_GROW.streamUrl),
    details,
    climate,
    socials: socials,
    growSetup,
    status,
  };
}

async function ensureDataFile(): Promise<void> {
  try {
    await readFile(DATA_FILE, "utf8");
  } catch {
    await saveCurrentGrow(DEFAULT_GROW);
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

  const nextGrow: GrowRecord = {
    ...current,
    name: input.name,
    showGrowName: typeof input.showGrowName === "boolean" ? input.showGrowName : current.showGrowName,
    plant: input.plant,
    plantAmount: Number.isFinite(input.plantAmount) ? Number(input.plantAmount) : current.plantAmount,
    streamUrl: input.streamUrl,
    growSetup: mergeDefined(current.growSetup, input.growSetup),
    status: mergeDefined(current.status, input.status),
    socials: mergeDefined(current.socials, input.socials),
    details: mergeGrowDetails(current.details, input.details),
    climate: mergeDefined(current.climate, input.climate),
  };

  await saveCurrentGrow(nextGrow);

  return nextGrow;
}
