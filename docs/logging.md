# GrowCast production logging

GrowCast emits **structured JSON logs to stdout** (Pino). In production, logs are always JSON lines — suitable for Docker log drivers, journald, and log aggregators. A pretty (human-readable) transport is available only in non-production when explicitly enabled.

Implementation lives under `lib/logging/`. Edge middleware (`middleware.ts`) is intentionally free of Pino/Node APIs and only handles correlation IDs.

---

## Log line schema

Every record is a single JSON object (one line) with these common fields:

| Field | Type | Description |
| --- | --- | --- |
| `level` | string | Pino level label: `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `time` | string | ISO-8601 timestamp |
| `service` | string | Always `"growcast"` |
| `version` | string | App version from `package.json` |
| `environment` | string | From `GROWCAST_ENV`, else `NODE_ENV`, else `"development"` |
| `event` | string | Stable event name (see [Events](#events)) |
| `channel` | string | Present on security-channel logs (`"security"`) |
| `request_id` | string | Per-request correlation ID |
| `trace_id` | string | 32 lowercase hex (W3C-shaped trace ID) |
| `span_id` | string | 16 lowercase hex (W3C-shaped span ID) |
| `pid` | number | Process ID (Pino default base; may appear depending on transport) |
| `hostname` | string | Hostname (Pino default base; ignored by pretty transport) |

Event-specific fields are added alongside the base schema (e.g. `method`, `path`, `status_code`, `latency_ms`, `reason`, `client_ip`).

### Example: HTTP request

```json
{
  "level": "info",
  "time": "2026-04-01T12:00:00.000Z",
  "service": "growcast",
  "version": "0.1.0",
  "environment": "production",
  "request_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "trace_id": "0123456789abcdef0123456789abcdef",
  "span_id": "0123456789abcdef",
  "event": "http.request",
  "method": "GET",
  "path": "/api/data/current-grow",
  "route": "/api/data/current-grow",
  "status_code": 200,
  "latency_ms": 4,
  "client_ip": "203.0.113.10"
}
```

### Example: security event

```json
{
  "level": "warn",
  "time": "2026-04-01T12:01:00.000Z",
  "service": "growcast",
  "version": "0.1.0",
  "environment": "production",
  "channel": "security",
  "event": "auth.login.failed",
  "reason": "invalid_credentials",
  "client_ip": "203.0.113.10",
  "user_agent": "Mozilla/5.0 ...",
  "request_id": "...",
  "trace_id": "...",
  "span_id": "..."
}
```

### Request context (AsyncLocalStorage)

Route handlers wrapped with `withRequestLog` bind a `RequestLogContext` for the async continuation. **Server Actions** use `withNextRequestLogContext` (reads middleware-stamped headers via `next/headers`) so auth and admin mutation events still get `request_id` / `trace_id` / `span_id`:

| Field | Description |
| --- | --- |
| `request_id` | Correlation ID |
| `trace_id` / `span_id` | Trace identifiers |
| `method`, `path`, `route` | HTTP metadata |
| `client_ip` | From `cf-connecting-ip`, else first `x-forwarded-for` hop, else `x-real-ip` |
| `user_agent` | Truncated to 256 characters |

**Never** store passwords, tokens, usernames, Authorization headers, or session cookies in context or log fields.

---

## Events

### Operational / HTTP

| Event | Level | When | Typical fields |
| --- | --- | --- | --- |
| `http.request` | `info` | Successful completion of a `withRequestLog` handler | `method`, `path`, `route`, `status_code`, `latency_ms`, `client_ip` |
| `error.unhandled` | `error` | Uncaught error inside `withRequestLog` (error is rethrown) | `method`, `path`, `route`, `latency_ms`, `err` (`type`, `message`, `stack?`) |

Routes currently instrumented with `withRequestLog`:

- `/admin/logout`
- `/api/data/current-grow`
- `/api/mesh/:pluginId`
- `/api/timelapse`
- `/api/snapshots/:filename`

### Security channel (`channel: "security"`)

Emitted via `logSecurityEvent` / helpers in `lib/logging/security-events.ts`. The security logger always emits at least at `info` (not dropped by a quieter root level in non-production experiments).

| Event | Level | When | Typical fields |
| --- | --- | --- | --- |
| `auth.login.success` | `info` | Admin login succeeded | `client_ip`, `user_agent` |
| `auth.login.failed` | `warn` | Invalid credentials or bad input shape | `reason` (`invalid_credentials`), client fields |
| `auth.login.rate_limited` | `warn` | Login rate limit hit | `reason`, `retry_after_seconds`, client fields |
| `auth.login.disabled` | `warn` | Admin auth not configured | `reason` (`login_disabled`), client fields |
| `auth.logout` | `info` | Admin logout | client fields |
| `auth.session.invalid` | `warn` | Session cookie/token rejected | `reason` (`invalid_token`, `token_expired`, `session_not_found`, `session_expired`), client fields |
| `authz.denied` | `warn` | Unauthenticated access to protected admin action | `reason` (`unauthenticated`), `resource` (`admin`), client fields |
| `mesh.auth.failed` | `warn` | Mesh token missing/invalid when `GROWCAST_MESH_TOKEN` is set | `client_ip`, `user_agent` |
| `mesh.plugin.unknown` | `warn` | Unknown mesh plugin ID | `plugin_id` |
| `validation.failed` | `warn` | Reserved helper (available; call sites may grow) | caller-defined |
| `http.path_traversal_blocked` | `warn` | Snapshot filename rejected as unsafe | `reason` (`invalid_filename`) |
| `admin.grow.updated` | `info` | Admin saved grow data | optional fields |
| `admin.grow.update_failed` | `error` | Admin grow save threw | `err` (sanitized) |
| `app.start` | `info` | Node server instrumentation boot | `runtime`, `node_version` |
| `log.init` | `info` | Reserved helper for logger lifecycle | optional fields |

Helpers map 1:1 to event names (e.g. `logAuthLoginFailed` → `auth.login.failed`). Keep `SecurityEventName` in `lib/logging/types.ts` in sync when adding events.

---

## Environment variables

| Variable | Values | Default | Description |
| --- | --- | --- | --- |
| `LOG_LEVEL` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` | Production: `info`; non-production: `debug` | Minimum log level. Invalid values fall back to the environment default. |
| `LOG_PRETTY` | `1` / `true` to enable | off | Opt-in **pino-pretty** human output. **Only when not production** (`GROWCAST_ENV` / `NODE_ENV` is not `production` or `prod`). Production always stays JSON. |
| `GROWCAST_ENV` | e.g. `production`, `prod`, `development`, `staging` | falls back to `NODE_ENV`, then `development` | Sets the `environment` binding and production detection for level clamping / pretty gating. |
| `NODE_ENV` | standard Node values | — | Used when `GROWCAST_ENV` is unset. Docker Compose sets `NODE_ENV=production`. |

