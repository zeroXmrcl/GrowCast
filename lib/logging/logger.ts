import pino, { type Logger, type LoggerOptions } from "pino";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

function buildPinoOptions(): LoggerOptions {
  const level = resolveLogLevel();
  const environment = resolveEnvironment();
  const pretty =
    !isProductionEnv(environment) &&
    (process.env.LOG_PRETTY === "1" || process.env.LOG_PRETTY === "true");

  const options: LoggerOptions = {
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

  if (pretty) {
    options.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    };
  }

  return options;
}

let rootLogger: Logger | undefined;
let securityLogger: Logger | undefined;

export function getLogger(): Logger {
  if (!rootLogger) {
    rootLogger = pino(buildPinoOptions());
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
