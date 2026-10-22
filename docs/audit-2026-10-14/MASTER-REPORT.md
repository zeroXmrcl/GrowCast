# GrowCast — Review 14 October 2026

Status: branch `cursor/daily-ai-grow-summary-ab77`, commit `4b8caee`.

Method: parallel, read-only passes (auth, media/mesh, AI summary, climate/energy, broadcast, setup/deploy, public API, dashboard UI). Every finding reported as Critical or High was then re-read in the current code. Without that second confirmation it is not listed as High. The 1,024-agent workflow could not be started in this Cursor session, so coverage is not a claim over every one of the 402 source files.

Production assumption: Docker Compose, bind `127.0.0.1:3000`, Cloudflare Tunnel, `GROWCAST_TRUST_PROXY=1`.

## Summary

Public write paths are closed: admin actions check the session, mesh requires a bearer token and fails closed when none is set, and archive IDs and media filenames are validated. `DEFAULT_GROW` is gone. A missing grow is created empty; broken JSON is no longer replaced with a demo plant.

One confirmed High remains: the `ggs` and `timelapse` containers mount the same `./data` as the app and run as uid 1001, the same user the app drops to after start. Password hash, session secret, and mesh token therefore sit inside the sidecars.

Alongside that: a corrupt climate day is overwritten on the next ingest, missing CO₂/PPFD values can discard the whole paid AI response, the public energy URL switches to the private tariff when an admin cookie is present, and the dashboard still shows an age of thousands of days for the placeholder seed date.

**Health Score: 66 / 100.** Auth, mesh, and the public mutation routes are in good shape. The one High finding sits at the container boundary, and several Medium findings are about data loss and wrong numbers, not an open admin door.

## Confirmed High

### H-01 — Sidecars can read the admin directory

| Field | Content |
|---|---|
| Severity | High |
| Location | `docker-compose.yml` 29–39 and 61–72; `docker-entrypoint.sh` 23–30; `Dockerfile` 25–26 |
| Description | `ggs` and `timelapse` bind `./data` to `/data` and run as `user: "1001:1001"`. The app image creates `growcast` with uid 1001. The entrypoint runs `chown -R growcast:growcast /app/data` and then starts as that user via `su-exec`. `data/setup/admin.json` holds the password hash and session secret. `data/mesh.token` lives in the same tree. |
| Risk | A process in either sidecar can read the admin credentials and the mesh token, and can remove the setup marker `data/setup/complete`. Restream is tighter and mounts only `./data/restream`. |
| Fix | Mount only sidecar env, the mesh token, and the media paths the worker actually writes. Keep `data/setup` in the app container only. |
| Effort | M |

## Reported as High, downgraded after the second read

These issues are real, but they are not High.

- **Login limit follows the forwarded client header.** `lib/request-trust.ts` 44–85, when `GROWCAST_TRUST_PROXY` is set, reads `CF-Connecting-IP` first, then `X-Real-IP`, then the first `X-Forwarded-For` hop. Compose always sets the flag (`docker-compose.yml` 18). `proxy.ts` does not strip those headers. On the documented loopback bind the public internet reaches the process only through the tunnel. A container on the Compose network (`http://growcast:3000`) or a bind on `0.0.0.0` can bypass the limit. That is Medium, not a public auth bypass on the default path. Effort S.
- **CO₂ floor of 200 discards the whole response.** `lib/ai-summary/schema.ts` 101–122. Missing sensors are `null` and are not scored. The schema still requires a range, and `min: 0` for CO₂ is invalid. Temperature, humidity, and VPD then fall with it. Medium, effort M. PPFD may start at 0; CO₂ may not.
- **Mosaic is pointer-only.** `components/ai-summary-card.tsx`. Status and the daily value live in `title` and hover. That matches the locked layout, but keyboard and touch cannot see it. Medium, effort M.
- **Climate figures in the picker are `aria-hidden`.** `components/climate-picker.tsx` 67–71. The visible value is in the wheel, which is hidden from assistive tech. Medium, effort S.
- **No error boundary.** There is no `error.tsx` or `global-error.tsx` under `app/`. Medium, effort S.
- **`pushState` on workspace switch** was not independently confirmed and is not listed as a finding.

