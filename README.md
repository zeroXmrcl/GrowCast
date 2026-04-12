# GrowCast

GrowCast is a Next.js web app for publishing a live plant grow dashboard with an optional timelapse gallery and a protected panel.

## 1. Project Overview

### What the app does
GrowCast lets you share your grow in real time. Visitors can view the live stream, plant details, current health, setup notes, and media (setup/snapshots/timelapse). Admin users can update all grow metadata from a web dashboard.

### Key features
- Live stream embed on the homepage (RTSP camera via MediaMTX (RTSP -> HLS))
- Public grow dashboard (plant data, stage, age, health, setup notes)
- Markdown support for notes/setup text (`react-markdown`)
- Optional gallery page for snapshots + timelapse video (GrowCast Timelapse plugin)

## 2. Demo 

To see a live demo, visit [my instance](https://grow.0xmarcel.com).

## 3. Getting Started

### Prerequisites
- An IP camera with RTSP support
- npm (project includes `package-lock.json`)
- MediaMTX server (to convert RTSP input into HLS output)
- Node.js 20 LTS or newer (assumption based on Next.js 16 setup)
- Cloudflare account + `cloudflared` (for public tunnel access)

### Installation
1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Create admin credentials (recommended helper script):

```bash
npm run setup:admin
```

This script creates `.env.local` with required admin variables.

### Environment variables
Create `.env.local` in the project root.

Required for admin login:

```env
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=scrypt$...$...
ADMIN_SESSION_SECRET=at_least_32_chars_random_secret
```

Notes:
- `ADMIN_PASSWORD_HASH` must use the `scrypt$...` format.
- `ADMIN_SESSION_SECRET` must be at least 32 characters.

## 4. Running the Application

### Development

```bash
npm run dev
```

Open `http://localhost:3000`.

### Production build and start

```bash
npm run build
npm run start
```

## 5. Project Structure

```text
app/
  page.tsx                     # Public dashboard
  gallery/page.tsx             # Gallery page
  admin/page.tsx               # Admin login + dashboard
  admin/logout/route.ts        # Logout endpoint
  api/snapshots/[filename]/    # Serves snapshot images
  api/timelapse/[filename]/    # Serves timelapse video
components/
  site-header.tsx
  site-footer.tsx
  snapshot-gallery.tsx
  timelapse-player.tsx
lib/
  db.ts                        # JSON data store + types
  admin-auth.ts                # Auth/session/rate-limit logic
  extension-status.ts          # Timelapse plugin file discovery
  getSetupImages.ts            # Reads public/setup images
scripts/
  admin-creator.mjs            # Interactive .env.local generator
data/
  current-grow.json            # Persisted grow data
public/
  setup/                       # Optional setup photos shown on homepage
extensions/
  GrowCast-Timelapse/          # Optional plugin folder (not included)
```

## 6. Configuration

### `next.config.ts`
- Currently default/empty Next.js config.
- Extend this for image domains, redirects, experimental flags, etc.

### `tsconfig.json`
- Strict TypeScript mode enabled.
- Uses `@/*` path alias to project root.

### `eslint.config.mjs`
- Uses Next.js Core Web Vitals + TypeScript ESLint presets.

### `postcss.config.mjs`
- Tailwind CSS v4 PostCSS plugin configured.

## 7. Usage Guide

### Stream setup (RTSP camera + MediaMTX)
GrowCast expects a browser-playable stream URL in the admin dashboard. Since some cameras expose RTSP, use MediaMTX to convert RTSP to HLS:

1. Configure your RTSP camera (example: `rtsp://<camera-ip>:554/<path>`).
2. Run MediaMTX and create a path that ingests RTSP.
3. Use MediaMTX HLS output URL as the stream URL in GrowCast admin (`/admin`), for example:
   - `http://<mediamtx-host>:8888/<path>/index.m3u8` (assumption: default MediaMTX HLS port/path)
4. Save in GrowCast admin and verify playback on `/`.

### For visitors
1. Go to `/` to view the current grow status.
2. Watch the embedded stream (if configured).
3. Read grow info, health status, and setup details.
4. Open `/gallery` to view timelapse + snapshots (if plugin/media exists).

### For admins
1. Open `/admin` and sign in.
2. Update grow fields (title, plant info, stage, dates, stream URL, notes, setup, health).
3. Save changes; homepage and admin pages are revalidated automatically.
4. Use **Sign Out** from admin routes.

## 8. API / Backend Overview

This app uses Next.js route handlers and local filesystem storage.

### Data storage
- Primary source: `data/current-grow.json`
- Read/write logic: `lib/db.ts`
- If file is missing, default data is generated automatically.

### Route handlers
- `GET /api/snapshots/[filename]`
  - Serves image files from `extensions/GrowCast-Timelapse/snapshots`
  - Rejects unsafe filename patterns
- `GET /api/timelapse/[filename]`
  - Serves timelapse video from `extensions/GrowCast-Timelapse/timelapse/latest_timelapse.mp4`
  - Returns 404 if missing
- `POST /admin/logout`
  - Clears admin session and redirects to `/admin`

### Auth model
- Username + scrypt password hash from env vars
- Signed cookie-based sessions
- In-memory session store and login attempt limiter

Important limitation:
- Sessions and rate-limit buckets are in-memory, so they reset on server restart and are not shared across multiple instances.

## 9. Deployment

### Cloudflare Tunnel (recommended for public access)
To make the grow stream and app publicly accessible without exposing your home network, publish both services through Cloudflare Tunnel:

1. Run GrowCast (example: `http://localhost:3000`).
2. Run MediaMTX (example: HLS endpoint on `http://localhost:8888`).
3. Create tunnel routes with `cloudflared`:
   - One public hostname for GrowCast (example: `growcast.example.com` -> `http://localhost:3000`)
   - One public hostname for MediaMTX HLS (example: `stream.example.com` -> `http://localhost:8888`)
4. In GrowCast admin, set `Stream URL` to your public MediaMTX HLS URL:
   - `https://stream.example.com/<path>/`
5. Verify both endpoints are reachable through Cloudflare.

Important:
- Keep admin credentials strong (`ADMIN_*` env vars).
- Restrict access where possible (Cloudflare Access / WAF / auth rules), especially for stream endpoints.

### Option B: Node server
1. Build with `npm run build`
2. Start with `npm run start`
3. Provide `.env.local` or runtime env vars
4. Persist the `data/` directory between deployments

## 10. Troubleshooting

### Admin login is disabled
Cause:
- Missing/invalid `ADMIN_*` env variables.

Fix:
- Run `npm run setup:admin` and restart the app.

### "Invalid username or password"
Cause:
- Wrong credentials or malformed password hash.

Fix:
- Regenerate `.env.local` using `npm run setup:admin`.

### Gallery shows "unavailable"
Cause:
- `extensions/GrowCast-Timelapse` folder missing or no media generated.

Fix:
- Install/run the timelapse plugin and ensure snapshots/timelapse files exist.

### Timelapse or snapshot API returns 404
Cause:
- Requested files are not present in extension directories.

Fix:
- Verify paths:
  - `extensions/GrowCast-Timelapse/snapshots`
  - `extensions/GrowCast-Timelapse/timelapse`

### Changes are not visible immediately
Cause:
- Stale page cache after edits.

Fix:
- Save via admin form (triggers revalidation), or restart dev server.

## 11. Contributing (Optional)

1. Fork and create a feature branch.
2. Make focused changes.
3. Run checks before PR:

```bash
npm run lint
npm run build
```

4. Open a pull request with clear scope and testing notes.