### Production level clamp

In production (`GROWCAST_ENV` or `NODE_ENV` is `production` or `prod`), levels quieter than `info` (`warn`, `error`, `fatal`, `silent`) are **clamped up to `info`**. This ensures HTTP and security events are never silently dropped by an accidental quiet `LOG_LEVEL`. More verbose levels (`debug`, `trace`) remain allowed for temporary diagnostics.

```text
# Effective examples
NODE_ENV=production LOG_LEVEL=warn   → info
NODE_ENV=production LOG_LEVEL=debug  → debug
NODE_ENV=development LOG_LEVEL=warn  → warn
NODE_ENV=development (unset)         → debug
```

### Local pretty logs

```bash
# PowerShell
$env:LOG_PRETTY="1"; npm run dev
```

```bash
# bash
LOG_PRETTY=1 npm run dev
```

---

## Redaction

Pino redact paths are defined in `lib/logging/redact.ts` (`REDACT_PATHS`). Matching field values are replaced with `"[Redacted]"`.

Covered keys include (non-exhaustive):

- Credentials: `password`, `passwd`, `pass`, `secret`, `token`, `access_token`, `refresh_token`, `id_token`, `api_key`, `apiKey`
- Auth headers / cookies: `authorization`, `Authorization`, `cookie`, `Cookie`, `set-cookie`, nested `headers.*` and `req.headers.*`
- Session / CSRF: `session`, `session_id`, `sessionId`, `csrf`, `csrf_token`
- Identity that must not appear in logs: `username`, `user_name`, `email`
- Nested wildcards: `*.password`, `*.token`, `*.authorization`, `*.cookie`, `*.secret`
- Body shortcuts: `body.password`, `body.token`, `body.username`

