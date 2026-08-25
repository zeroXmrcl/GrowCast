import { readFile } from "node:fs/promises";
import path from "node:path";
import {asBoolean, asNumber, asString, isRecord} from "@/lib/coerce";
import {atomicWriteFile} from "@/lib/atomic-file";
import {growcastDataDir} from "@/lib/data-paths";
import {isDateOnly} from "@/lib/date-only";
import {DEFAULT_OVERLAY_LAYOUT, parseOverlayLayout, type OverlayLayout} from "@/lib/overlay-layout";
import {DEFAULT_OVERLAY_STREAM, parseOverlayStream, type OverlayStream} from "@/lib/overlay-stream";
import {DEFAULT_OVERLAY_SCALE_PCT, parseOverlayScalePct} from "@/lib/overlay-scale";

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
  temperatureDay: number;
  temperatureNight: number;
  humidityDay: number;
  humidityNight: number;
};

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
  showSettingsLink: boolean;
  plant: string;
  plantAmount: number;
  streamUrl: string;
  details: GrowDetails;
  growSetup: GrowSetup;
  status: GrowStatus;
  socials: Socials;
  climate: Climate;
  overlayLayout: OverlayLayout;
  overlayStream: OverlayStream;
  overlayScalePct: number;
};

export type GrowUpdateInput = {
  name: string;
  showGrowName?: boolean;
  showSettingsLink?: boolean;
  plant: string;
  plantAmount?: number;
  streamUrl: string;
  details?: Partial<Omit<GrowDetails, "updatedAt">>;
  growSetup?: Partial<GrowSetup>;
  status?: Partial<GrowStatus>;
  socials?: Partial<Socials>;
  climate?: Partial<Climate>;
  overlayLayout?: OverlayLayout;
  overlayStream?: OverlayStream;
  overlayScalePct?: number;
};

function dataDir(): string {
  return growcastDataDir();
}

function dataFile(): string {
  return path.join(dataDir(), "current-grow.json");
}

function normalizeSeededAt(value: string, fallback: string): string {
  return isDateOnly(value) ? value : fallback;
}

/**
 * One-shot shape migration: promote legacy otherSettings → socials.
 * Current schema only: nested details/growSetup/status/climate/socials.
 */
function migrateGrowRaw(raw: unknown): Record<string, unknown> {
  const parsed = isRecord(raw) ? {...raw} : {};

  if (!isRecord(parsed.socials) && isRecord(parsed.otherSettings)) {
    parsed.socials = parsed.otherSettings;
  }

  delete parsed.otherSettings;
  return parsed;
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
  await atomicWriteFile(dataFile(), JSON.stringify(record, null, 2));
}

/** First-run / missing-field fallback. Not demo copy. */
export const EMPTY_GROW: GrowRecord = {
  id: "grow-001",
  name: "",
  showGrowName: false,
  showSettingsLink: false,
  plant: "",
  plantAmount: 0,
  streamUrl: "",

  details: {
    strain: "",
    stage: "",
    seededAt: "",
    lightSchedule: "",
    updatedAt: "",
    notes: "",
  },

  growSetup: {
    setupText: "",
    growingMedium: "",
    potSizeLiters: 0,
  },

  status: {
    health: "",
    estimatedHarvestDate: "",
    notes: "",
  },

  climate: {
    temperatureDay: 0,
    temperatureNight: 0,
    humidityDay: 0,
    humidityNight: 0,
  },

  socials: {
    youtube: "",
    twitter: "",
    instagram: "",
    growDiaries: "",
    discordInvite: "",
    customWebsite: "",
  },

  overlayLayout: DEFAULT_OVERLAY_LAYOUT,
  overlayStream: DEFAULT_OVERLAY_STREAM,
  overlayScalePct: DEFAULT_OVERLAY_SCALE_PCT,
};

