import pino, { type Logger, type LoggerOptions } from "pino";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import { REDACT_PATHS } from "./redact";
import type { LogBindings, LogLevel, SecurityEventName } from "./types";
import { getContextOrEmpty } from "./context";

const LOG_LEVELS: readonly LogLevel[] = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

const LEVEL_ORDER: Record<LogLevel, number> = {
  silent: 0,
  fatal: 1,
  error: 2,
  warn: 3,
  info: 4,
  debug: 5,
  trace: 6,
};

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

function readPackageVersion(): string {
  try {
    const pkgPath = join(process.cwd(), "package.json");
    const raw = readFileSync(pkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // ignore
  }
  return "0.0.0";
}

function resolveEnvironment(): string {
  return (
    process.env.GROWCAST_ENV ||
    process.env.NODE_ENV ||
    "development"
  );
}

function isProductionEnv(env: string): boolean {
  return env === "production" || env === "prod";
}

export function resolveLogLevel(
  env: NodeJS.ProcessEnv = process.env,
): LogLevel {
  const environment = env.GROWCAST_ENV || env.NODE_ENV || "development";
  const raw = (env.LOG_LEVEL || "").toLowerCase().trim();
  let level: LogLevel = isLogLevel(raw)
    ? raw
    : isProductionEnv(environment)
      ? "info"
      : "debug";

  if (isProductionEnv(environment) && LEVEL_ORDER[level] < LEVEL_ORDER.info) {
    level = "info";
  }

  return level;
}

function buildBaseBindings(): LogBindings {
  return {
    service: "growcast",
    version: readPackageVersion(),
    environment: resolveEnvironment(),
  };
}

const HUMAN_SKIP = new Set([
  "time",
  "level",
  "event",
  "msg",
  "pid",
  "hostname",
  "service",
  "version",
  "environment",
  "channel",
]);

function wantsJsonLogs(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.LOG_FORMAT ?? "").trim().toLowerCase() === "json";
}

function formatLogValue(value: unknown): string {
  if (typeof value === "string") {
    return value.includes(" ") ? JSON.stringify(value) : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** One pino JSON line as `time level event  key=value`. */
export function formatHumanLogLine(raw: string): string {
  const text = raw.trim();
  if (!text) {
    return "";
  }
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
  const time = typeof record.time === "string"
    ? record.time.replace("T", " ").replace(/\.\d+Z$/, "").replace("Z", "")
    : "";
  const level = typeof record.level === "string" ? record.level : "info";
  const event = typeof record.event === "string"
    ? record.event
    : typeof record.msg === "string"
      ? record.msg
      : "";
  const details: string[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (HUMAN_SKIP.has(key) || value == null || value === "") {
      continue;
    }
    details.push(`${key}=${formatLogValue(value)}`);
  }
  const head = [time, level, event].filter((part) => part.length > 0).join(" ");
  return details.length > 0 ? `${head}  ${details.join(" ")}` : head;
}

function humanDestination(): Writable {
  let pending = "";
  return new Writable({
    write(chunk, _encoding, callback) {
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        const formatted = formatHumanLogLine(line);
        if (formatted) {
          process.stdout.write(`${formatted}\n`);
        }
      }
      callback();
    },
  });
}

function buildPinoOptions(): LoggerOptions {
  const level = resolveLogLevel();

  return {
    level,
    base: buildBaseBindings(),
    redact: {
      paths: REDACT_PATHS,
      censor: "[Redacted]",
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

let rootLogger: Logger | undefined;
let securityLogger: Logger | undefined;

export function getLogger(): Logger {
  if (!rootLogger) {
    rootLogger = wantsJsonLogs()
      ? pino(buildPinoOptions())
      : pino(buildPinoOptions(), humanDestination());
  }
  return rootLogger;
}

export function getSecurityLogger(): Logger {
  if (!securityLogger) {
    const root = getLogger();
    securityLogger = root.child(
      { channel: "security" },
      { level: "info" },
    );
  }
  return securityLogger;
}

export function childLogger(bindings: LogBindings = {}): Logger {
  const ctx = getContextOrEmpty();
  return getLogger().child({
    request_id: ctx.request_id,
    trace_id: ctx.trace_id,
    span_id: ctx.span_id,
    ...bindings,
  });
}

export function buildSecurityEventPayload(
  event: SecurityEventName,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  const ctx = getContextOrEmpty();
  return {
    event,
    request_id: ctx.request_id,
    trace_id: ctx.trace_id,
    span_id: ctx.span_id,
    client_ip: ctx.client_ip,
    user_agent: ctx.user_agent,
    method: ctx.method,
    path: ctx.path,
    route: ctx.route,
    ...fields,
  };
}

export function logSecurityEvent(
  event: SecurityEventName,
  fields: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
): void {
  const payload = buildSecurityEventPayload(event, fields);

  const log = getSecurityLogger();
  if (level === "error") {
    log.error(payload);
  } else if (level === "warn") {
    log.warn(payload);
  } else {
    log.info(payload);
  }
}

export function _resetLoggerForTests(): void {
  rootLogger = undefined;
  securityLogger = undefined;
}