### Error sanitization

`sanitizeError(error)` converts thrown values to a safe shape (`type`, `message`, optional `stack`). It does **not** serialize arbitrary error properties (which might hold secrets). Prefer this helper when attaching errors to log fields.

### Hard rules

1. Never log passwords, session cookies, Bearer tokens, mesh tokens, or admin usernames.
2. Prefer opaque identifiers if identity correlation is needed later (e.g. hashed admin id).
3. Do not put secrets into `RequestLogContext`.
4. Redaction is defense-in-depth — do not rely on it as the only control; avoid logging sensitive objects in the first place.

---

## Docker / stdout

The production container runs `node server.js` with no log file volume. **All application logs go to process stdout/stderr**, which Docker captures.

```bash
# Follow container logs
docker compose logs -f growcast

# Last N lines
docker compose logs --tail=200 growcast
```

Relevant compose defaults (`docker-compose.yml`):

- `NODE_ENV=production` → JSON logs, level default `info`, pretty disabled
- Optional: add `LOG_LEVEL`, `GROWCAST_ENV` under `environment` or in `.env.local` (loaded via `env_file`)

### Log drivers and shipping

Typical production patterns:

| Approach | Notes |
| --- | --- |
| Docker json-file (default) | Local rotation via `max-size` / `max-file` on the service logging driver |
| journald / syslog | Host-level collection from Docker |
| Sidecar / agent | Fluent Bit, Vector, Promtail, Datadog agent, etc. scrape container stdout |
| Cloud | Platform log drain (Cloudflare, Fly, Railway, k8s logging stack) |

GrowCast does not write application log files inside the container. Persist and ship from the orchestrator layer.

---

## Retention

Retention is **operator-controlled** (not enforced by the app). Recommended baseline for a home/self-hosted GrowCast:

| Class | Suggested retention | Rationale |
| --- | --- | --- |
| Security events (`channel=security`) | 30–90 days | Login abuse, mesh auth, path traversal investigations |
| HTTP access (`http.request`) | 7–30 days | Latency and traffic debugging |
| Errors (`error.*`, `admin.grow.update_failed`) | 30–90 days | Incident follow-up |
| Debug/trace (if temporarily enabled) | hours–days | High volume; disable after diagnosis |

Example Docker json-file rotation (compose `logging` block):

```yaml
services:
  growcast:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
```

Adjust for disk capacity and compliance needs. If you export to an aggregator, set index/lifecycle policies there (e.g. hot 14d / cold 90d).

---

## Correlation headers

### Middleware (Edge)

`middleware.ts` runs on matched paths (excluding `_next/static`, `_next/image`, `favicon.ico`):

| Header | Direction | Behavior (v1) |
| --- | --- | --- |
| `x-request-id` | Inbound | Accepted if charset `^[A-Za-z0-9._-]+$` and length 8–128; otherwise a new UUID is generated |
| `x-trace-id` | Inbound | **Ignored** — always regenerated (client `traceparent` / `x-trace-id` not trusted in v1) |
| `x-span-id` | Inbound | **Ignored** — always regenerated |
| `x-request-id`, `x-trace-id`, `x-span-id` | Request (downstream) | Set on the rewritten request headers for route handlers |
| `X-Request-ID` | Response | Echoes the effective request ID to the client |

ID formats:

