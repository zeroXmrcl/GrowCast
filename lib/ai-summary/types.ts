import type {ClimateMetricKey} from "@/lib/climate/types";

export const AI_SUMMARY_ARCHIVE_VERSION = 1;
export const AI_SUMMARY_JOB_HOUR = 8;
export const AI_SUMMARY_MOSAIC_SLOTS = 24 * 12;
export const AI_SUMMARY_SCORE_DAYS = 30;

export type GrowPhase =
    | "seed"
    | "seedling"
    | "veg"
    | "flower"
    | "late_flower"
    | "harvest"
    | "unknown";

export type StageContext = {
    stageLabel: string;
    phase: GrowPhase;
    daysSinceSeeding: number | null;
    flowerWeek: number | null;
    lightSchedule: string;
    plant: string;
    strain: string;
};

export type MetricStats = {
    count: number;
    min: number | null;
    max: number | null;
    avg: number | null;
    p10: number | null;
    p50: number | null;
    p90: number | null;
    trend: number | null;
};

export type SplitStats = {
    all: MetricStats;
    day: MetricStats;
    night: MetricStats;
};

export type ClimateWindowStats = {
    windowStart: string;
    windowEnd: string;
    pointCount: number;
    dayPointCount: number;
    nightPointCount: number;
    unknownDayPointCount: number;
    lightHours: number | null;
    alarmCount: number;
    metrics: Record<ClimateMetricKey, SplitStats>;
};

export type DerivedRange = {
    min: number;
    max: number;
};

export type MetricVerdict = "in_range" | "slightly_off" | "off" | "unknown";

export type AiMetricJudgment = {
    verdict: MetricVerdict;
    pctInRange: number | null;
    note: string;
};

export type AiSummaryPayload = {
    score: number;
    rating: string;
    headline: string;
    summary: string;
    ranges: Record<ClimateMetricKey, DerivedRange | null>;
    verdicts: Record<ClimateMetricKey, AiMetricJudgment>;
    plantObservation: string;
    recommendations: string[];
    confidence: number;
};

export type MosaicCell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type AiSummaryRecord = {
    date: string;
    generatedAt: string;
    growId: string;
    stage: StageContext;
    stats: ClimateWindowStats;
    ai: AiSummaryPayload;
    mosaic: Record<ClimateMetricKey, string>;
    imageUsed: boolean;
};

export type AiSummaryScorePoint = {
    date: string;
    score: number;
};

export type AiSummaryPublic = {
    date: string;
    generatedAt: string;
    score: number;
    rating: string;
    headline: string;
    summary: string;
    plantObservation: string;
    recommendations: string[];
    confidence: number;
    ranges: Record<ClimateMetricKey, DerivedRange | null>;
    verdicts: Record<ClimateMetricKey, AiMetricJudgment>;
    mosaic: Record<ClimateMetricKey, string>;
    scoreHistory: AiSummaryScorePoint[];
    daysSinceSeeding: number | null;
    stageLabel: string;
    phase: GrowPhase;
    lightHours: number | null;
};

export type SchedulerStatus =
    | "success"
    | "failed"
    | "skipped_no_key"
    | "skipped_exists"
    | "skipped_not_due"
    | "skipped_daily_cap"
    | "skipped_not_leader"
    | "rejected";

export type SchedulerState = {
    lastSuccessDate: string | null;
    lastAttemptDate: string | null;
    lastAttemptAt: string | null;
    lastStatus: SchedulerStatus;
    attemptsOnDate: number;
};

export type GenerateReason =
    | "no_key"
    | "invalid_response"
    | "request_failed"
    | "locked"
    | "daily_cap"
    | "write_failed";

export type GenerateResult =
    | {ok: true; record: AiSummaryRecord; reused: boolean}
    | {ok: false; reason: GenerateReason};

export const AI_SUMMARY_DAILY_API_CAP = 5;
