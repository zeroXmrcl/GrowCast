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
- Optional live tent climate from a Spider Farmer GGS ([GrowCast-GGS plugin](https://github.com/zeroXmrcl/GrowCast-GGS))

## 2. Demo 

![Mockup_v1.1.0](assets/mockup.webp)

To see a live demo, visit [my instance](https://grow.0xmarcel.com).
The official project site is [growcast.0xmarcel.com](https://growcast.0xmarcel.com).

## 3. Getting Started

### Prerequisites
- npm
- Node.js 20 LTS or newer
- An IP camera with RTSP support
- npm (project includes `package-lock.json`)
- MediaMTX server (to convert RTSP input into HLS output)
- Node.js 20 LTS or newer (assumption based on Next.js 16 setup)
- Docker Engine + Docker Compose plugin (for containerized setup)
- Cloudflare account + `cloudflared` (for public tunnel access)

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

Passwords must be at least 12 characters by default. For local/dev only, short passwords can be allowed with:

```bash
npm run setup:admin:insecure
# or: npm run setup:admin -- --allow-insecure
```

(Do not use `npm run setup:admin --allow-insecure` — npm treats that as its own config, not a script argument.)

### Environment variables
Required for admin login:

```env
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=scrypt$...$...
ADMIN_SESSION_SECRET=at_least_32_chars_random_secret
```

Notes:
- `ADMIN_PASSWORD_HASH` must use the `scrypt$...` format.
- `ADMIN_SESSION_SECRET` must be at least 32 characters.
- The same `.env.local` file is used by `docker compose` through `env_file`.
- **Required for mesh/plugin API:** set `GROWCAST_MESH_TOKEN` to a long random secret. Requests without a matching `Authorization: Bearer <token>` are denied (fail-closed). Official plugins must send this header.
- Admin passwords must be at least **12 characters** (`npm run setup:admin` enforces this). For local/dev only, use `npm run setup:admin:insecure` (or `npm run setup:admin -- --allow-insecure`).
- Admin sessions last **24 hours**.

### Logging

GrowCast writes **structured JSON logs to stdout** (Pino) for production observability and security events (auth, mesh, path traversal, HTTP requests). Correlation IDs are set in the Next.js proxy (`X-Request-ID` on responses). Optional env vars: `LOG_LEVEL`, `LOG_PRETTY` (dev only), `GROWCAST_ENV`.

Full schema, event catalog, redaction rules, Docker log shipping, retention guidance, and alert examples: **[docs/logging.md](docs/logging.md)**.

## 4. Running the Application

### Docker Compose

The repository already includes a production-ready `Dockerfile` and `docker-compose.yml`. This is the supported way to run GrowCast in a container.

1. Create admin credentials first:

```bash
npm run setup:admin
```

2. Start the container:

```bash
docker compose up --build -d
```

3. For production, put the origin behind a **Cloudflare Tunnel** (HTTPS public hostname → `http://127.0.0.1:3000`). Compose publishes only on loopback (`127.0.0.1:${GROWCAST_PORT:-3000}`) and sets `GROWCAST_TRUST_PROXY=1` so login rate-limits use `CF-Connecting-IP` (then `X-Real-IP`). Spoofed forwarded IPs are ignored unless that flag is set. Admin cookies are `Secure` when `X-Forwarded-Proto: https` or `CF-Connecting-IP` is present (or `COOKIE_SECURE=1`). Direct HTTP to a public `:3000` is not the supported admin path.

Local-only UI: `http://localhost:3000` (session cookie is not Secure).

Useful commands:

```bash
docker compose logs -f growcast
docker compose down
```

What gets persisted on the host:
- `./data` -> `/app/data`
- `./extensions` -> `/app/extensions`
- `./public/setup` -> `/app/public/setup`
- `./public/yourPictures` -> `/app/public/yourPictures`

This means grow data, timelapse assets, and uploaded media survive container restarts and image rebuilds.

Optional GGS live climate plugin (own repo, same pattern as Timelapse):

```bash
git clone https://github.com/zeroXmrcl/GrowCast-GGS.git extensions/GrowCast-GGS
copy extensions\GrowCast-GGS\.env.example extensions\GrowCast-GGS\.env
```

Fill `SF_MQTT_NAME`, `SF_MQTT_PWD`, `SF_SERIAL`, and the same `GROWCAST_MESH_TOKEN` as `.env.local`. Never commit `.env`. Compose service `ggs` builds that folder.

The container process runs as uid 1001 (`growcast`). The entrypoint `chown`s those bind mounts on start so the process can write them. After the first run they are owned by `1001:1001` on the host.

Optional port override:
- The compose file publishes `127.0.0.1:${GROWCAST_PORT:-3000}:3000`.
- If you want a different loopback port, set `GROWCAST_PORT` before starting Compose.

Important:
- The container only runs GrowCast. MediaMTX is still a separate service and must be run outside this compose file.
- `.env.local`, media folders, and `data/` are intentionally not baked into the image. They are provided at runtime.

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

This starts the standard Next.js production server. The Docker image builds a standalone bundle automatically during `docker compose build`.

## 5. Project Structure

```text
app/
  page.tsx                     # Public dashboard
  gallery/page.tsx             # Gallery page
  admin/page.tsx               # Admin login + dashboard
  admin/logout/route.ts        # Logout endpoint
  api/data/current-grow/       # Current grow JSON endpoint
  api/mesh/[pluginId]/          # Plugin settings endpoint
  api/snapshots/[filename]/    # Serves snapshot images
  api/timelapse/               # Serves latest timelapse video
components/
  dash-pictures.tsx
  site-header.tsx
  site-footer.tsx
  snapshot-gallery.tsx
  timelapse-player.tsx
lib/
  db.ts                        # JSON data store + types
  admin-auth.ts                # Auth/session/rate-limit logic
  mesh-auth.ts                 # Fail-closed Bearer auth for mesh API
  timelapse-settings.ts        # Timelapse settings normalize + I/O
  extension-status.ts          # Timelapse plugin file discovery
  media-library.ts             # Live picture dirs, listing, upload encode
  app-timezone.ts              # Shared app timezone for day math
scripts/
  admin-creator.mjs            # Interactive .env.local generator
data/
  current-grow.json            # Persisted grow data
  mesh/                        # Persisted plugin settings
public/
  setup/                       # Optional setup photos shown on homepage
  yourPictures/                # Optional user uploaded pictures shown on dashboard
extensions/
  GrowCast-Timelapse/          # Optional plugin folder (not included)
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
   - `http://<mediamtx-host>:8888/<path>/`
4. Save in GrowCast settings.

## 8. API / Backend Overview

This app uses Next.js route handlers and local filesystem storage.

### Data storage
- Primary source: `data/current-grow.json`
- Read/write logic: `lib/db.ts`
- If file is missing, default data is generated.

### Route handlers
- `GET /api/data/current-grow`
  - Returns the normalized grow record as JSON
  - Uses `Cache-Control: no-store, must-revalidate`
- `GET /api/snapshots/[filename]`
  - Serves image files from `extensions/GrowCast-Timelapse/snapshots`
- `GET /api/timelapse`
  - Serves timelapse video from `extensions/GrowCast-Timelapse/timelapse/latest_timelapse.mp4`
- `GET /api/data/live-climate`
  - Public latest GGS climate JSON (no credentials)
  - `Cache-Control: no-store`
- `GET /api/data/live-climate/stream`
  - Public SSE; snapshot on change + heartbeat every 15s
  - Reverse proxy must not buffer this path
    (`nginx`: `location /api/data/live-climate/stream { proxy_buffering off; proxy_http_version 1.1; }`, Caddy: `flush_interval -1`)
- `GET /api/mesh/[pluginId]`
  - Returns registered plugin settings, for example `/api/mesh/growcast.timelapse`
  - Always requires `GROWCAST_MESH_TOKEN` and matching `Authorization: Bearer <token>` (fail-closed if token unset)
- `POST /api/mesh/growcast.ggs/state`
  - Sidecar ingest, Bearer `GROWCAST_MESH_TOKEN`

### Auth model
- Username + scrypt password hash from env vars
- Default `setup:admin` requires a 12-character password; `--allow-insecure` is local/dev only
- Login verifies the stored scrypt hash (non-empty + max length); it does not re-apply the 12-character setup minimum
- Signed cookie-based sessions (24-hour TTL)
- In-memory session store (single-node deploy)


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