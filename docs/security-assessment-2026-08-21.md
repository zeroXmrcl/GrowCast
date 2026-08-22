# Security Assessment Report

| Field | Value |
|-------|--------|
| **Title** | GrowCast — defensive code/repository security assessment |
| **Date** | 2026-08-21 |
| **Mode** | B (code / repo) |
| **Assessor** | Grok Build `security-audit` skill (defensive, authorized-only) |
| **Authorization** | Repository owner requested `/security-audit` in this session against the local GrowCast workspace they control |
| **Classification** | Internal |

---

## 1. Executive summary

**Overall posture:** GrowCast is a single-operator Next.js dashboard with a clearly separated public journal and a cookie-authenticated admin surface. Core access control on mutating paths is enforced server-side (not in `proxy.ts`). Password storage uses scrypt with a salt; mesh API authentication fails closed when the token is unset; uploads are re-encoded and renamed; URL schemes for public links are restricted to `http`/`https`. Residual risk is dominated by **session and brute-force controls that assume a trusted reverse proxy**, a **documented HTTP LAN deploy that conflicts with `Secure` cookies and HSTS**, **in-memory sessions**, and **no CI/SCA pipeline**. No authentication bypass of admin mutations was evidenced.

**Top risks:**

1. Production `Secure` cookies and HSTS vs the documented HTTP Compose path (admin session reliability and confidentiality).
2. Login lockout and security-log `client_ip` derived from unauthenticated forwarding headers when port 3000 is exposed directly.
3. In-memory admin sessions (no rotation on re-login, not shared across processes, lost on restart).

**Key recommendations:**

1. Terminate TLS (or a trusted tunnel) for any non-localhost production access; set cookie `Secure` from an explicit flag / forwarded proto, not only `NODE_ENV`.
2. Ignore `X-Forwarded-For` / `X-Real-IP` unless the peer is a configured trusted proxy (e.g. Cloudflare).
3. Add CI (`npm ci`, tests, `npm audit`) and persist or centrally store admin sessions if more than one process will run.

**Finding counts:**

| Critical | High | Medium | Low | Informational |
|----------|------|--------|-----|---------------|
| 0 | 1 | 8 | 6 | 2 |

**Human-in-the-loop:** F-001 (and any change to cookies, hashing, or Docker networking) should be reviewed by a human before implementation.

---

## 2. Scope, methodology, standards, limitations

### 2.1 Scope

**In scope:**

- Local git repository `/Users/marcel/WebstormProjects/growcastdev`
- Branch `multi-grow` at `cad4f44`
- Application source, Docker/Compose, tests, dependency lockfile, logging

**Out of scope:**

- Live production hosts, Cloudflare, MediaMTX, and other third-party systems
- Offensive testing, payloads, credential stuffing, or traffic generation
- Formal certification (SOC 2 / ISO attestation)
- Untracked operator files except noting `.env*` gitignore coverage (values not read into the report)

**Environments / repos / branches:**

- Repo: GrowCast (this workspace)
- Branch: `multi-grow`
- Constraints: read-only review; no production probing

### 2.2 Methodology

1. Authorization and scope confirmation (owner-requested `/security-audit` on this repo)
2. Asset inventory and trust-boundary mapping
3. Lightweight STRIDE per boundary
4. Layered control assessment (web/API, container/Compose, supply chain, logging)
5. Independent specialist tracks (authz, files/injection, secrets/crypto/Docker, logging/CI) plus direct file review
6. Risk analysis and structured reporting

### 2.3 Standards used

- OWASP Top 10:2025
- OWASP ASVS 5.0.x (L1/L2 as applicable)
- NIST CSF 2.0
- CIS Controls v8.1 / CIS Docker Benchmark themes
- Zero Trust (NIST SP 800-207) themes
- ISO 27001:2022 (8.25–8.29)
- CWE (specific IDs where confident)

Not applicable: OWASP LLM Top 10, MASVS, payments/OAuth chapters.

### 2.4 Limitations

- Static/code review only. No penetration test, no authenticated browser session as the real operator.
- `npm audit --omit=dev` was used as defensive SCA (package names and severity only).
- Absence of a finding is not a guarantee of security.
- Next.js 16.2.x vs later patched lines should be re-checked against vendor advisories at retest time.

---

## 3. Findings summary

