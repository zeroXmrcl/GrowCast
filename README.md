# GrowCast

GrowCast is a Next.js web app for publishing a live garden dashboard with an optional gallery and a protected panel.

## 1. Project Overview

### What the app does
GrowCast lets you share your grow in real time. Visitors can view the live stream, some details and media (setup/snapshots/timelapse). Admin users can update all metadata from a web dashboard.

### Key features
- Live stream embed on the homepage (RTSP camera via MediaMTX (RTSP -> HLS))
- Public grow dashboard
- Markdown support for notes/setup text
- Optional gallery page for snapshots + timelapse video ([GrowCast Timelapse plugin](https://github.com/zeroXmrcl/GrowCast-Timelapse))

## 2. Demo 

![Mockup_v1.1.0](assets/mockup.webp)

To see a live demo, visit [my instance](https://grow.0xmarcel.com).
The official project site is [growcast.0xmarcel.com](https://growcast.0xmarcel.com).

## 3. Getting Started

### Prerequisites
- npm
- Node.js 20 LTS or newer
- An IP camera with RTSP support
- MediaMTX server (to convert RTSP input into HLS output)
- Cloudflare account + `cloudflared` (for encrypted public access)

### Installation
1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Create admin credentials:

```bash
npm run setup:admin
```

This script creates `.env.local` with required admin variables.

### Environment variables
Required for admin login:

```env
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=scrypt$...$...
ADMIN_SESSION_SECRET=at_least_32_chars_random_secret
```

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
  yourPictures/                # Optional user uploaded pictures shown on dashboard
extensions/
  GrowCast-Timelapse/          # Optional plugin folder
```

## 6. Configuration

My App doesnt need much configuration to get started, but i have tested some optimizations for MediaMTX.
The default MediaMTX configuration caused issues on iOS devices and significant stuttering on some Windows systems.
Below i have included how i configured my MediaMTX server.

```
hlsAlwaysRemux: true
hlsVariant: fmp4
hlsSegmentCount: 7
hlsSegmentDuration: 1s
hlsPartDuration: 200ms
hlsSegmentMaxSize: 50M
hlsDirectory: ''
hlsMuxerCloseAfter: 60s

paths:
   growcam:
    source: rtsp://USER:PASSWORD@IP.OF.YOUR.CAM/stream1
    sourceProtocol: tcp
    sourceOnDemand: no
```

If you still have issues, make sure your camera is not set to a high frame rate, (i set mine to 15fps, but feel free to try other values).

## 7. Usage Guide

### Stream setup (RTSP camera + MediaMTX)
GrowCast expects a browser-playable stream URL in the admin dashboard. 
Since some cameras expose RTSP, use MediaMTX to convert RTSP to HLS:

1. Configure your RTSP camera (RTSP source looks somewhat like this: `rtsp://<camera-ip>:554/<path>`).
2. Run MediaMTX and create a path that ingests RTSP.
3. Use MediaMTX HLS output URL as the stream URL in GrowCast admin (`/admin`), for example:
   - `http://<mediamtx-host>:8888/<path>/index.m3u8`
4. Save in GrowCast settings.

## 8. API / Backend Overview

This app uses Next.js route handlers and local filesystem storage.

### Data storage
- Primary source: `data/current-grow.json`
- Read/write logic: `lib/db.ts`
- If file is missing, default data is generated.

### Route handlers
- `GET /api/snapshots/[filename]`
  - Serves image files from `extensions/GrowCast-Timelapse/snapshots`
- `GET /api/timelapse/[filename]`
  - Serves timelapse video from `extensions/GrowCast-Timelapse/timelapse/latest_timelapse.mp4`
- `POST /admin/logout`
  - Clears admin session and redirects to `/admin`

### Auth model
- Username + scrypt password hash from env vars
- Signed cookie-based sessions
- In-memory session store

## 9. Deployment

### Cloudflare Tunnel (recommended for public access)
To make the HLS source and app publicly accessible without exposing your home network, publish both services through Cloudflare Tunnel:

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
- Restrict access where possible, bot protection is recommended.

## 10. Troubleshooting

### Admin login is disabled
Cause:
- Missing/invalid `ADMIN_*` env variables.

Fix:
- Run `npm run setup:admin` and restart the app.

### Gallery shows "unavailable"
Cause:
- `extensions/GrowCast-Timelapse` folder missing or no media generated.

Fix:
- Install/run the timelapse plugin and ensure snapshots/timelapse files exist.

### Changes are not visible immediately
Cause:
- Stale page cache after edits.

Fix:
- Restart dev server.