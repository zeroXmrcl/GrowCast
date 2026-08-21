import type { RequestLogContext } from "./types";
import {
  generateRequestId,
  generateSpanId,
  generateTraceId,
  isValidRequestId,
  isValidSpanId,
  isValidTraceId,
} from "./ids";
import { runWithContext } from "./context";
import { childLogger } from "./logger";
import { sanitizeError } from "./redact";

const USER_AGENT_MAX = 256;

function headerGet(
  headers: Headers | Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  if (typeof (headers as Headers).get === "function") {
    const v = (headers as Headers).get(name);
    return v == null || v === "" ? undefined : v;
  }
  const rec = headers as Record<string, string | string[] | undefined>;
  const lower = name.toLowerCase();
  for (const key of Object.keys(rec)) {
    if (key.toLowerCase() === lower) {
      const val = rec[key];
      if (Array.isArray(val)) return val[0];
      if (val != null && val !== "") return val;
    }
  }
  return undefined;
}

export function extractClientIp(
  headers: Headers | Record<string, string | string[] | undefined>,
): string | undefined {
  const cf = headerGet(headers, "cf-connecting-ip");
  if (cf) {
    return cf.trim();
  }

  const xff = headerGet(headers, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headerGet(headers, "x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return undefined;
}

export function extractUserAgent(
  headers: Headers | Record<string, string | string[] | undefined>,
): string | undefined {
  const ua = headerGet(headers, "user-agent");
  if (!ua) return undefined;
  return ua.length > USER_AGENT_MAX ? ua.slice(0, USER_AGENT_MAX) : ua;
}

export function buildContextFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined>,
  routePattern: string,
  method = "GET",
  path?: string,
): RequestLogContext {
  const rawRequestId = headerGet(headers, "x-request-id");
  const rawTraceId = headerGet(headers, "x-trace-id");
  const rawSpanId = headerGet(headers, "x-span-id");

  const request_id =
    rawRequestId && isValidRequestId(rawRequestId)
      ? rawRequestId.trim()
      : generateRequestId();

  const trace_id =
    rawTraceId && isValidTraceId(rawTraceId)
      ? rawTraceId.trim().toLowerCase()
      : generateTraceId();

  const span_id =
    rawSpanId && isValidSpanId(rawSpanId)
      ? rawSpanId.trim().toLowerCase()
      : generateSpanId();

  return {
    request_id,
    trace_id,
    span_id,
    method,
    path: path ?? routePattern,
    route: routePattern,
    client_ip: extractClientIp(headers),
    user_agent: extractUserAgent(headers),
  };
}

function buildContextFromRequest(
  request: Request,
  routePattern: string,
): RequestLogContext {
  let path = "/";
  try {
    path = new URL(request.url).pathname;
  } catch {
    path = "/";
  }

  return buildContextFromHeaders(
    request.headers,
    routePattern,
    request.method,
    path,
  );
}

export async function withRequestLog<T>(
  request: Request,
  routePattern: string,
  handler: () => Promise<T> | T,
): Promise<T> {
  const context = buildContextFromRequest(request, routePattern);
  const started = Date.now();

  return runWithContext(context, async () => {
    const log = childLogger({
      request_id: context.request_id,
      trace_id: context.trace_id,
      span_id: context.span_id,
    });

    try {
      const result = await handler();
      const latency_ms = Date.now() - started;
      const status_code =
        result instanceof Response ? result.status : 200;

      log.info({
        event: "http.request",
        method: context.method,
        path: context.path,
        route: context.route,
        status_code,
        latency_ms,
        client_ip: context.client_ip,
      });

      return result;
    } catch (error) {
      const latency_ms = Date.now() - started;
      const sanitized = sanitizeError(error);

      log.error({
        event: "error.unhandled",
        method: context.method,
        path: context.path,
        route: context.route,
        latency_ms,
        err: sanitized,
      });

      throw error;
    }
  });
}