| ID | Severity | Title | Primary mapping | Asset / component |
|----|----------|-------|-----------------|-------------------|
| F-001 | High | `Secure` cookies and HSTS vs documented HTTP Compose | A02, ASVS V7/V12, CWE-614 | Admin session / Docker |
| F-002 | Medium | Login rate limit trusts client IP headers | A07, ASVS V6, CWE-307 | Admin login |
| F-003 | Medium | In-memory sessions; no rotation or global revoke | A07, ASVS V7, CWE-613 | Admin session |
| F-004 | Medium | `setup:admin` replaces `.env.local` and drops mesh token | A02, ASVS V13, CWE-312 | Admin setup |
| F-005 | Medium | scrypt uses Node defaults; parameters not encoded | A04, ASVS V11, CWE-916 | Password hashing |
| F-006 | Medium | Unauthenticated `/admin` discloses setup warnings | A01, ASVS V8, CWE-200 | Admin login UI |
| F-007 | Medium | Snapshot GET weaker than archive/media filename gates | A01, ASVS V5, CWE-22 | `/api/snapshots` |
| F-008 | Medium | Docker starts as root; RW bind mounts; no CIS lock-down | A02, CIS Docker, CWE-250 | Container runtime |
| F-009 | Medium | No CI / SCA / Dependabot in-repo | A03, CIS 7/16, ISO 8.29 | Supply chain |
| F-010 | Low | Mesh token has no minimum length or failure throttle | A07, ASVS V6, CWE-521 | Mesh API |
| F-011 | Low | Logout POST lacks same-origin gate used by media | A01, ASVS V4, CWE-352 | `/admin/logout` |
| F-012 | Low | `.gitignore` misses non-`*.local` Next env files | A02, ASVS V13, CWE-540 | Git hygiene |
| F-013 | Low | Markdown notes allow all `https:` URLs; no max length | A05, ASVS V1/V2, CWE-79 | Public dashboard |
| F-014 | Low | Production logs may include error stacks | A09, ASVS V16, CWE-209 | Logging |
| F-015 | Low | Snapshot/archive I/O errors swallowed as 404 | A09/A10, ASVS V16 | File APIs |
| F-016 | Informational | Transitive `nanoid` High advisory (dev/omit-dev audit) | A03 | Dependencies |
| F-017 | Informational | `streamUrl` iframe is any `http(s)` (admin-trusted) | A06, ASVS V3 | Public dashboard |

---

## 4. Detailed findings

### [High] F-001: `Secure` cookies and HSTS vs documented HTTP Compose

- **Asset / Component:** `lib/admin-auth.ts` (session cookie); `docker-compose.yml`; `next.config.ts` (HSTS); README HTTP LAN path
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A02:2025; ASVS V7 (Session), V12 (Secure Communication); CWE-614; CIS Docker (published HTTP port); NIST PR.DS / PR.AA
- **Description:** The admin session cookie sets `secure` when `NODE_ENV === "production"`. Compose sets `NODE_ENV: production` and the documented operator path is HTTP (`localhost` / LAN). The same config emits HSTS `max-age=31536000; includeSubDomains` while CSP is deliberately without `upgrade-insecure-requests` for HTTP HLS.
- **Evidence (concrete, redacted):** Cookie flags at `lib/admin-auth.ts` ~255–264 (`httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`). Compose `NODE_ENV: production` and `ports: "${GROWCAST_PORT:-3000}:3000"`. `next.config.ts` HSTS header and comment that the Compose path is HTTP.
- **Impact (technical + business):** On non-localhost HTTP, browsers typically will not persist `Secure` cookies, so admin login appears broken. Operators may “fix” this by disabling `Secure` or running without TLS, leaving the session cookie exposed on the LAN. HSTS is ignored on pure HTTP but is harmful if mixed with later HTTPS.
- **Recommendation (high-level, prioritized):** For internet-facing or LAN-beyond-localhost: terminate TLS (or Cloudflare Tunnel as already documented) and keep `Secure`. Drive cookie `Secure` from an explicit setting or `x-forwarded-proto` from a trusted proxy. Do not send HSTS on plaintext HTTP.
- **Residual risk / retest notes:** Human design review required. Retest: confirm Set-Cookie `Secure` on HTTPS and absence of HSTS on HTTP-only responses; confirm login still works on the chosen deploy path.

