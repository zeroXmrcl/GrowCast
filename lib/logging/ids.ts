import { randomBytes, randomUUID } from "node:crypto";

const REQUEST_ID_MAX_LEN = 128;
const REQUEST_ID_MIN_LEN = 8;
const REQUEST_ID_CHARSET = /^[A-Za-z0-9._-]+$/;

const TRACE_ID_HEX = /^[0-9a-f]{32}$/i;
const SPAN_ID_HEX = /^[0-9a-f]{16}$/i;

export function generateRequestId(): string {
  return randomUUID();
}

export function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

export function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}

export function isValidRequestId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < REQUEST_ID_MIN_LEN || trimmed.length > REQUEST_ID_MAX_LEN) {
    return false;
  }
  return REQUEST_ID_CHARSET.test(trimmed);
}

export function isValidTraceId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return TRACE_ID_HEX.test(value.trim());
}

export function isValidSpanId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return SPAN_ID_HEX.test(value.trim());
}
