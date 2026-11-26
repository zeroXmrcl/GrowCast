## Findings

### High

- The app can silently show fake fallback data on `/` and `/admin` instead of the real grow.  
  `lib/db.ts` creates default data on any read failure and returns `DEFAULT_GROW` on parse/read errors.

  **Impact:**  
  In production, a corrupted or unreadable `data/current-grow.json` turns into a healthy tomato demo without any visible error.

  **Fix:**
    - Only auto-create on `ENOENT`
    - Schema-validate the JSON
    - Surface an explicit error state instead of returning placeholder data

---

- The date logic on `/` is not trustworthy.  
  `app/page.tsx` formats `YYYY-MM-DD` with `new Date(...)` (timezone-sensitive), while `utils/daysSinceSeeding.ts` calculates age in `Europe/Berlin`.

  **Issues:**
    - Same seed date renders differently depending on server timezone
    - Magic sentinel in `app/page.tsx`
    - DB layer prevents `seededAt` from being empty

  **Fix:**
    - Make `seededAt` nullable
    - Parse date-only values manually
    - Render age/date only when the grow has started

---

- Your `/` data is internally inconsistent.

  **Example (April 23, 2026):**
    - `seededAt`: `2026-04-18` → age = 5 days
    - Description: *“The first grow will start as soon as its set up.”*

  **Impact:**  
  Public dashboard shows contradictory state.

---

- The timelapse API contract is broken.  
  `components/timelapse-player.tsx` requests `/api/timelapse/<latestFile>`, but  
  `app/api/timelapse/[filename]/route.ts` ignores the param and always serves `latest_timelapse.mp4`.

  **Impact:**  
  UI detects file → player returns 404.

  **Fix:**
    - Either honor `filename` (like snapshots route)
    - Or switch to `/api/timelapse/latest`

---

- Admin auth is not production-safe at scale.  
  Sessions and rate limiting use in-memory `Map`s in `lib/admin-auth.ts`.

  **Issues:**
    - Breaks on restart / multi-instance / serverless
    - Rate-limit key trusts forwarded IP headers

  **Fix:**
    - Move sessions + rate limits to Redis/DB
    - Only trust proxy headers if controlled

---

### Medium

- Server-side validation is too weak for admin mutations.  
  `app/admin/page.tsx` accepts arbitrary values.

  **Impact:**
    - Negative counts
    - Invalid health values
    - Broken iframe URLs

  **Fix:**
    - Schema validation
    - Clamp numeric ranges
    - Restrict `streamUrl`

---

- Public and admin dashboards are out of sync at the model level.

  **Problem:**
    - Public: `grow.strain`, `grow.stage`, `grow.seededAt`
    - Admin: `grow.details.*`
    - Duplication in `lib/db.ts`

  **Impact:**  
  Stale data already visible (e.g. old March 15, 2026 update).

  **Fix:**
    - One canonical domain model
    - Derive view models

---

- Setup media can disappear even when files exist.

  **Cause:**  
  `app/page.tsx` only renders setup if `setupText` is non-empty.

  **Fix:**  
  Render if:
  ```ts
  setupText.trim() || setupImages.length > 0