### [Medium] F-002: Login rate limit trusts client IP headers

- **Asset / Component:** `app/admin/actions.ts`, `lib/logging/http.ts`, `lib/admin-auth.ts` (`loginAttemptStore`)
- **Mapping:** OWASP A07:2025; ASVS V6; CWE-307, CWE-348; NIST PR.AA
- **Description:** Failed logins are limited to 10 attempts / 15 minutes then a 15-minute block, keyed as `admin-login:${ip}`. IP is `cf-connecting-ip`, else first `X-Forwarded-For` hop, else `X-Real-IP`. Compose publishes the app directly with no documented trusted-proxy check.
- **Evidence:** `extractClientIp` in `lib/logging/http.ts` ~36–55; `getRequestIp` in `app/admin/actions.ts`; `consumeLoginAttempt` in `lib/admin-auth.ts` ~199–233.
- **Impact:** Lockout can be avoided or aimed at another identifier when headers are attacker-controlled. The in-memory attempt map can grow with unique keys. Login still uses scrypt, so this is a control-gap, not an automatic hash bypass.
- **Recommendation:** Trust forwarded IPs only behind a known proxy; otherwise use the connection address. Cap the attempt map.
- **Residual risk / retest notes:** Confirm lockout still applies when spoofed forwarding headers are present on a direct socket.

### [Medium] F-003: In-memory sessions; no rotation or global revoke

- **Asset / Component:** `lib/admin-auth.ts` (`sessionStore` Map)
- **Mapping:** OWASP A07:2025; ASVS V7; CWE-613; NIST PR.AA
- **Description:** Valid sessions require HMAC of `{sid, exp}` **and** a Map entry. Login always inserts a new `sid` without invalidating prior ones. Password-hash rotation does not drop existing sids (secret rotation does, via HMAC). Store is per-process.
- **Evidence:** `sessionStore = new Map` ~27; `sessionStore.set` on login ~374–384; TTL 24h in `lib/admin-session-policy.ts`.
- **Impact:** Stolen cookies remain valid until expiry even after a later login. Multiple containers split sessions (fail-closed: other replicas treat the cookie as invalid). Restarts drop all sessions (availability, not privilege gain).
- **Recommendation:** Persist or share the sid store if you scale out; revoke other sids on login and on credential change; consider a shorter idle timeout.
- **Residual risk / retest notes:** Human review before changing session storage. Confirm logout and restart invalidate access.

### [Medium] F-004: `setup:admin` replaces `.env.local` and drops mesh token

- **Asset / Component:** `scripts/admin-creator.mjs`
- **Mapping:** OWASP A02:2025; ASVS V13; CWE-312; ISO 8.26
- **Description:** The setup script writes only `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SESSION_SECRET`, replacing the live env file after a timestamped backup. Mesh is fail-closed without `GROWCAST_MESH_TOKEN`, which this script never emits or preserves.
- **Evidence:** `envContent` array and `writeFileSync` replacing `.env.local` ~197–217.
- **Impact:** Re-running documented setup can take plugins to 401 until the operator copies the token from the backup. Extra backup copies of secrets remain on disk (gitignored).
- **Recommendation:** Merge-preserve unknown keys (especially `GROWCAST_MESH_TOKEN`); generate a mesh token if missing; avoid unbounded backup copies.
- **Residual risk / retest notes:** After setup, confirm mesh token still present and plugins authenticate.

### [Medium] F-005: scrypt uses Node defaults; parameters not encoded

- **Asset / Component:** `scripts/admin-creator.mjs`, `lib/admin-credentials.ts`
- **Mapping:** OWASP A04:2025; ASVS V11; CWE-916
- **Description:** `scryptSync(password, salt, 64)` with 16-byte salt; format `scrypt$salt$hash` does not record N/r/p. Node default N=16384. Login hashing is synchronous on the request path (mitigated somewhat by F-002’s lockout).
- **Evidence:** `hashAdminPasswordForEnv` ~152–155; `verifyAdminPassword` uses `expectedHash.length`.
- **Impact:** Weaker than current interactive scrypt guidance; cost cannot be upgraded in-place. Event-loop stalls under many parallel logins if lockout is bypassed (F-002).
- **Recommendation:** Encode PHC/scrypt parameters; raise cost; prefer async scrypt/worker. Human review of crypto changes.
- **Residual risk / retest notes:** Existing hashes must remain verifiable or be rotated via `setup:admin`.

