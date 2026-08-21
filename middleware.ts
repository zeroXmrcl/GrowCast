import { NextResponse, type NextRequest } from "next/server";

const REQUEST_ID_MIN_LEN = 8;
const REQUEST_ID_MAX_LEN = 128;
const REQUEST_ID_CHARSET = /^[A-Za-z0-9._-]+$/;

function isValidRequestId(value: string | null): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length < REQUEST_ID_MIN_LEN || trimmed.length > REQUEST_ID_MAX_LEN) {
    return false;
  }
  return REQUEST_ID_CHARSET.test(trimmed);
}

function generateRequestId(): string {
  return crypto.randomUUID();
}

function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function middleware(request: NextRequest) {
  const incoming = request.headers.get("x-request-id");
  const requestId = isValidRequestId(incoming)
    ? incoming.trim()
    : generateRequestId();

  const traceId = generateTraceId();
  const spanId = generateSpanId();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-trace-id", traceId);
  requestHeaders.set("x-span-id", spanId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("X-Request-ID", requestId);

  return response;
}

export const config = {
  matcher: [
    // Skip /admin so picture-upload POSTs are not body-cloned/truncated by
    // the Next 16 proxy that wraps this middleware file.
    "/((?!_next/static|_next/image|favicon.ico|admin).*)",
  ],
};