| ID | Format |
| --- | --- |
| `request_id` | UUID v4 (or validated client token) |
| `trace_id` | 32 lowercase hex characters (16 bytes) |
| `span_id` | 16 lowercase hex characters (8 bytes) |

### Route helpers

`withRequestLog` rebuilds context from request headers. It will reuse valid inbound `x-request-id` / `x-trace-id` / `x-span-id` if present. In normal browser traffic, middleware has already set those headers on the internal request, so handlers inherit the edge-generated IDs.

Clients and reverse proxies can supply `X-Request-ID` for end-to-end correlation; they should read `X-Request-ID` from the response for support tickets.

```http
GET /api/data/current-grow HTTP/1.1
X-Request-ID: support-ticket-abc12345
```

Response:

```http
HTTP/1.1 200 OK
X-Request-ID: support-ticket-abc12345
```

---

## Alert examples

These are **example** queries / rules for common aggregators. Adapt field names if your pipeline renames JSON keys.

### 1. Spike in failed admin logins

**Condition:** count of `event = "auth.login.failed"` or `auth.login.rate_limited` per client IP (or global) exceeds threshold in a window.

```text
# Conceptual filter
channel:security AND event:(auth.login.failed OR auth.login.rate_limited)

# Alert if
count() > 10 in 5m   # global
# or
count() by client_ip > 5 in 5m
```

**Severity:** medium. Investigate source IPs; confirm rate limiter is working.

### 2. Mesh authentication failures

```text
channel:security AND event:mesh.auth.failed
count() > 20 in 10m
```

**Severity:** medium–high if mesh token is required for plugins. Check token rotation and plugin configuration.

### 3. Path traversal attempts

```text
channel:security AND event:http.path_traversal_blocked
count() >= 1 in 1m   # any occurrence may be worth a low-priority notify
```

**Severity:** low–medium. Correlates with `request_id` / `client_ip` for abuse reports.

### 4. Unhandled errors

```text
event:error.unhandled OR event:admin.grow.update_failed
count() > 0 in 5m
```

**Severity:** high for production. Use `err.type`, `err.message`, `route`, `request_id`.

### 5. Missing or silent app

Absence of `event:app.start` after deploy, or absence of `http.request` for an extended period on a normally busy instance, can indicate crash loops (pair with container health / restart metrics).

```text
# Deploy check: expect app.start shortly after container start
event:app.start
```

### 6. Authz denials (optional)

```text
event:authz.denied
count() by client_ip > 15 in 15m
```

May indicate session expiry noise or probing of `/admin`.

### Example alert payload mapping

| Signal | Primary fields for runbooks |
| --- | --- |
| Login abuse | `event`, `client_ip`, `user_agent`, `reason`, `request_id` |
| Mesh auth | `event`, `client_ip`, `request_id` |
| HTTP errors | `event`, `route`, `path`, `status_code`, `latency_ms`, `err`, `request_id`, `trace_id` |

---

## Library map

| Module | Role |
| --- | --- |
| `lib/logging/logger.ts` | Pino root/security loggers, level resolution, `logSecurityEvent` |
| `lib/logging/redact.ts` | `REDACT_PATHS`, `sanitizeError` |
| `lib/logging/http.ts` | `withRequestLog`, client IP / UA extraction |
| `lib/logging/ids.ts` | ID generation and validation |
| `lib/logging/context.ts` | AsyncLocalStorage request context |
| `lib/logging/security-events.ts` | Named security event helpers |
| `lib/logging/types.ts` | `SecurityEventName`, context and binding types |
| `lib/logging/index.ts` | Public barrel (**do not import from Edge middleware**) |
| `middleware.ts` | Edge-safe correlation only |
| `instrumentation.ts` | Emits `app.start` on Node runtime boot |
| `tests/logging/` | Unit tests for redact, IDs, HTTP helpers, level resolution |

---

## Tests

```bash
npm test
```

Runs `tests/logging/**/*.test.ts` (redaction, `resolveLogLevel`, ID validation, client IP / UA extraction).