### [Medium] F-006: Unauthenticated `/admin` discloses setup warnings

- **Asset / Component:** `lib/admin-auth.ts` `getAdminSetupStatus`; `app/admin/login-form.tsx`
- **Mapping:** OWASP A01:2025; ASVS V8; CWE-200
- **Description:** Missing/placeholder env, short session secret, and non-`scrypt$` hash format are listed to any visitor when `canLogin` is false.
- **Evidence:** Warnings ~88–116; login form renders `warnings` when `!canLogin`.
- **Impact:** Recon of misconfiguration on a public `/admin`.
- **Recommendation:** Generic “login unavailable” to the client; detailed warnings only in server logs.
- **Residual risk / retest notes:** Unauthenticated GET `/admin` must not include specific env/hash/secret diagnostics.

### [Medium] F-007: Snapshot GET weaker than archive/media filename gates

- **Asset / Component:** `app/api/snapshots/[filename]/route.ts` vs `lib/safe-media-filename.ts` / archive GET
- **Mapping:** OWASP A01:2025; ASVS V5; CWE-22
- **Description:** Snapshots reject `/`, `\`, and `..` only. Archives and media deletes also allowlist extensions, reject NUL/leading-dot/length, and (on delete) require `dirname(resolve(path)) === dir`.
- **Evidence:** Snapshot route ~31–41 vs archive GET ~33–45 and `isSafeMediaFilename`.
- **Impact:** Unauthenticated read of unexpected files that exist in `SNAPSHOT_DIR` (wrong type/name). Classic `../` is largely blocked; this is over-broad read and missing canonicalization, not an evidenced escape from that directory.
- **Recommendation:** Reuse `isSafeMediaFilename` + resolve-containment as on archive deletes.
- **Residual risk / retest notes:** Confirm non-image names and encoded-dot variants return 400.

### [Medium] F-008: Docker starts as root; RW bind mounts; no CIS lock-down

- **Asset / Component:** `Dockerfile`, `docker-entrypoint.sh`, `docker-compose.yml`
- **Mapping:** OWASP A02:2025; CIS Docker 4.1/5.3–5.5; CWE-250; NIST PR.PS
- **Description:** Entrypoint runs as root to `chown -R` four host bind mounts, then `su-exec` to uid 1001. No `cap_drop`, `no-new-privileges`, or read-only rootfs. Image tag `node:24-alpine` is floating.
- **Evidence:** Dockerfile ~24–40; entrypoint `chown -R`; compose volumes `./data`, `./extensions`, `./public/setup`, `./public/yourPictures`.
- **Impact:** Privilege drop after start is real. Residual: entrypoint override stays root; recursive chown on mis-pointed mounts; compromised process can rewrite published media and grow JSON.
- **Recommendation:** Document required host UIDs; consider `:ro` where writes are not needed; `cap_drop: ALL` + `no-new-privileges`; pin digest. Human review of container hardening.
- **Residual risk / retest notes:** Confirm process uid is 1001 after start and bind mounts remain writable for intended dirs only.

### [Medium] F-009: No CI / SCA / Dependabot in-repo

- **Asset / Component:** Repository process (no `.github/workflows`)
- **Mapping:** OWASP A03:2025; CIS Controls 7/16; ISO 27001:2022 8.29
- **Description:** Tests and lint exist locally. Nothing enforces them or `npm audit` on push. Lockfile + Docker `npm ci` are present.
- **Evidence:** No `.github` directory; `package.json` scripts `test`/`lint` only.
- **Impact:** Vulnerable or untested changes can reach `main` without an automated gate. A defensive `npm audit --omit=dev` at assessment time reported one High on `nanoid` (F-016).
- **Recommendation:** CI: `npm ci`, `npm test`, `npm run lint`, audit/OSV; Dependabot or equivalent.
- **Residual risk / retest notes:** A green CI run on `main` is the evidence.

### [Low] F-010: Mesh token has no minimum length or failure throttle

- **Asset / Component:** `lib/mesh-auth.ts`
- **Mapping:** OWASP A07:2025; ASVS V6; CWE-521, CWE-307
- **Description:** Fail-closed when unset (good). No min length comparable to `ADMIN_SESSION_SECRET`. Failed Bearer attempts are logged, not rate-limited.
- **Evidence:** `isMeshTokenAuthorized` / `requireMeshAuth` ~36–81; tests in `tests/security.test.ts`.
- **Recommendation:** Enforce a minimum token length at boot; rate-limit failures with a non-spoofable key.
- **Residual risk / retest notes:** Unset token still 401; short tokens rejected at boot.

### [Low] F-011: Logout POST lacks same-origin gate used by media

- **Asset / Component:** `app/admin/logout/route.ts` vs `app/api/admin/media/route.ts`
- **Mapping:** OWASP A01:2025; ASVS V4; CWE-352
- **Description:** Media POST uses `isSameOriginRequest`. Logout POST does not. Cookie is `SameSite=Lax`, which already blocks typical cross-site POST cookie sending.
- **Evidence:** logout route ~5–9; media route ~26–29.
- **Impact:** Residual cross-site logout if Lax is bypassed or cookie policy changes.
- **Recommendation:** Apply the same Origin/Referer check as media.
- **Residual risk / retest notes:** Cross-origin POST without Origin/Referer match must not clear the session.

### [Low] F-012: `.gitignore` misses non-`*.local` Next env files

- **Asset / Component:** `.gitignore` vs `.dockerignore`
- **Mapping:** OWASP A02:2025; ASVS V13; CWE-540
- **Description:** `.env`, `.env.local`, `.env*.local` ignored. Next also loads `.env.development` / `.env.production` / `.env.test`, which are not ignored. Dockerignore is stricter (`.env.*`).
- **Evidence:** `.gitignore` env section; `.dockerignore` `.env` / `.env.*`.
- **Recommendation:** Ignore `.env*` except a committed `.env.example` without secrets.
- **Residual risk / retest notes:** `git check-ignore` on those names.

### [Low] F-013: Markdown notes allow all `https:` URLs; no max length

- **Asset / Component:** `lib/url-policy.ts` `markdownUrlTransform`; `app/(site)/page.tsx`; parse-grow-form
- **Mapping:** OWASP A05:2025; ASVS V1/V2; CWE-79
- **Description:** `react-markdown` without `rehype-raw` (HTML not interpreted). `javascript:` / `data:` / protocol-relative URLs stripped. Any `https:` link/image remains. Notes fields are unbounded.
- **Evidence:** `markdownUrlTransform` ~78–97; homepage markdown usage.
- **Impact:** Not classic HTML XSS. Residual phishing/tracking pixels and large-note resource use. Admin-controlled content.
- **Recommendation:** `allowedElements`; optional max length; consider disallowing remote images in notes.
- **Residual risk / retest notes:** `javascript:` URLs remain non-navigable.

### [Low] F-014: Production logs may include error stacks

- **Asset / Component:** `lib/logging/redact.ts` `sanitizeError`
- **Mapping:** OWASP A09:2025; ASVS V16; CWE-209
- **Description:** `sanitizeError` always copies `error.stack`. Pino redacts password/token/cookie/username fields (good) but not stacks.
- **Evidence:** `sanitizeError` ~48–56; `REDACT_PATHS` list.
- **Recommendation:** Omit stacks unless `LOG_LEVEL` is debug/trace or non-production.
- **Residual risk / retest notes:** Production JSON lines for failed admin save should lack `stack`.

### [Low] F-015: Snapshot/archive I/O errors swallowed as 404

- **Asset / Component:** snapshot and archive GET handlers
- **Mapping:** OWASP A09/A10:2025; ASVS V16
- **Description:** Unexpected `readFile` failures return “File not found” without an error security/ops event. Path-traversal attempts **are** logged.
- **Evidence:** `catch { return 404 }` on snapshot/archive routes.
- **Impact:** Access stays fail-closed; disk/permission faults are invisible to alerting.
- **Recommendation:** Log unexpected errors at `error` before the generic 404.
- **Residual risk / retest notes:** Traversal still 400 + `http.path_traversal_blocked`.

### [Informational] F-016: Transitive `nanoid` High advisory

- **Asset / Component:** `package-lock.json` / `npm audit --omit=dev`
- **Mapping:** OWASP A03:2025
- **Description:** Audit reported 1 High: `nanoid` (custom generators can loop indefinitely when size is zero). Not confirmed as reachable from GrowCast request paths in this review.
- **Evidence:** `npm audit --omit=dev` counts: high 1, total 1 (package name only).
- **Impact:** Supply-chain hygiene; exploitability in this app not demonstrated.
- **Recommendation:** Resolve via lockfile update when a fix is available; gate with CI audit.
- **Residual risk / retest notes:** Re-run `npm audit --omit=dev` after lockfile bump.

### [Informational] F-017: `streamUrl` iframe is any `http(s)` (admin-trusted)

- **Asset / Component:** `app/(site)/page.tsx`; `lib/url-policy.ts`
- **Mapping:** OWASP A06:2025; ASVS V3
- **Description:** No server-side fetch of `streamUrl`. Homepage iframes stored `http`/`https` URLs (LAN MediaMTX is intentional). CSP `frame-src` allows `http:` and `https:`. No `sandbox`.
- **Evidence:** iframe ~122–128; `isSafeHttpUrl` protocol allowlist.
- **Impact:** Compromised admin or tampered JSON frames a third-party page in the dashboard origin UI.
- **Recommendation:** Document stream hosts as trusted; optional host allowlist; tighten iframe `allow` / `sandbox` if the player still works.
- **Residual risk / retest notes:** `javascript:` stream URLs must not render (already covered by URL policy + `safeHttpUrlOrEmpty` on the page).

---

## 5. Positive observations / strengths

- Mutating admin paths call `requireAdmin` / `isAdminAuthenticated` on the server; `proxy.ts` only stamps correlation IDs (not treated as auth).
- Mesh API fail-closed when `GROWCAST_MESH_TOKEN` is unset; Bearer compare is constant-time; covered by tests.
- Passwords stored as scrypt with per-password salt; login evaluates username and password without short-circuit before verify; placeholders disable login.
- Session cookie: `HttpOnly`, `SameSite=Lax`, HMAC-SHA256 then server-side `sid` lookup (HMAC alone is not enough).
- Media uploads: collection allowlist, size/count caps, Sharp decode limits, re-encode to WebP, server-generated names, same-origin POST.
- Public URL policy rejects non-http(s), userinfo, and `javascript:` / `data:` in markdown transforms.
- `.env*` gitignored (with F-012 caveat); `.dockerignore` excludes env files; image is multi-stage standalone.
- Structured Pino security events with redaction of passwords, tokens, cookies, usernames; path-traversal blocks are logged.
- Compose `env_file` `format: raw` plus escaped `$` in setup hashes addresses dotenv interpolation of `scrypt$...`.

---

## 6. Residual risk and prioritized roadmap

### 6.1 Residual risk statement

After P0/P1 items, residual risk is that of a **single-operator, internet-optional home dashboard**: one admin identity, no MFA, public journal data (grows, pictures, current-grow JSON) by design, and file-backed state without multi-node consistency. Unmitigated: no external pen test, no SIEM/alerting, in-memory sessions unless redesigned, and dependency advisory F-016 until the lockfile is refreshed.

### 6.2 Prioritized roadmap

| Priority | Action | Addresses | Owner suggestion | Target |
|----------|--------|-----------|------------------|--------|
| P0 | TLS or tunnel for non-localhost; cookie `Secure` + HSTS only on HTTPS | F-001 | Operator + human review | 0–48 h if internet-facing |
| P0 | Trust forwarding headers only behind a known proxy | F-002 | Engineering | 0–48 h if port 3000 is public |
| P1 | Align snapshot GET with `isSafeMediaFilename` + containment | F-007 | Engineering | 1 week |
| P1 | Preserve mesh token in `setup:admin`; generic login-disabled UI | F-004, F-006 | Engineering | 1 week |
| P1 | Add CI: test, lint, audit | F-009, F-016 | Engineering | 1–2 weeks |
| P2 | Session persistence/rotation; scrypt parameter encoding; Docker CIS hardening | F-003, F-005, F-008 | Engineering + human review | 2–6 weeks |
| P2 | Logging/markdown/logout/gitignore follow-ups | F-010–F-015, F-017 | Engineering | 2–6 weeks |

### 6.3 Human-in-the-loop

The following require human design/security review before implementation or closure:

- F-001 (cookies / TLS / HSTS)
- F-003 (session storage)
- F-005 (password hashing parameters)
- F-008 (container privilege and bind-mount ownership)

### 6.4 External testing

[x] Recommend professional third-party penetration testing: **Yes** if the dashboard or admin is reachable from the internet (Cloudflare Tunnel or port forward). Rationale: cookie admin, public file APIs, and iframe/markdown surfaces benefit from an independent test that this review explicitly did not perform.

If the instance stays LAN-only behind a firewall, treat this code review plus CI as the near-term bar and still retest after P0 cookie/TLS work.

### 6.5 Retest notes

- P0: HTTPS response `Set-Cookie` includes `Secure`; HTTP-only response does not send HSTS; login works on the chosen URL.
- F-002: login lockout still increments when `X-Forwarded-For` is varied on a direct connection.
- F-007: snapshot names outside the image allowlist return 400.
- F-004: `npm run setup:admin` leaves `GROWCAST_MESH_TOKEN` in `.env.local`.
- F-009: CI green on `main`.

---

## 7. Compliance mapping notes

| Framework | Relevant findings / gaps | Notes |
|-----------|--------------------------|-------|
| NIST CSF 2.0 | PR: F-001–F-008; DE: F-009, F-014, F-015; GV: no formal SDLC/CI | Mapping aid, not a score |
| CIS Controls v8.1 | 4 Secure config (Docker/headers); 6 Access; 7/16 vuln mgmt (no CI); 8 audit logs | |
| ISO 27001:2022 | 8.25–8.29: tests exist but no pipeline (8.29); 8.28 coding patterns mixed | |
| Zero Trust (800-207) | Proxy is not identity; admin is cookie + server Map; forwarded IP trust is implicit | |

This section is a **mapping aid**, not a formal certification.

---

## 8. Appendices

### A. Asset inventory (summary)

| Asset | Type | Data sensitivity | Trust boundary notes |
|-------|------|------------------|----------------------|
| Public site `/`, `/gallery`, `/grows` | Web UI | Grow metadata, photos, stream URL (operator-published) | Unauthenticated by design |
| `GET /api/data/current-grow` | API | Same as public grow JSON | Unauthenticated |
| `GET /api/snapshots`, `/api/timelapse`, `/api/archives/...` | API | Media files | Unauthenticated; filename/id gates |
| `GET /api/mesh/[pluginId]` | API | Plugin settings | Bearer `GROWCAST_MESH_TOKEN`, fail-closed |
| `/admin`, server actions, `POST /api/admin/media` | Admin | Credentials, media, archives | Cookie session + HMAC + Map |
| `data/*.json`, bind-mounted media | Files | Operational + media | Host FS / container uid 1001 |
| `.env.local` | Secrets | Admin hash, session secret, mesh token | Gitignored; Compose `env_file` raw |

### B. STRIDE notes (by boundary)

| Boundary / flow | S | T | R | I | D | E | Notes |
|-----------------|---|---|---|---|---|---|-------|
| Browser → public HTTP | | | | x | x | | Public data; iframe/markdown residual |
| Browser → admin cookie | x | | x | x | x | x | F-001, F-002, F-003, F-006 |
| Plugin → mesh API | x | | x | | x | | Fail-closed; F-010 |
| Admin → JSON/media files | | x | | | x | | F-007, F-008 |
| Container → host binds | | x | | | | x | F-008 |
| Logs stdout | | | x | x | | | F-002 IP integrity, F-014 stacks |
| Git / npm | | x | | | | | F-009, F-012, F-016 |

S=Spoofing T=Tampering R=Repudiation I=Information disclosure D=DoS E=Elevation

### C. Checklists used

- `references/checklists.md`: A1–A10 (web/API), B6 (containers), C (supply chain/DevSecOps)
- D1–D3 (LLM/mobile/IoT): N/A
- CIS Docker themes: non-root, capabilities, sensitive mounts

### D. Tool categories used (defensive / authorized only)

| Category | Tool or process | Notes |
|----------|-----------------|-------|
| Manual code review | read_file / grep | Four specialist tracks + consolidator |
| SCA / deps | `npm audit --omit=dev` | Package names and severity only |
| Secrets | grep for env/token patterns | Values not copied into this report |
| Config / container | Dockerfile, Compose, next.config.ts | Read-only |
| SAST / DAST / pen test | Not run | |

### E. Document control

| Version | Date | Change |
|---------|------|--------|
| 0.1 | 2026-08-21 | Initial assessment of `multi-grow` @ `cad4f44` |
