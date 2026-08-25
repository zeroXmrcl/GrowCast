# Security Assessment Report

| Field | Value |
|-------|--------|
| **Title** | GrowCast — defensive security assessment (code + documented Cloudflare Tunnel architecture) |
| **Date** | 2026-08-25 |
| **Mode** | Combined A (system / architecture) and B (code / repo) |
| **Assessor** | Grok Build `security-audit` skill (defensive, authorized-only) |
| **Authorization** | Repository owner invoked `/security-audit` in this session against the local GrowCast workspace they control |
| **Classification** | Internal |
| **Code under review** | Branch `GrowCast-GGS` at `d306b2e` (frozen snapshot; not a live HEAD assessment) |

---

## 1. Executive summary

**Overall posture:** GrowCast is a single-operator Next.js garden journal with a public dashboard and a cookie-authenticated admin panel. For the **documented production path** (Docker Compose publishing only `127.0.0.1:3000`, TLS and client IPs from a Cloudflare Tunnel, `GROWCAST_TRUST_PROXY=1`), core access control is sound: admin mutations are authorized server-side, mesh/plugin APIs fail closed without a Bearer token, uploads are renamed and mostly re-encoded, path traversal on media reads is rejected, and forwarded `X-Forwarded-For` is not used for identity. No unauthenticated admin bypass, stored-XSS via markdown HTML, or server-side SSRF of operator URLs was evidenced.

Residual risk is dominated by **availability of the origin** (unauthenticated handlers buffer whole media files and can accept large bodies), **trust of Cloudflare headers without authenticating the hop** (safe only while the origin stays on loopback), **process-local sessions and rate limits**, **fail-open JSON for timelapse/energy**, and **no CI / SCA pipeline**. This is a reasonably hardened homelab journal behind a tunnel, not a multi-tenant or high-assurance system.

**Top risks:**

1. Public timelapse/snapshot/archive media GETs load entire files into process memory; the Next proxy also allows a 40 MB body window before auth.
2. Client IP, Secure-cookie, and public-origin decisions trust Cloudflare/forwarded headers by configuration, not by proving the peer is `cloudflared`.
3. Admin sessions, login lockout, and mesh throttles live in unbounded in-memory maps; `scryptSync` runs on the request thread.

**Key recommendations:**

1. Stream (or size-cap) public media; apply body limits after read, and keep the 40 MB window only on authenticated media POST.
2. Pin `COOKIE_SECURE=1` and `GROWCAST_PUBLIC_URL=https://<tunnel-host>` in Compose; never publish `:3000` off loopback.
3. Add CI (`npm ci`, tests, lint, `npm audit --omit=dev`) and fail closed on corrupt timelapse/energy JSON the same way grow JSON already does.

**Finding counts:**

| Critical | High | Medium | Low | Informational |
|----------|------|--------|-----|---------------|
| 0 | 1 | 10 | 9 | 3 |

**Human-in-the-loop:** F-001 and any change to cookies, hashing, Docker networking, or Cloudflare trust must be reviewed by a human before implementation or closure.

**Later on this branch (`fb80cf1`):** the F-001 body-clone / missing-`Content-Length` / global 40 MB proxy window is addressed (1 MB clone, fail-closed CL, media route cap). Plugin videos are size-capped (512 MiB) but still fully buffered. Treat this file as the `d306b2e` assessment, not a live HEAD report. See `docs/audit-2026-08-25/README.md` for the High-remediation map.

---

## 2. Scope, methodology, standards, limitations

### 2.1 Scope

**In scope:**

- Local git repository `/Users/marcel/WebstormProjects/growcastdev`
- Branch `GrowCast-GGS` at `d306b2e`
- Application source, Docker/Compose, tests, lockfile, logging, documented Cloudflare Tunnel deploy path in `README.md`
- First-party mesh HTTP contracts (allowlisted plugin IDs)

**Out of scope:**

- Live production hosts (including `grow.0xmarcel.com`), Cloudflare account/WAF/Access, `cloudflared` ingress YAML (not in repo)
- MediaMTX, cameras, Spider Farmer GGS hardware, and plugin source under `extensions/GrowCast-*` (gitignored; GGS image not reviewed)
- Offensive testing, payloads, credential stuffing, or any traffic to running systems
- Formal certification (SOC 2 / ISO attestation)

**Environments / repos / branches:**

- Repo: GrowCast (this workspace)
- Constraints: read-only review; no production probing; secrets redacted (`***REDACTED***`)

**Threat model (operator intent):** Single tenant; public journal is intentional; origin must not be internet-reachable except through Cloudflare Tunnel; GGS sidecar on the Compose network is a trusted plugin.

### 2.2 Methodology

1. Authorization and scope confirmation (owner-requested `/security-audit` on this repo)
2. Asset inventory and trust-boundary mapping
3. Lightweight STRIDE per boundary
4. Layered control assessment (web/API, container/Compose, supply chain, logging)
5. Six independent read-only tracks (authz, validation/files, secrets/crypto, supply chain, infra/tunnel, logging/exceptions) plus direct file review
6. Skeptical merge: High claims from tracks were re-read in source; several integrity issues were **downgraded** (admin-only races, file-corruption prerequisites)
7. Risk analysis and structured reporting

### 2.3 Standards used

- OWASP Top 10:2025
- OWASP ASVS 5.0.x (L1/L2 as applicable for a self-hosted journal)
- NIST CSF 2.0
- CIS Controls v8.1 / CIS Docker Benchmark themes
- Zero Trust (NIST SP 800-207) themes
- ISO 27001:2022 (8.25–8.29)
- CWE (specific IDs where confident)

### 2.4 Limitations