## Confirmed Medium

### M-01 — A corrupt climate day is overwritten empty

| Field | Content |
|---|---|
| Severity | Medium |
| Location | `lib/climate/store.ts` 139–147; `lib/climate/writer.ts` 89–94 |
| Description | `readClimateDay` returns `null` on corrupt JSON. `recordClimateOnIngest` treats that as an empty day and writes the new point back. Energy refuses to append to a corrupt day. |
| Risk | A damaged day, or a parse that drops points, is replaced on the next good sample. The mesh POST still returns 204 even when the write is swallowed. |
| Fix | Do not overwrite a `corrupt` status. Fail the ingest or leave the day untouched. |
| Effort | S |

### M-02 — Authenticator mismatch still issues a session

| Field | Content |
|---|---|
| Severity | Medium |
| Location | `lib/admin-auth.ts` 641–682; `lib/admin-totp.ts` 366–368 |
| Description | `corrupt` blocks login. `mismatch` is only logged. Then `issueAdminSession` runs. Mismatch means `totp.json` exists but the account tag does not match username plus password hash. |
| Risk | After a change of `ADMIN_USERNAME` or `ADMIN_PASSWORD_HASH` with a leftover `totp.json`, the second factor is off. The correct password is enough for 24 hours of admin. |
| Fix | Treat mismatch like `corrupt`: no session until the operator removes or rewrites the file. |
| Effort | S |

### M-03 — Public energy URL uses the private tariff with an admin cookie

| Field | Content |
|---|---|
| Severity | Medium |
| Location | `app/api/data/energy/route.ts` 9–12 |
| Description | Anonymous calls get `public`. The same URL switches to `private` as soon as the admin session is valid. Overlay and dashboard poll with `credentials: "same-origin"`. |
| Risk | A signed-in browser on the public page or overlay shows the private €/kWh rate. Without the cookie it does not. |
| Fix | Serve the private rate only on an admin response. Pin overlay and public polls to `public`. |
| Effort | S |

### M-04 — Energy cursor and day files are two writes

| Field | Content |
|---|---|
| Severity | Medium |
| Location | `lib/energy/accrue.ts` 262–304 |
| Description | Day files are written first, then the cursor. If the cursor write fails, the day files are rolled back. A crash between the two writes is not rolled back. |
| Risk | The next run adds the same interval again. kWh and euros on `/api/data/energy` stay too high. |
| Fix | Write cursor and day files so a repeated interval cannot double-count. |
| Effort | M |

### M-05 — A rejected xAI response consumes a daily slot

| Field | Content |
|---|---|
| Severity | Medium |
| Location | `lib/ai-summary/generate.ts` 67–78; `lib/ai-summary/usage.ts` 112–119 |
| Description | `reserveAiApiCall` increments before `fetch`. Cap is 5 per Berlin day. On HTTP failure, timeout, or range-parse failure there was no refund at the time of this review. |
| Risk | A CO₂ range below 200 (Medium, downgraded High) burns one of the five calls, and the scheduler may try again. |
| Fix | (Review-time suggestion.) Refund the reservation when the call fails or the body is discarded. Do not retry a parse error. Later product decision: do **not** refund after a request was sent; refund only a network error before connect. Failed, timed-out, and invalid responses must keep the slot so five bad replies block a sixth call. |
| Effort | S |

### M-06 — Placeholder seed date drives age

| Field | Content |
|---|---|
| Severity | Medium |
| Location | `app/(site)/page.tsx` 150–154 and 177–179 |
| Description | The start date is omitted when `formatDateDisplay` yields `01.01.2001`. Age still calls `getDaysSince(details.seededAt)`. |
| Risk | A grow that has not started shows thousands of days, without the date that would explain the number. |
| Fix | Use the same check for age and start date. Show no age without a usable date. |
| Effort | S |

### M-07 — Secure cookie depends on the forwarded proto