export function normalizeGrowRecord(raw: unknown): GrowRecord {
  const parsed = migrateGrowRaw(raw);
  const rawDetails = isRecord(parsed.details) ? parsed.details : {};
  const rawSetup = isRecord(parsed.growSetup) ? parsed.growSetup : {};
  const rawStatus = isRecord(parsed.status) ? parsed.status : {};
  const rawClimate = isRecord(parsed.climate) ? parsed.climate : {};
  const rawSocials = isRecord(parsed.socials) ? parsed.socials : {};

  const details: GrowDetails = {
    strain: asString(rawDetails.strain, EMPTY_GROW.details.strain),
    stage: asString(rawDetails.stage, EMPTY_GROW.details.stage),
    seededAt: normalizeSeededAt(
      asString(rawDetails.seededAt, EMPTY_GROW.details.seededAt),
      EMPTY_GROW.details.seededAt,
    ),
    lightSchedule: asString(rawDetails.lightSchedule, EMPTY_GROW.details.lightSchedule),
    updatedAt: asString(rawDetails.updatedAt, EMPTY_GROW.details.updatedAt),
    notes: asString(rawDetails.notes, EMPTY_GROW.details.notes),
  };

  const growSetup: GrowSetup = {
    setupText: asString(rawSetup.setupText, EMPTY_GROW.growSetup.setupText),
    growingMedium: asString(rawSetup.growingMedium, EMPTY_GROW.growSetup.growingMedium),
    potSizeLiters: asNumber(rawSetup.potSizeLiters, EMPTY_GROW.growSetup.potSizeLiters),
  };

  const status: GrowStatus = {
    health: asString(rawStatus.health, EMPTY_GROW.status.health),
    estimatedHarvestDate: asString(rawStatus.estimatedHarvestDate, EMPTY_GROW.status.estimatedHarvestDate),
    notes: asString(rawStatus.notes, EMPTY_GROW.status.notes),
  };

  const climate: Climate = {
    temperatureDay: asNumber(rawClimate.temperatureDay, EMPTY_GROW.climate.temperatureDay),
    temperatureNight: asNumber(rawClimate.temperatureNight, EMPTY_GROW.climate.temperatureNight),
    humidityDay: asNumber(rawClimate.humidityDay, EMPTY_GROW.climate.humidityDay),
    humidityNight: asNumber(rawClimate.humidityNight, EMPTY_GROW.climate.humidityNight),
  };

  const socials: Socials = {
    youtube: asString(rawSocials.youtube, EMPTY_GROW.socials.youtube),
    twitter: asString(rawSocials.twitter, EMPTY_GROW.socials.twitter),
    instagram: asString(rawSocials.instagram, EMPTY_GROW.socials.instagram),
    growDiaries: asString(rawSocials.growDiaries, EMPTY_GROW.socials.growDiaries),
    discordInvite: asString(rawSocials.discordInvite, EMPTY_GROW.socials.discordInvite),
    customWebsite: asString(rawSocials.customWebsite, EMPTY_GROW.socials.customWebsite),
  };

  return {
    id: asString(parsed.id, EMPTY_GROW.id),
    name: asString(parsed.name, EMPTY_GROW.name),
    showGrowName: asBoolean(parsed.showGrowName, EMPTY_GROW.showGrowName),
    showSettingsLink: asBoolean(parsed.showSettingsLink, EMPTY_GROW.showSettingsLink),
    plant: asString(parsed.plant, EMPTY_GROW.plant),
    plantAmount: asNumber(parsed.plantAmount, EMPTY_GROW.plantAmount),
    streamUrl: asString(parsed.streamUrl, EMPTY_GROW.streamUrl),
    details,
    climate,
    socials,
    growSetup,
    status,
    overlayLayout: parseOverlayLayout(parsed.overlayLayout),
    overlayStream: parseOverlayStream(parsed.overlayStream),
    overlayScalePct: parseOverlayScalePct(parsed.overlayScalePct),
  };
}

export async function getCurrentGrow(): Promise<GrowRecord> {
  try {
    const content = await readFile(dataFile(), "utf8");
    return normalizeGrowRecord(JSON.parse(content));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await saveCurrentGrow(EMPTY_GROW);
      return EMPTY_GROW;
    }
    throw error;
  }
}

/**
 * Overwrite the current grow with a full record, bypassing merge logic.
 * Used by the archive flow to reset the grow for a fresh run.
 */
export async function replaceCurrentGrow(record: GrowRecord): Promise<void> {
  await saveCurrentGrow(record);
}

export async function updateCurrentGrow(input: GrowUpdateInput): Promise<GrowRecord> {
  const current = await getCurrentGrow();

  const nextGrow: GrowRecord = {
    ...current,
    name: input.name,
    showGrowName: typeof input.showGrowName === "boolean" ? input.showGrowName : current.showGrowName,
    showSettingsLink:
      typeof input.showSettingsLink === "boolean" ? input.showSettingsLink : current.showSettingsLink,
    plant: input.plant,
    plantAmount: Number.isFinite(input.plantAmount) ? Number(input.plantAmount) : current.plantAmount,
    streamUrl: input.streamUrl,
    growSetup: mergeDefined(current.growSetup, input.growSetup),
    status: mergeDefined(current.status, input.status),
    socials: mergeDefined(current.socials, input.socials),
    details: mergeGrowDetails(current.details, input.details),
    climate: mergeDefined(current.climate, input.climate),
    overlayLayout: parseOverlayLayout(
      input.overlayLayout !== undefined ? input.overlayLayout : current.overlayLayout,
    ),
    overlayStream: parseOverlayStream(
      input.overlayStream !== undefined ? input.overlayStream : current.overlayStream,
    ),
    overlayScalePct: parseOverlayScalePct(
      input.overlayScalePct !== undefined ? input.overlayScalePct : current.overlayScalePct,
    ),
  };

  await saveCurrentGrow(nextGrow);

  return nextGrow;
}