- Cloudflare Tunnel runtime (whether CF strips client-supplied `CF-Connecting-IP`, WAF rules, Access policies) was **not** inspected.
- `npm audit` was run locally; no container image scan or secret-scanner binary was executed.
- Absence of a finding is not a guarantee of security.
- No exploitation or destructive testing was performed.
- Prior assessment `docs/security-assessment-2026-08-21.md` is historical; this report reflects current code only.

---

## 3. Findings summary

| ID | Severity | Title | Primary mapping | Asset / component |
|----|----------|-------|-----------------|-------------------|
| F-001 | High | Unauthenticated media/body buffering can exhaust origin memory | OWASP A06 / A10, CWE-400 | Public media, `proxy.ts` |
| F-002 | Medium | Forwarded-header trust is an env flag, not an authenticated hop | OWASP A02, CWE-348 | `request-trust.ts`, Compose |
| F-003 | Medium | In-memory sessions/lockouts; `scryptSync` on the event loop | OWASP A07, CWE-307/770 | `admin-auth.ts` |
| F-004 | Medium | scrypt hash omits cost parameters | OWASP A04, CWE-916 | `admin-credentials.ts` |
| F-005 | Medium | Timelapse/energy JSON fail-open (paused defaults to false) | OWASP A10, CWE-755 | `timelapse-settings.ts` |
| F-006 | Medium | Archive complete can succeed when live reset fails; CAS skippable | OWASP A08 / A10 | `archives.ts` |
| F-007 | Medium | No CI/SCA/SBOM; floating image tags | OWASP A03 / A08 | Repo / Docker |
| F-008 | Medium | CSP `'unsafe-inline'` and broad `frame-src` / `connect-src` | OWASP A02 / A05 | `next.config.ts` |
| F-009 | Medium | Container starts as root; CIS runtime controls missing | OWASP A02, CIS Docker | Dockerfile, Compose |
| F-010 | Medium | `/admin` discloses setup diagnostic warnings | OWASP A02, CWE-200 | `admin/page.tsx` |
| F-011 | Medium | Detection gaps: no `onRequestError`, energy logs lack `event`, no log sink | OWASP A09 | logging, Compose |
| F-012 | Low | `GROWCAST_PUBLIC_URL` unset; Host/proto reconstruction | OWASP A02 | `request-trust.ts` |
| F-013 | Low | HSTS sent on the HTTP origin | OWASP A02 | `next.config.ts` |
| F-014 | Low | Mesh token has no minimum length | OWASP A07, CWE-521 | `mesh-auth.ts` |
| F-015 | Low | Stream iframe has no `sandbox`; CSP allows any `http(s)` frame | OWASP A05 | `page.tsx` |
| F-016 | Low | Markdown URL transform residual (`/\`, unbounded notes) | OWASP A05 | `url-policy.ts` |
| F-017 | Low | Portable PNG upload stores original bytes | OWASP A08 | `image-encode.ts` |
| F-018 | Low | `.env.development` / `.env.production` not gitignored | OWASP A02 | `.gitignore` |
| F-019 | Low | Transitive `nanoid` advisory in production lockfile | OWASP A03 | `package-lock.json` |
| F-020 | Informational | No MFA / Cloudflare Access in repo | OWASP A07 | Auth design |
| F-021 | Informational | GGS sidecar talks HTTP on the Compose network | OWASP A02 | `docker-compose.yml` |
| F-022 | Informational | Logging doc still claims `X-Forwarded-For` for `client_ip` | OWASP A09 | `docs/logging.md` |

---

## 4. Detailed findings

### [High] F-001: Unauthenticated media/body buffering can exhaust origin memory

- **Asset / Component:** `lib/open-media-file.ts`, `app/api/timelapse/route.ts`, `lib/public-media-http.ts`, `lib/archive-media-http.ts`, `proxy.ts`, `next.config.ts` (`proxyClientMaxBodySize`)
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A06:2025 (Insecure Design), A10:2025 (Mishandling of Exceptional Conditions); ASVS V5 File Handling, V4 API; CWE-400, CWE-770; NIST PR.IR / DE; ISO 8.26
- **Description:** Public GETs for snapshots, dashboard/setup pictures, archive media, and `latest_timelapse.mp4` call `readFile` and return `new Uint8Array(opened.buffer)`. Uploads are capped at 15 MiB, but **plugin timelapse/snapshots are not**. Concurrent unauthenticated GETs through the tunnel therefore copy whole videos into the Node heap with no Range support.

  Independently, `proxy.ts` rejects oversize bodies only when `Content-Length` is present and greater than the cap (`contentLengthExceedsCap` returns false for a missing header). `proxyClientMaxBodySize` is **40 MB globally**, while the 1 MB default cap applies only when `Content-Length` is sent. `POST /api/admin/media` is allowed 40 MB **before** authentication.

- **Evidence (concrete, redacted):** `open-media-file.ts` ~58–59 and ~80; `app/api/timelapse/route.ts` ~19–24; `request-body-limit.ts` ~26–34 and tests asserting `contentLengthExceedsCap(null, …) === false`; `next.config.ts` ~36–40.
- **Impact (technical + business):** A visitor (or crawler) can stall or OOM the single GrowCast process. The public journal, admin panel, and mesh ingest share that process. Cloudflare DDoS/WAF may reduce volume but does not stream the file for the origin.
- **Recommendation (high-level, prioritized):** Stream files from disk with a max size; add HTTP Range for mp4; 413 over a configured limit. Reject missing `Content-Length` on JSON POSTs or cap after read. Keep 40 MB only on authenticated media POST. Consider Cloudflare cache/size limits as defense in depth, not the primary control.
- **Residual risk / retest notes:** Human review before changing proxy body limits (may break large admin uploads). Retest: request a large timelapse and a POST without `Content-Length`; confirm bounded memory and 413. **Confidence:** High.

---

### [Medium] F-002: Forwarded-header trust is an env flag, not an authenticated hop

- **Asset / Component:** `lib/request-trust.ts`, `docker-compose.yml`, `lib/admin-auth.ts` (`shouldUseSecureCookie`)
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A02:2025; ASVS V12 Secure Communication, V13 Configuration; CWE-348; CIS Network; NIST SP 800-207 (authenticate the hop); ISO 8.27
- **Description:** Compose always sets `GROWCAST_TRUST_PROXY=1`. `extractClientIp` then honors `CF-Connecting-IP` else `X-Real-IP` (must pass `net.isIP`). `X-Forwarded-For` is **not** used in code. There is no check that the TCP peer is `cloudflared` (no mTLS, no authenticating proxy token). Inside the container the process still binds `0.0.0.0:3000`; the **host** publish is loopback only.

  `shouldUseSecureCookie` does **not** require `GROWCAST_TRUST_PROXY`: `X-Forwarded-Proto: https` or a plausible `CF-Connecting-IP` forces `Secure`. Compose does not set `COOKIE_SECURE`.

- **Evidence:** `request-trust.ts` ~39–64, ~80–99; `docker-compose.yml` ports `127.0.0.1:${GROWCAST_PORT:-3000}:3000` and `GROWCAST_TRUST_PROXY: "1"`; tests in `tests/logging/http.test.ts`.
- **Impact:** While the documented loopback mapping holds, internet clients cannot spoof these headers. Anyone who can open TCP to the origin (other Compose services, or an operator who publishes `0.0.0.0:3000`) can choose login-rate-limit and mesh-throttle identities, exhaust per-client SSE slots, or flip the Secure cookie flag. This is not an authentication bypass by itself.
- **Recommendation:** Keep loopback publish as a tested invariant. Set `COOKIE_SECURE=1` for the tunnel path. Gate Secure/proto/host reconstruction on the same trust as IPs. Prefer authenticating the proxy hop if the origin is ever reachable from more than `cloudflared` + GGS.
- **Residual risk / retest notes:** Cloudflare account config is out of repo. Retest: with `GROWCAST_TRUST_PROXY` unset, spoofed `CF-Connecting-IP` must not become `client_ip`; Compose file must still match the loopback regex in `tests/logging/http.test.ts`. Human review for networking changes. **Confidence:** High on code; Medium on live tunnel header behavior.

---

### [Medium] F-003: In-memory sessions/lockouts; `scryptSync` on the event loop

- **Asset / Component:** `lib/admin-auth.ts`, `lib/admin-session-store.ts`, `lib/mesh-throttle.ts`
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A07:2025; ASVS V6 Authentication, V7 Session; CWE-307, CWE-400, CWE-613, CWE-770; NIST PR.AA
- **Description:** Admin sessions and login attempts are `Map`s on `globalThis` (correctly shared across Server Action vs Route bundles). TTL is 24 hours absolute; no idle timeout; new login does not revoke prior SIDs; maps are unbounded. Logout deletes the current SID. Restart logs everyone out.

  Login allows 10 attempts / 15 minutes per identity, then a 15-minute block. There is **no process-wide** login ceiling. Each allowed attempt runs `scryptSync` on the request thread (Node default cost). Mesh auth failures are throttled 8 then 429/60s per identity, also an unbounded `Map`.

- **Evidence:** `admin-auth.ts` ~183–227, ~326–360, ~372–388; `admin-session-store.ts`; `mesh-throttle.ts` ~12–36; `admin-credentials.ts` ~45 (`scryptSync`).
- **Impact:** Fits documented single-node Docker. Stolen cookies remain valid until 24h, logout of that SID, or restart. Distinct identities (real CF IPs, or spoofed IPs if F-002 applies) can each pay 10 scrypts per window and stall the dashboard. Multi-instance deploy would split sessions (fail-closed, not fail-open).
- **Recommendation:** Process-wide login ceiling; cap/prune maps; async scrypt or worker; revoke other SIDs on login; optional idle timeout. Persist sessions only if you outgrow one process.
- **Residual risk / retest notes:** Human review before changing session storage. **Confidence:** High.

---

### [Medium] F-004: scrypt hash omits cost parameters

- **Asset / Component:** `scripts/admin-creator.mjs`, `lib/admin-credentials.ts`
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A04:2025; ASVS V11 Cryptography, V6; CWE-916; NIST PR.DS; ISO 8.28
- **Description:** Setup hashes with 16-byte CSPRNG salt and `scryptSync(password, salt, 64)`. Stored form is `scrypt$<salt>$<hash>` with **no N/r/p**. Verify uses Node defaults (`N=16384`, `r=8`, `p=1`). Cost cannot be raised without breaking existing hashes. Username and password checks both run (no verify short-circuit); compares use `timingSafeEqual`.
- **Evidence:** `admin-creator.mjs` ~147–155; `admin-credentials.ts` ~28–80.
- **Impact:** Weaker than current OWASP interactive scrypt guidance (`N=2^17`). Not an observed bypass. Combined with F-003, login hashing is a CPU DoS amplifier.
- **Recommendation:** PHC-style string recording N/r/p/keylen; raise cost; prefer async `scrypt` or Argon2id; one-shot rehash via `setup:admin`. Human review of crypto.
- **Residual risk / retest notes:** Existing hashes must migrate. **Confidence:** High.

---

### [Medium] F-005: Timelapse/energy JSON fail-open (paused defaults to false)

- **Asset / Component:** `lib/timelapse-settings.ts`, `lib/energy/settings.ts`, `lib/mesh-http.ts`, `app/admin/page.tsx`
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A10:2025; ASVS V2 Business Logic, V16; CWE-755; NIST PR.DS
- **Description:** `getCurrentGrow()` seeds `EMPTY_GROW` only on `ENOENT` and **throws** on parse/IO errors (good). Timelapse settings do the opposite: any non-`ENOENT` error returns `createRecord(DEFAULT_TIMELAPSE_SETTINGS)` with **no log and no disk rewrite**. Defaults include `paused: false`. Mesh `GET /api/mesh/growcast.timelapse` therefore 200s “not paused” if the file is corrupt. Admin Settings loads the same object; **Save Changes** persists those defaults over the real file.

  Energy settings: parse/IO errors log `invalid_energy_settings` once per process then return empty tariffs; a later save can persist blanks.

  Timelapse writes use `${file}.${pid}.tmp` rather than `atomicWriteFile`’s random suffix.

- **Evidence:** `timelapse-settings.ts` ~41–50, ~165–184; `energy/settings.ts` ~120–135; contrast `db.ts` ~245–255.
- **Impact:** A corrupt settings file can tell the timelapse sidecar to resume capturing (privacy of a home camera) and can wipe tariffs on the next admin save. Not remotely triggerable without write/corruption of `data/`.
- **Recommendation:** Fail closed like grow JSON (admin banner / 5xx / mesh 503). Log errno. Persist defaults only on `ENOENT`. Use `atomicWriteFile`.
- **Residual risk / retest notes:** Retest corrupt JSON must not be served as defaults. **Confidence:** High.

---

### [Medium] F-006: Archive complete can succeed when live reset fails; CAS skippable

- **Asset / Component:** `lib/archives.ts`, `app/admin/actions.ts`, `lib/admin/parse-grow-form.ts`
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A08:2025, A10:2025; ASVS V2; CWE-362, CWE-755
- **Description:** After `rename` publishes `data/archives/<id>/`, failure of `reset(grow)` is swallowed as `{ok: true, warning: "reset_failed"}`. `completeGrowAction` always logs `admin.grow.archived` **without** `warning`. The UI can show a warning; the security channel looks clean.

  Stale-id check is `if (input.expectedGrowId && …)`. The complete form includes hidden `growId`, but an empty/omitted field **skips CAS**. `saveAdminSettings` fails closed if `expectedGrowId` is missing. Two overlapping completes are not serialized.

- **Evidence:** `archives.ts` ~319–367; `actions.ts` ~72–101; `parse-grow-form.ts` ~115–122; UI always sends `growId` in `complete-grow-panel.tsx`.
- **Impact:** Authenticated operator (or two tabs) can publish an archive while the live grow still shows the same run; retry hits `already_archived`; live media cleanup is skipped. Public journal integrity, not unauthenticated rewrite.
- **Recommendation:** Require `expectedGrowId`; treat reset failure as error; log `warning` on the security event; serialize complete/save (same idea as energy accrue lock).
- **Residual risk / retest notes:** Known leftover vs 2026-08-22 H-12 (same-grow two-tab LWW). **Confidence:** High.

---

### [Medium] F-007: No CI/SCA/SBOM; floating image tags

- **Asset / Component:** repository (no `.github/`), `Dockerfile`, `docker-compose.yml`, `package.json`
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A03:2025, A08:2025; CIS Application Software Security; ISO 8.25 / 8.29; NIST GV / ID
- **Description:** No GitHub Actions, Dependabot/Renovate, or SBOM. `qodana.yaml` is a stub, not a gate. README install uses `npm install`; Docker correctly uses `npm ci`. Base image is `FROM node:24-alpine` (no digest); Compose `image: 0xmrcl/growcast:latest`. Manifest versions use carets; lockfile is committed (good).
- **Evidence:** `.github/` absent; `Dockerfile` line 1; `docker-compose.yml` line 3; `package.json` scripts.
- **Impact:** Vulnerable or untested changes can ship; Hub `:latest` and floating Alpine tags can change under the operator.
- **Recommendation:** Workflow with `npm ci`, `npm test`, `npm run lint`, `npm audit --omit=dev`; pin digests; Dependabot; SBOM at image build.
- **Residual risk / retest notes:** See F-019 for current audit output. **Confidence:** High.

---

### [Medium] F-008: CSP `'unsafe-inline'` and broad `frame-src` / `connect-src`

- **Asset / Component:** `next.config.ts`
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A02:2025, A05:2025; ASVS V3 Web Frontend; CWE-79, CWE-829
- **Description:** `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com`; `style-src 'self' 'unsafe-inline'`; `connect-src 'self' https:`; `frame-src 'self' https: http:` (comment: LAN MediaMTX). App layout does not load Cloudflare Insights (edge injection). No nonce/hash in `proxy.ts`. Other headers are present: `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, Referrer-Policy, Permissions-Policy, HSTS.
- **Evidence:** `next.config.ts` ~8–21, ~41–70.
- **Impact:** Any future HTML injection becomes immediately executable. `connect-src https:` allows browser exfil to any HTTPS origin. `frame-src http:` is intentional for HLS and remains wide. Current markdown path does not enable raw HTML (`react-markdown` without `rehype-raw`).
- **Recommendation:** Nonces/hashes for first-party scripts; tighten `connect-src`/`frame-src` to known MediaMTX/tunnel hosts when the stream URL is configured.
- **Residual risk / retest notes:** Next.js inline runtime often needs a nonce pipeline. **Confidence:** High.

---

### [Medium] F-009: Container starts as root; CIS runtime controls missing

- **Asset / Component:** `Dockerfile`, `docker-entrypoint.sh`, `docker-compose.yml`
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A02:2025; CIS Docker 4.1, 5.3–5.5; CWE-250; ASVS V13; NIST PR.PS
- **Description:** Image creates `growcast` uid 1001 but has **no** `USER` instruction. Entrypoint runs as root to `chown -R` data/media/timelapse binds, then `su-exec`. No `HEALTHCHECK`, `cap_drop`, `no-new-privileges`, `read_only`, pids limit, or Compose log rotation. Recursive `chown` changes **host** ownership of those trees to 1001:1001. GGS `.env` is correctly **not** mounted into the web container.
- **Evidence:** `Dockerfile` ~17–47; `docker-entrypoint.sh` ~6–14; Compose volumes ~18–24.
- **Impact:** Privilege drop after start is real. Overriding the entrypoint keeps root. Compromised app user can rewrite published journal/media. `depends_on: growcast` does not wait for readiness.
- **Recommendation:** `cap_drop: ALL` + `no-new-privileges`; pin digests (F-007); `HEALTHCHECK`; json-file `max-size`; document host UID instead of `chown -R` where possible. Human review of infra.
- **Residual risk / retest notes:** Bind-mount UID mismatch is the reason root start exists. **Confidence:** High.

---

### [Medium] F-010: `/admin` discloses setup diagnostic warnings

- **Asset / Component:** `lib/admin-auth.ts` `getAdminSetupStatus`, `app/admin/page.tsx`, `app/admin/login-form.tsx`
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A02:2025; ASVS V13, V14; CWE-200; NIST PR.AA
- **Description:** Unauthenticated visitors to `/admin` receive the full `warnings` list when login is disabled: missing `ADMIN_USERNAME` / `ADMIN_PASSWORD_HASH` / `ADMIN_SESSION_SECRET`, placeholders (`change-me` / `generate-me`), secret shorter than 32 characters, hash not `scrypt$…`. Login is correctly disabled until warnings are empty. Values themselves are not shown.
- **Evidence:** `admin-auth.ts` ~74–116; `admin/page.tsx` ~27–34; `login-form.tsx` ~46–55.
- **Impact:** Public recon of whether admin auth is disabled and **why**. Helps time setup or distinguish misconfiguration from lockout. Does not grant access.
- **Recommendation:** Generic “login unavailable” in the UI; detailed warnings only in server logs.
- **Residual risk / retest notes:** Retest unauthenticated `/admin` with incomplete env. **Confidence:** High.

---

### [Medium] F-011: Detection gaps: no `onRequestError`, energy logs lack `event`, no log sink

- **Asset / Component:** `instrumentation.ts`, `lib/energy/log.ts`, `lib/logging/**`, `docker-compose.yml`, `docs/logging.md`
- **OWASP / ASVS / CWE / CIS / NIST / ISO mapping:** OWASP A09:2025; ASVS V16; NIST DE; CIS Audit Log Management; ISO 8.16 (awareness)
- **Description:** Structured Pino JSON, redaction path list, and a security-event catalog exist (strength). `instrumentation.ts` only logs `app.start` — no `onRequestError`. RSC pages call `getCurrentGrow()` outside `withRequestLog`, so corrupt grow JSON 500s via Next without `event:error.unhandled`. `logEnergy()` writes `{reason}` **without** `event` or `channel:security`, so documented alert queries miss `corrupt_energy_cursor`. Compose has no logging driver/rotation/webhook. `sanitizeError` attaches stacks in production. Admin mutation success logs omit `growId` and archive `warning`.
- **Evidence:** `instrumentation.ts`; `energy/log.ts`; `docs/logging.md` example alerts; `redact.ts` `sanitizeError` ~53–62; `actions.ts` `logAdminGrowArchived` without warning.
- **Impact:** Brute-force, mesh failures, and disk corruption will not page anyone on the documented Docker path. Forensics on “what changed” are thin.
- **Recommendation:** Next `onRequestError` → sanitized `error.unhandled`; stable `event` on energy logs; json-file rotation; log `growId`/`warning`; drop stacks unless debug.
- **Residual risk / retest notes:** Alerting remains an operator duty even after code fixes. **Confidence:** High.

---

### [Low] F-012: `GROWCAST_PUBLIC_URL` unset; Host/proto reconstruction

- **Asset / Component:** `lib/request-trust.ts` `publicRequestOrigin`, `lib/share-card.ts`, `app/layout.tsx`
- **OWASP / ASVS / CWE mapping:** OWASP A02; ASVS V12; CWE-601 / CWE-348
- **Description:** Absolute OG/metadata URLs use `publicRequestOrigin`. Host wins over spoofed `X-Forwarded-Host` when Host is already the tunnel name (tested). Compose does not set `GROWCAST_PUBLIC_URL`. Next Server Actions have no `allowedOrigins` pin.
- **Impact:** Host-header influence on share-card / canonical origin if the origin is reachable off-loopback. CSRF still prefers `Sec-Fetch-Site`.
- **Recommendation:** Set `GROWCAST_PUBLIC_URL=https://<tunnel-hostname>`; set `serverActions.allowedOrigins` to that host.
- **Residual risk / retest notes:** `tests/request-trust.test.ts`, `tests/share-card.test.ts`. **Confidence:** High on code; Medium on impact given loopback.

---

### [Low] F-013: HSTS sent on the HTTP origin

- **Asset / Component:** `next.config.ts` headers
- **OWASP / ASVS / CWE mapping:** OWASP A02; ASVS V12; CWE-319
- **Description:** Every `/:path*` response sets `Strict-Transport-Security: max-age=31536000; includeSubDomains`. CSP **omits** `upgrade-insecure-requests` because Compose origin is HTTP. Browsers ignore HSTS on plaintext; if a proxy forwards the header on HTTPS, clients pin HTTPS (and `includeSubDomains`) for that hostname.
- **Recommendation:** Emit HSTS only when the public request is HTTPS (trusted proto or `GROWCAST_PUBLIC_URL`).
- **Residual risk / retest notes:** Tunnel HTTPS + HSTS is desirable for the public name. **Confidence:** High.

---

### [Low] F-014: Mesh token has no minimum length

- **Asset / Component:** `lib/mesh-auth.ts`, `scripts/admin-creator.mjs`
- **OWASP / ASVS / CWE mapping:** OWASP A07; ASVS V6; CWE-521
- **Description:** Mesh auth is fail-closed if `GROWCAST_MESH_TOKEN` is unset (strength). Any non-empty string is accepted. `setup:admin` does not generate the token. Next dotenv expands `$` except the password hash is escaped; Compose `env_file` uses `format: raw`.
- **Impact:** A short operator-chosen token is the only secret for ingest and plugin settings. Fail-closed itself is correct.
- **Recommendation:** Enforce min length (e.g. 32) at boot; mint in `setup:admin` if missing; escape `$` like the hash.
- **Residual risk / retest notes:** `tests/security.test.ts` fail-closed cases. **Confidence:** High.

---

### [Low] F-015: Stream iframe has no `sandbox`; CSP allows any `http(s)` frame

- **Asset / Component:** `app/(site)/page.tsx`, `lib/url-policy.ts`
- **OWASP / ASVS / CWE mapping:** OWASP A05; ASVS V3; CWE-1021
- **Description:** `streamUrl` is restricted to `http`/`https` without userinfo at save and render. The iframe has no `sandbox`; `allow` includes `clipboard-write` and `web-share`.
- **Impact:** A malicious or mistyped stream origin runs as a full third-party frame on the public dashboard. Not XSS in GrowCast’s origin.
- **Recommendation:** Tight `sandbox` compatible with MediaMTX; constrain `frame-src` to configured hosts.
- **Residual risk / retest notes:** Operator-controlled URL. **Confidence:** High.

---

### [Low] F-016: Markdown URL transform residual (`/\`, unbounded notes)

- **Asset / Component:** `lib/url-policy.ts`, `app/(site)/page.tsx`, `lib/admin/parse-grow-form.ts`
- **OWASP / ASVS / CWE mapping:** OWASP A05; ASVS V1 / V2; CWE-79, CWE-601
- **Description:** `javascript:` / `data:` / `//` are stripped (tested). Relative URLs starting with `/` allow `/\example.com` (some parsers treat `\` as `/`). `https:` links have no host allowlist. Note/setup fields have no max length (GGS ingest does cap strings). `react-markdown` v10 without `rehype-raw` does not interpret raw HTML.
- **Recommendation:** Reject `\`, controls, and overlong notes; allowlist markdown elements; `rel="noopener noreferrer"` on `a`.
- **Residual risk / retest notes:** `tests/security.test.ts` markdown cases. **Confidence:** Medium–High.

---

### [Low] F-017: Portable PNG upload stores original bytes

- **Asset / Component:** `lib/image-encode.ts`
- **OWASP / ASVS / CWE mapping:** OWASP A08; ASVS V5; CWE-434
- **Description:** Magic-byte sniff + dimension cap. JPEG/WebP are decoded and re-encoded; PNG on the portable (no-Sharp) path returns original bytes. Sharp path re-encodes to WebP. Serve uses extension + global `nosniff`.
- **Impact:** Extra PNG chunks/polyglot survive without Sharp. Classic content-sniff XSS is unlikely with `nosniff`.
- **Recommendation:** Always re-encode PNG (or convert to WebP) on the portable path.
- **Residual risk / retest notes:** Alpine image includes Sharp. **Confidence:** High.

---

### [Low] F-018: `.env.development` / `.env.production` not gitignored

- **Asset / Component:** `.gitignore` vs Next env loading
- **OWASP / ASVS / CWE mapping:** OWASP A02; ASVS V13; CWE-540
- **Description:** Ignored: `.env`, `.env.local`, `.env*.local`, `.env.local.bak.*`. Next also auto-loads `.env.development`, `.env.production`, `.env.test`. Dockerignore is stricter (`.env.*`). No committed `.env.example`.
- **Recommendation:** Ignore `.env*` except a secret-free `.env.example`.
- **Residual risk / retest notes:** No such files were found committed. **Confidence:** High.

---

### [Low] F-019: Transitive `nanoid` advisory in production lockfile

- **Asset / Component:** `package-lock.json` via `postcss`
- **OWASP / ASVS / CWE mapping:** OWASP A03; CIS Continuous Vulnerability Management
- **Description:** `npm audit --omit=dev` reports **1 High**: `nanoid` &lt; 3.3.18, “custom generators can loop indefinitely when size is zero” (GHSA-2v37-7h3g-55p8). Locked version is 3.3.16. Full `npm audit` also reports unrelated **dev** issues (`@babel/core` arbitrary file read via sourceMappingURL, `brace-expansion` / `js-yaml` DoS). No Critical. `next@16.2.12` is **outside** GHSA-6gpp-xcg3-4w24 (&lt; 16.2.11).
- **Impact:** GrowCast does not call `customAlphabet` with attacker-controlled size; PostCSS uses `nanoid/non-secure` for CSS IDs. Hygiene, not a demonstrated app bug.
- **Recommendation:** Override `nanoid` to `>=3.3.18`; keep `npm audit --omit=dev` in CI (F-007).
- **Residual risk / retest notes:** Re-run `npm audit --omit=dev` after the bump. **Confidence:** High (version vs advisory); Low (exploitability here).

---

### [Informational] F-020: No MFA / Cloudflare Access in repo

- **Asset / Component:** Admin login
- **OWASP / ASVS mapping:** OWASP A07; ASVS V6
- **Description:** Single password (min 12 at setup). No TOTP, WebAuthn, or Cloudflare Access policy in-repo. Acceptable for a personal tunnel journal; not for a shared/high-value admin.
- **Recommendation:** Optional Cloudflare Access on `/admin` as the highest-leverage MFA without app changes.
- **Residual risk / retest notes:** Out of repo. **Confidence:** High.

---

### [Informational] F-021: GGS sidecar talks HTTP on the Compose network

- **Asset / Component:** `docker-compose.yml` `ggs` profile
- **OWASP mapping:** A02
- **Description:** GGS uses `GROWCAST_URL: http://growcast:3000` and its own `env_file`. No GGS ports published. Mesh Bearer therefore crosses the Compose network in cleartext. Sidecar image is not in this repo.
- **Recommendation:** Keep GGS off published ports; do not attach untrusted services to that network.
- **Residual risk / retest notes:** Plugin internals out of scope. **Confidence:** High for Compose; N/A for GGS code.

---

### [Informational] F-022: Logging doc still claims `X-Forwarded-For` for `client_ip`

- **Asset / Component:** `docs/logging.md` ~81 vs `lib/request-trust.ts`
- **OWASP mapping:** A09
- **Description:** Docs say `client_ip` comes from CF, else first `X-Forwarded-For`, else `X-Real-IP`. Code ignores `X-Forwarded-For`.
- **Recommendation:** Align the table with `extractClientIp`.
- **Residual risk / retest notes:** Documentation only. **Confidence:** High.

---

## 5. Positive observations / strengths

- **Documented tunnel path matches code:** Compose publishes loopback only; `GROWCAST_TRUST_PROXY=1`; tests lock that mapping and reject mounting the whole `extensions/` tree.
- **Admin mutations are server-authorized:** `requireAdmin()` / `isAdminAuthenticated()` on grow save, complete, archive edit/delete, and media POST. Media POST and logout also use `isSameOriginRequest` (`Sec-Fetch-Site` first). Relative 303s avoid `http://0.0.0.0` cookie drops.
- **Mesh fail-closed:** Missing `GROWCAST_MESH_TOKEN` denies; constant-time compare; unknown plugin IDs 404; ingest schema allowlist rejects credential keys (`mqttPwd`, …); public live view strips `serial`; private energy tariff is cookie-gated.
- **Password storage:** scrypt + per-password salt; no plaintext `ADMIN_PASSWORD`; placeholders `change-me` / `generate-me` disable login; `setup:admin` writes `0o600` and CSPRNG session secret.
- **Media path traversal is real:** safe filename, `dirname === root`, symlink `lstat` reject, `realpath` containment; client names never reach the filesystem.
- **No server-side fetch of operator URLs** (no classic SSRF from `streamUrl`).
- **Grow JSON integrity improved vs 2026-08-21:** `EMPTY_GROW` only on `ENOENT`; parse errors throw; `atomicWriteFile` for grow JSON; CAS on settings save.
- **Secrets hygiene:** `.env*` local files gitignored; Dockerignore excludes `.env`, `data`, media, extensions; GGS `.env` not in the web container.
- **Security logging catalog** with redaction paths and correlation IDs from `proxy.ts` (`X-Request-ID`).
- **Lockfile committed**; Docker `npm ci`; Next 16.2.12 is past the 16.2.11 proxy GHSA; jpeg-js on patched 0.4.4.
- **Plugins are not dynamically `require`d** — allowlisted HTTP contracts only.

---

## 6. Residual risk and prioritized roadmap

### 6.1 Residual risk statement

After implementing P0/P1 below, residual risk for a **single-operator Cloudflare Tunnel journal** is expected to be **low–moderate**: remaining issues are session process-localism, CSP tightness, container CIS hardening, and operator Cloudflare account configuration (out of repo). Unmitigated: no MFA, no at-rest encryption of `data/`, no professional pen test, GGS plugin internals not reviewed. If the origin is published on all interfaces, F-002 becomes a **practical High**.

### 6.2 Prioritized roadmap

| Priority | Action | Addresses | Owner suggestion | Target |
|----------|--------|-----------|------------------|--------|
| P0 | Stream/size-cap public media; cap bodies after read; 40 MB only on authenticated media POST | F-001 | App | Before calling the origin “production” |
| P0 | Set `COOKIE_SECURE=1` and `GROWCAST_PUBLIC_URL=https://<host>` in Compose; do not change loopback `ports` | F-002, F-012 | Operator + app | Same |
| P1 | Fail closed on corrupt timelapse/energy JSON; log archive `warning`; require complete CAS | F-005, F-006 | App | Next hardening pass |
| P1 | CI: `npm ci`, test, lint, `npm audit --omit=dev`; override `nanoid` | F-007, F-019 | App | Same |
| P1 | Generic `/admin` unavailable message; process-wide login ceiling | F-010, F-003 | App | Same |
| P2 | PHC scrypt / async hash; SID revoke on login; mesh token min length | F-004, F-003, F-014 | App (HITL crypto) | Planned |
| P2 | CSP nonces; iframe sandbox; `onRequestError` + energy `event` | F-008, F-015, F-011 | App | Planned |
| P2 | `cap_drop`, healthcheck, pin image digests, log rotation | F-009, F-007 | Operator | Planned |
| P3 | Ignore extra `.env*` names; always re-encode PNG; HSTS only on HTTPS | F-018, F-017, F-013 | App | Backlog |

### 6.3 Human-in-the-loop

The following require human design/security review before implementation or closure:

- F-001 (proxy/body/media streaming — can break uploads)
- F-002 / F-012 (cookie Secure, public URL, Docker ports)
- F-003 / F-004 (session store and password hashing)
- F-009 (container user / capabilities)
- Any Cloudflare Access / WAF change (out of repo)

### 6.4 External testing

[x] Recommend professional third-party penetration testing: **Optional, not required for this risk class.**

Rationale: single-tenant homelab journal, no payments, no multi-user identity, no PII store beyond a public grow diary. Independent testing is warranted if you add multi-tenant users, payments, or treat the admin panel as high-value (legal/medical/commercial). Cloudflare Access on `/admin` is a cheaper control than a full pen test.

### 6.5 Retest notes

- F-001: large public mp4 GET and POST without `Content-Length` stay within a documented memory/time budget; media upload of two 15 MiB images still succeeds.
- F-002: `GROWCAST_TRUST_PROXY` unset → spoofed CF IP ignored; Compose test still matches loopback publish.
- F-005: corrupt `data/mesh/growcast.timelapse.json` → mesh 5xx or explicit error, not `paused: false`.
- F-006: reset failure → security log is not a clean `admin.grow.archived`; omitted `growId` → stale/error, not skip.
- F-007: PR pipeline red on test failure and on High production advisories.
- F-010: unauthenticated `/admin` does not list env var names.

---

## 7. Compliance mapping notes

| Framework | Relevant findings / gaps | Notes |
|-----------|--------------------------|-------|
| NIST CSF 2.0 | GV/ID: no CI/SCA (F-007); PR: auth/session/container (F-002–F-004, F-009); DE: alerting (F-011); RS/RC: operator runbooks only | Mapping aid, not an attestation |
| CIS Controls v8.1 | 16 Application Software Security (F-007, F-001); 6 Access Control (F-003, F-020); 8 Audit Log (F-011); 4 Secure Configuration (F-008, F-009) | Docker Benchmark themes on F-009 |
| ISO 27001:2022 | 8.25–8.29 SDLC/testing (F-007); 8.26 requirements (F-001, F-005); 8.28 coding (F-004, F-008) | |
| Zero Trust (SP 800-207) | Tunnel as edge is aligned; hop not authenticated (F-002); east-west GGS HTTP (F-021) | |
| Other | OWASP Top 10:2025 mapped per finding; no LLM/mobile/MASVS in scope | |

This section is a **mapping aid**, not a formal certification.

---

## 8. Appendices

### A. Asset inventory (summary)

| Asset | Type | Data sensitivity | Trust boundary notes |
|-------|------|------------------|----------------------|
| GrowCast Next.js app | Web / API | Public journal; admin session; private kWh tariff | Origin HTTP on loopback; public HTTPS via tunnel |
| Admin panel `/admin` | Identity / admin | Password hash, session HMAC | Cookie `HttpOnly` `SameSite=lax`; scrypt |
| Mesh API `/api/mesh/*` | Service API | Plugin settings, GGS ingest | Bearer `GROWCAST_MESH_TOKEN`, fail-closed |
| JSON files under `data/` | Data store | Grow notes, energy, live climate | Bind mount; gitignored; no app-level encryption |
| Public media | Files | Grow photos/video | Bind mounts; unauthenticated GET |
| GGS sidecar | Optional plugin | MQTT/cloud credentials in sidecar env | Compose profile `ggs`; not reviewed |
| Timelapse plugin media | Files | Camera stills/mp4 | Mounted into web container |
| Docker image | Supply chain | App + Node 24 Alpine | Floating tags |
| Cloudflare Tunnel | Edge (out of repo) | TLS, optionally WAF/Access | Assumed; not inspected |

### B. STRIDE notes (by boundary)

| Boundary / flow | S | T | R | I | D | E | Notes |
|-----------------|---|---|---|---|---|---|-------|
| Browser → Cloudflare → origin | Header spoof if origin exposed (F-002) | TLS at CF; origin HTTP | Auth events logged | Public journal by design | F-001 memory | Admin cookie | Tunnel is the security perimeter |
| Browser → admin login | Rate limit per IP | HMAC cookie | Login success/fail logged | Warnings leak (F-010) | scrypt CPU (F-003) | Single role | No MFA |
| Browser → public media | N/A | — | Path traversal logged | Photos public | Full-file buffer (F-001) | — | |
| Admin → JSON store | Session | CAS partial (F-006) | Thin audit (F-011) | Private tariff on disk | Fail-open settings (F-005) | Admin is max privilege | Single tenant |
| GGS sidecar → mesh POST | Bearer | Schema allowlist | Ingest logged | Serial stripped on public GET | Ingest 2s + SSE caps | Token = full ingest | Fail-closed |
| Build/CI | — | Floating tags (F-007) | — | `.env` dockerignored | — | No PR gates | A03/A08 |
| Container runtime | Root entrypoint (F-009) | chown binds | stdout logs | GGS env isolated | No healthcheck | su-exec after start | CIS gaps |

### C. Checklists used

- `references/checklists.md` sections: A1–A10, B1, B5–B8, C, D3 (IoT backend awareness for GGS; plugin internals out of scope)
- D1 LLM / D2 mobile: N/A
- CIS Docker Benchmark themes: user, capabilities, healthcheck, image pinning

### D. Tool categories used (defensive / authorized only)

| Category | Tool or process | Notes |
|----------|-----------------|-------|
| SCA / deps | `npm audit`, `npm audit --omit=dev` | Advisory titles only; 1 production High (`nanoid`) |
| Secrets scan | Manual grep + `.gitignore` / `.dockerignore` review | No values printed |
| SAST | Manual code review + existing `tests/security.test.ts` and related | No extra SAST product |
| Config / IaC | Dockerfile, Compose, `next.config.ts` | No cloudflared YAML in repo |
| Manual code/architecture review | Six specialist tracks + orchestrator merge | Read-only |

### E. Relation to prior assessments

| Date | Artifact | Outcome |
|------|----------|---------|
| 2026-08-21 | `docs/security-assessment-2026-08-21.md` | 0 Critical, 1 High (Secure cookie / HTTP LAN), 8 Medium |
| 2026-08-22 | `docs/audit-2026-08-22/` exhaustive workflow | Health 52; later remediations H-01–H-11, H-13 |
| 2026-08-25 | This report | 0 Critical, 1 High (availability buffering), 10 Medium |

**Closed or materially reduced since 2026-08-21:** `X-Forwarded-For` identity; Secure cookie tied only to `NODE_ENV`; all-interface publish; tomato `DEFAULT_GROW` fail-open; media symlink follow on GET; mesh fail-open when token unset.

**Still open in spirit:** in-memory sessions, no CI, root entrypoint, CSP `'unsafe-inline'`, HSTS-on-HTTP, two-tab archive/save races (F-006).

### F. Document control

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-08-25 | Initial assessment of `GrowCast-GGS` @ `d306b2e` (tunnel-first) |