| Field | Content |
|---|---|
| Severity | Medium |
| Location | `lib/request-trust.ts` 101–120 |
| Description | Without `COOKIE_SECURE`, `Secure` is set when the first `X-Forwarded-Proto` is `https` or `CF-Connecting-IP` looks like an IP. Compose does not set `COOKIE_SECURE`. |
| Risk | A login without those headers stores the admin cookie without `Secure`. |
| Fix | Set `COOKIE_SECURE=1` on the tunnel. |
| Effort | S |

## Other reports, not re-read line by line

These came out of the read passes and look concrete, but they were not checked line by line against a second reader. Open them again before fixing.

- Gallery under `public/setup` and `public/yourPictures` bypasses the safe media route. Next serves `public/` statically and follows symlinks. The upload itself cannot create the link. Medium, M.
- Capture token is in the kiosk URL and therefore in the Chromium command line (`extensions/GrowCast-Restream/restream.py`). Medium, M.
- Setup code goes to stdout on boot and has no attempt limit while the wizard is open. Medium, M.
- Compose image `0xmrcl/growcast:latest` without `pull_policy: build`. Medium, S.
- No `.github/workflows`. Medium, M.
- Stale devices and watts on the overlay stay fully emphasized when the snapshot is older than 120 s. Medium, S.
- Without a trusted proxy, SSE and mesh errors share a bucket `unknown`. Medium, M.
- `GET /api/data/ai-summary` omits `demo`. With `AI_SUMMARY_DEMO` and no stored summary the mock assessment looks like the real day. The page itself shows “Demo”. Low, S.
- `assertPublicSafe` was not called on the public AI path at review time. Low, S.
- First authenticator enrolment does not ask for the password again. Medium, S.
- EventSub can show the same alert ID again within ten minutes. Low, S.

## Checked and not flagged

- Mesh without a token is closed. Plugin IDs are an allowlist.
- Archive IDs and media filenames are validated. Admin media POST checks same-origin and session.
- Public JSON responses contain no device serials and no stream key. The private tariff key is not in anonymous energy JSON.
- Grower targets (`temperatureDay` and related) in the user prompt abort AI generation before a call is reserved.
- Lights-off PPFD (`isDay === false`) is not scored. `null` for CO₂ and PPFD stays an empty cell. A stored `0` is a real measurement.
- The public GET of the AI summary contains no API key and no prompt.
- The widget stays off when neither `XAI_API_KEY` nor `AI_SUMMARY_DEMO` is set.

## Roadmap

1. H-01: take `./data` out of `ggs` and `timelapse`; mount only the paths they write. (M)
2. M-01: do not overwrite corrupt climate days. (S)
3. M-02: fail closed on authenticator mismatch. (S)
4. M-03: pin the public energy poll to the public tariff. (S)
5. M-05 and the CO₂ floor: allow a missing metric without a range; keep a sent failed call counted (do not refund after the request left). (M)
6. M-04: make the energy interval idempotent. (M)
7. M-06 and M-07: age only with a real seed date; `COOKIE_SECURE=1` on the tunnel. (S)
8. Take the climate figure out of `aria-hidden`. Make the mosaic keyboard-readable if the layout allows it. (S/M)

## Architecture

The boundary between the public site and admin is clear on the request path: cookie plus in-memory session, mesh separately with bearer. The weak point is the filesystem. App, GGS, and timelapse share one user and one data tree. Climate and energy write JSON without a shared transaction. The AI layer computes percent and verdict locally from the mosaic; the range still comes from the model and can discard the whole day even when CO₂ was never measured.

Sensible next cut: credentials and mesh token only in the app volume, sidecar mounts limited to env and media, and the same “do not overwrite corrupt” rule for climate as for energy.

## Coverage

Inventory: 402 files under `app`, `components`, `lib`, `hooks`, `tests`, `extensions`, plus the shell configs (`*.ts`, `*.tsx`, `*.mjs`, `*.py`, `*.sh`, `*.css`). Excluded: `node_modules`, `.next`, `.git`.

High-risk paths that were opened: admin auth and TOTP, `proxy.ts`, `request-trust`, media and archives, mesh, `lib/ai-summary`, climate writer and store, energy accrue and the public energy route, Compose and entrypoint, the dashboard page, the climate picker. Tests, Python sidecars, and some overlay components were opened in the read passes but not all are quoted here. A claim of 100 percent of every file would be false.
