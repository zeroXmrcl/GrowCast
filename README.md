# GrowCast

GrowCast is a Next.js web app for a live garden: climate, energy, gallery, an OBS overlay, and Twitch broadcast, with a protected admin panel.

## Quick install

1. Clone this repository.
2. Run `docker compose up --build -d`.
3. Open `http://localhost:3000` and finish the setup wizard (the container log prints the setup code).

Enable plugins in **Admin → Plugins**. First-party plugins are not on until you do that. Details: [docs/plugins/README.md](docs/plugins/README.md).

Enabling a plugin pins a SHA-256 of its folder. GrowCast pauses the plugin when any pinned file changes, and it stays paused until you confirm the new hash. The pin covers `plugin.json`, `host/dist` (the bundle the server imports), `ui/dist`, Dockerfiles, and other shipped backend files. It skips `node_modules`, VCS and other dot-directories, `__pycache__`, `*.pyc`, `snapshots/`, `timelapse/` media, `media/`, `coverage/`, and `dist-info/`. `GROWCAST-HASH` records that pin and is not itself an input, so a release file can match the hash Admin shows. See [docs/plugins/INSTALL.md](docs/plugins/INSTALL.md).

## 1. Project Overview

### What the app does
GrowCast lets you share your grow in real time. Visitors see the live stream, climate, energy, and media. Admin users update the grow from the settings pages.

### Key features
- Live stream embed on the homepage (an RTSP camera through MediaMTX, RTSP to HLS)
- Public grow dashboard, gallery, and energy
- Live tent climate from the Spider Farmer plugin (`plugins/ggs`)
- Timelapse snapshots and video
- OBS overlay at `/overlay` and the Broadcast page (`/admin/stream`) for music, alerts, Twitch, and camera look
- Settings bands with in-page save

## 2. Demo 

![Mockup_v1.1.0](assets/mockup.webp)

To see a live demo, visit [my instance](https://grow.0xmarcel.com).
The official project site is [growcast.0xmarcel.com](https://growcast.0xmarcel.com).

## 3. Getting Started

### Prerequisites
- Docker Engine and the Docker Compose plugin
- Node.js 20 LTS or newer, and npm, when you want `npm run dev` or `npm run setup:admin`

A camera, MediaMTX, and Cloudflare are for publishing a stream. They are not required to open the site.

### Installation

Clone the repository and start the stack:

```bash
docker compose up --build -d
```

That builds and starts the website. Enable GGS, Timelapse, Restream, and Solar in **Admin → Plugins**; GrowCast then starts those backends through `docker-plugin-proxy`. The first Restream image build downloads Chromium and can take a while.

Open `http://localhost:3000`. Until an admin account exists, the site opens the setup wizard. The container log prints a setup code (`docker compose logs growcast`). Enter that code on the first step, then create the admin login. The wizard also asks which plugins to configure:

- Climate: Spider Farmer email and password. One controller is saved automatically. Several controllers ask you to choose.
- Twitch: stream key and channel. Start stays on Broadcast.
- Timelapse: camera RTSP URL, interval, and timezone.

The mesh token is generated on first boot and still accepted by first-party plugins. New plugins use a per-plugin host token minted when you enable them in Admin. You do not paste it.

`npm run setup:admin` still writes `.env.local` for an admin account created outside the wizard. Passwords must be at least 12 characters. For local/dev only:

```bash
npm run setup:admin:insecure
# or: npm run setup:admin -- --allow-insecure
```

(Do not use `npm run setup:admin --allow-insecure` — npm treats that as its own config, not a script argument.)

An account already present in `.env.local` skips the wizard.

### Environment variables

`.env.local` is optional. Compose loads it when the file exists (`env_file` `required: false`).

```env
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD_HASH=scrypt$...$...
ADMIN_SESSION_SECRET=at_least_32_chars_random_secret
GROWCAST_MESH_TOKEN=optional_existing_token
```

Notes:
- `ADMIN_PASSWORD_HASH` must use the `scrypt$...` format.
- `ADMIN_SESSION_SECRET` must be at least 32 characters.
- When `GROWCAST_MESH_TOKEN` is set, that value is copied to `data/mesh.token` and first-party plugins still accept it as a fallback. When it is unset, the container creates one token on first boot.
- Admin passwords must be at least **12 characters** (`npm run setup:admin` and the wizard enforce this). For local/dev only, use `npm run setup:admin:insecure` (or `npm run setup:admin -- --allow-insecure`).
- Admin sessions last **24 hours** and live in memory. `docker compose up --build` recreates the website container and signs you out. Sign in again.
- Optional, Broadcast channel lookup and Twitch EventSub alerts (GrowCast `.env.local`, not the Restream plugin): `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. EventSub webhooks also need `GROWCAST_PUBLIC_URL` (the public HTTPS origin, e.g. the Cloudflare Tunnel hostname).
- Optional daily **AI Assessment** (xAI / Grok). Server-only; visitors cannot trigger the API:
  - `XAI_API_KEY` — required to generate summaries. Never expose this to the browser.
  - `AI_SUMMARY_DEMO` — `1` or `true` shows a sample assessment on the dashboard without calling xAI. A saved summary still wins when one exists. When this and `XAI_API_KEY` are both unset, the dashboard widget is hidden.
  - `XAI_MODEL` — vision-capable Grok model. Default `grok-4.3` (image input, cheaper than `grok-4.7`).
  - `XAI_API_BASE` — default `https://api.x.ai/v1`.
  - The job runs in-process around 08:00 Europe/Berlin, survives restarts, and is idempotent per Berlin day. Admin can regenerate from **GGS** (1/10 min, same-origin). Hard cap: **5 xAI calls per Berlin day** (scheduler + regenerate, persisted in `data/ai-summary/usage.json`). Requests use a 60s timeout, `max_tokens=1536`, and a 400 KB vision still. See `.env.example`.

### Logging

GrowCast writes **human-readable logs to stdout** so `docker compose logs` shows the setup code, auth events, and request lines without a JSON parser. Set `LOG_FORMAT=json` for one JSON object per line (log shipping). Correlation IDs are set in the Next.js proxy (`X-Request-ID` on responses). Optional env vars: `LOG_LEVEL`, `LOG_FORMAT`, `GROWCAST_ENV`.

Full schema, event catalog, redaction rules, Docker log shipping, retention guidance, and alert examples: **[docs/logging.md](docs/logging.md)**.

## 4. Running the Application

### Docker Compose

`docker compose up --build -d` is the supported start command. [docker-compose.yml](docker-compose.yml) runs the `growcast` website and `docker-plugin-proxy`. Plugin backends are started by GrowCast after you enable them in Admin. `compose.plugins.generated.yml` is an operator snapshot; GrowCast does not run `docker compose` against it.

For production, put the origin behind a **Cloudflare Tunnel** (HTTPS public hostname → `http://127.0.0.1:3000`). Compose publishes on `${GROWCAST_BIND:-127.0.0.1}:${GROWCAST_PORT:-3000}` (loopback unless you set `GROWCAST_BIND=0.0.0.0` for a LAN) and sets `GROWCAST_TRUST_PROXY=1`. Login rate-limits use `CF-Connecting-IP`, then `X-Real-IP`, then the first `X-Forwarded-For` hop, which Caddy sends by default. Those headers are ignored unless the flag is set. Admin cookies are `Secure` when `X-Forwarded-Proto: https` or `CF-Connecting-IP` is present (or `COOKIE_SECURE=1`). Direct HTTP to a public `:3000` is not the supported admin path.

Local-only UI: `http://localhost:3000` (session cookie is not Secure).

Useful commands:

```bash
docker compose up --build -d
docker compose logs -f growcast
docker compose down
```

`docker compose up --build -d` recreates the website container and signs you out. Sessions stay in memory for 24 hours or until logout. Sign in again.

What gets persisted on the host:
- `./data` -> `/app/data` (grow data, mesh token, plugin storage under `data/plugins/<id>/`)
- `./plugins` -> `/app/plugins` (plugin source, read-only in the website container)
- `./public/setup` -> `/app/public/setup`
- `./public/yourPictures` -> `/app/public/yourPictures`

The website writes `data/ggs.env` for GGS and `data/timelapse.env` for the camera URL. After migration those files also live under `data/plugins/growcast.ggs/` and `data/plugins/growcast.timelapse/`. They sit on the `./data` directory mount, so Docker does not create a directory in place of a missing env file.

Drop plugin folders into `plugins/` and enable them in Admin → Plugins. First-party plugins are not auto-enabled. GrowCast pins a SHA-256 of the files, starts the backend, and pauses the plugin if the files change. Plugins without credentials wait, then start when the wizard (or admin settings) writes the config. Twitch restream stays idle until you save a stream key and press Start on Broadcast (`/admin/plugins/growcast.restream`). GrowCast writes `data/restream/capture.token` (or the migrated plugin path) on its own; `GROWCAST_RESTREAM_TOKEN` in `.env.local` is an optional override.

### Architecture

The host is a Next.js app. Plugin dists live in `plugins/`. Public plugin pages are `/p/<pluginId>/…` (`pluginUrlSlug` uses the last DNS label, so `growcast.ggs` is `/p/ggs`). Backends start through `docker-plugin-proxy`, never a raw Docker socket.

```mermaid
flowchart TD
  Visitor[Visitor]
  Operator[Admin]
  Host[GrowCast Next.js host]
  Folder["plugins/ folder"]
  Pages["/p/pluginId pages"]
  AdminUI["/admin/plugins/id"]
  Proxy[docker-plugin-proxy]
  Boxes[Plugin Docker containers]
  Data[("data/plugins/id")]

  Visitor --> Pages
  Pages --> Host
  Operator --> AdminUI
  AdminUI --> Host
  Host --> Folder
  Host -->|"Bearer ingest, heartbeat, config"| Boxes
  Host --> Proxy
  Proxy -->|"allowlisted start and stop"| Boxes
  Boxes -->|"POST /api/plugins/v1/id/ingest"| Host
  Host --> Data
```

### Plugin lifecycle

A folder in `plugins/` is discovered. It is **not** in the public header until it is enabled **and** a page declares `nav: "site"` (`lib/plugins/nav.ts` `pluginSiteNavItems` → `listEnabledSitePages`). Enable also mints a per-plugin token and calls `startPluginRuntime`.

```mermaid
sequenceDiagram
  actor Operator
  participant Folder as plugins folder
  participant Host as GrowCast host
  participant Admin as Admin Plugins
  participant Proxy as docker-plugin-proxy
  participant Header as Site header

  Operator->>Folder: Drop dist so plugin.json is at plugins/id/plugin.json
  Folder->>Host: discoverPlugins
  Host->>Admin: Status discovered
  Operator->>Admin: Confirm hash and enable
  Admin->>Host: enablePlugin pins SHA-256 and mints token
  Host->>Proxy: startPluginRuntime
  alt page nav is site
    Host->>Header: pluginSiteNavItems adds /p/slug
  else nav is admin or none
    Note over Header: No extra public link
  end
```

### Host API endpoints

```mermaid
flowchart TD
  subgraph publicApi ["Public, no session"]
    Pages["GET /p/slug and /overlay"]
    Live["GET /api/data/plugins/id"]
    Stream["GET /api/data/plugins/id/stream"]
    Dispatch["GET /api/data/plugins/id/remainder"]
    Widgets["GET /api/data/plugin-widgets"]
  end
  subgraph adminApi ["Admin session cookie"]
    AdminPages["GET /admin/plugins"]
    ProxyX["GET or POST /api/plugins/v1/id/x/remainder"]
    Notices["GET /api/admin/plugin-notices"]
  end
  subgraph backendApi ["Plugin backend Bearer token"]
    Config["GET /api/plugins/v1/id/config"]
    Ingest["POST /api/plugins/v1/id/ingest"]
    Heartbeat["POST /api/plugins/v1/id/heartbeat"]
    Mesh["GET /api/mesh/id and POST /api/mesh/id/state"]
  end
```

| Method | Path | Auth | public/admin | Purpose |
|--------|------|------|----------|---------|
| GET | `/p/:pluginId/…` | none, unless the page sets `public: false` | public or admin | Plugin UI from `plugin.json` `pages` |
| GET | `/admin/plugins` | admin session | admin | Trusted install list |
| GET | `/admin/plugins/:pluginId/…` | admin session | admin | Plugin admin UI |
| GET | `/api/data/plugins/:id` | none | public | Live metrics/state |
| GET | `/api/data/plugins/:id/stream` | none | public | Live SSE |
| GET | `/api/data/plugins/:id/:path` | none | public | `handlePublic` dispatch |
| GET | `/api/data/plugin-widgets?slot=` | none | public | Widget entries for a slot |
| GET | `/api/plugins/v1/:id/config` | plugin Bearer | backend | Config including secrets |
| POST | `/api/plugins/v1/:id/ingest` | plugin Bearer | backend | Metrics + state |
| POST | `/api/plugins/v1/:id/heartbeat` | plugin Bearer | backend | Liveness |
| GET, POST | `/api/plugins/v1/:id/x/:path` | admin session | admin | `handleAction` proxy |
| GET | `/api/mesh/:id` | mesh Bearer | sidecar | Legacy mesh settings |
| POST | `/api/mesh/:id/state` | mesh Bearer | sidecar | Legacy mesh state ingest |
| GET | `/api/admin/plugin-notices` | admin session | admin | Admin toasts after login |

See [docs/plugins/README.md](docs/plugins/README.md) and [docs/plugins/MIGRATION.md](docs/plugins/MIGRATION.md).

Broadcast (`/admin/plugins/growcast.restream`) previews the 1920×1080 program with background music (uploaded playlist or a stream URL; URL wins while set) and on-stream alerts (manual Send alert, plus Twitch follow/sub/raid/bits after Connect Twitch). Public `/overlay` and the homepage stay silent.

The website container runs as uid 1001 (`growcast`). The entrypoint `chown`s `./data` and the upload folders so the process can write them. It does not create or chown plugin source folders, so a later `git pull` still works and an empty `plugins/` is valid. After the first run those data folders are owned by `1001:1001` on the host. Plugin containers use the same uid so they can read `./data`. GrowCast never mounts `/var/run/docker.sock`. It talks to in-repo `docker-plugin-proxy` (`DOCKER_HOST=tcp://docker-plugin-proxy:2375`) which allowlists list/inspect/start/stop/restart/logs (and a checked create) for containers labeled `growcast.plugin=<id>`. See `docs/plugins/DOCKER-PROXY.md`. Build plugin images on the host.

Optional address:
- The compose file publishes `${GROWCAST_BIND:-127.0.0.1}:${GROWCAST_PORT:-3000}:3000`.
- Set `GROWCAST_PORT` for a different port, or `GROWCAST_BIND=0.0.0.0` to reach the site from other machines on the LAN.

MediaMTX stays outside this compose file. `.env.local`, media folders, and `data/` are provided at runtime and are not baked into the image.

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
  (site)/page.tsx              # Public dashboard
  (site)/gallery/page.tsx      # Gallery
  (site)/energy/page.tsx       # Energy
  overlay/page.tsx             # OBS overlay
  setup/page.tsx               # First-run wizard
  admin/page.tsx               # Admin login + grow settings
  admin/stream/page.tsx        # Broadcast
  admin/ggs/page.tsx           # Climate and energy settings
  admin/timelapse/page.tsx     # Timelapse settings
  admin/plugins/page.tsx       # Trusted plugin install
  (site)/p/[pluginId]/         # Plugin pages under /p/<plugin>/...
plugins/
  ggs/                         # Spider Farmer climate and tent energy
  timelapse/                   # Snapshots and video
  restream/                    # Twitch program capture
  solar/                       # FENECON / vendor-agnostic solar split
packages/
  plugin-sdk/                  # MIT frontend SDK
  plugin-sdk-python/           # MIT Python host client
  plugin-template/             # MIT starter plugin
data/
  mesh.token                   # Shared mesh token, created on first boot
  plugins/<id>/                # Per-plugin storage after migration
  ggs.env                      # Climate credentials written by the wizard (legacy)
  timelapse.env                # Camera URL written by the wizard (legacy)
  climate/current/             # 5-min climate day files until migration (gitignored)
  ai-summary/                  # Daily AI summaries + scheduler state (gitignored)
```

## 6. Camera (MediaMTX)

The homepage player uses a browser HLS URL. MediaMTX converts the camera RTSP stream. These settings avoided stutter on iOS and some Windows players:

```
hlsAlwaysRemux: true
hlsVariant: fmp4
hlsSegmentCount: 7
hlsSegmentDuration: 1s
hlsPartDuration: 200ms
hlsSegmentMaxSize: 50M
hlsDirectory: ''
hlsMuxerCloseAfter: 60s
hlsAllowOrigin: '*'

paths:
   growcam:
    source: rtsp://USER:PASSWORD@IP.OF.YOUR.CAM/stream1
    sourceProtocol: tcp
    sourceOnDemand: no
```

If playback still stutters, lower the camera frame rate. 15 fps is a reasonable start.

A public stream needs a second Cloudflare hostname for MediaMTX HLS, separate from the GrowCast hostname. Point Broadcast's stream URL at that public HLS path, for example `https://stream.example.com/growcam/`.

The Timelapse plugin uses the camera's RTSP URL directly. That URL is collected in the setup wizard and stored in `data/timelapse.env` (and `data/plugins/growcast.timelapse/timelapse.env` after migration).

## 7. Usage Guide

### Stream setup (RTSP camera + MediaMTX)
GrowCast expects a browser-playable stream URL in the admin dashboard. 
Since some cameras expose RTSP, use MediaMTX to convert RTSP to HLS:

1. Configure your RTSP camera (RTSP source looks somewhat like this: `rtsp://<camera-ip>:554/<path>`).
2. Run MediaMTX and create a path that ingests RTSP.
3. Use MediaMTX HLS output URL as the stream URL on Broadcast (`/admin/stream`), for example:
   - `http://<mediamtx-host>:8888/<path>/`
4. Save on the Broadcast page.

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
  - Serves image files from `plugins/timelapse/snapshots`
- `GET /api/timelapse`
  - Serves timelapse video from `plugins/timelapse/timelapse/latest_timelapse.mp4`
- `GET /api/data/live-climate`
  - Public latest GGS climate JSON (no credentials)
  - `Cache-Control: no-store`
- `GET /api/data/broadcast`
  - `{ "live": true, "login" }` while the homepage Twitch toast may show; otherwise `{ "live": false }`
  - `Cache-Control: no-store, must-revalidate`
- `GET /api/data/live-climate/stream`
  - Public SSE; snapshot on change + heartbeat every 15s
  - Reverse proxy must not buffer this path
    (`nginx`: `location /api/data/live-climate/stream { proxy_buffering off; proxy_http_version 1.1; }`, Caddy: `flush_interval -1`)
- `GET /api/mesh/[pluginId]`
  - Returns registered plugin settings, for example `/api/mesh/growcast.timelapse`
  - Requires the mesh token from the environment or `data/mesh.token`, and a matching `Authorization: Bearer <token>` (fail-closed when both are unset)
- `POST /api/mesh/growcast.ggs/state`
  - Sidecar ingest, Bearer `GROWCAST_MESH_TOKEN`

### Auth model
- Username + scrypt password hash from `.env.local` or from the setup wizard (`data/setup/admin.json`)
- Default `setup:admin` and the wizard require a 12-character password; `--allow-insecure` is local/dev only
- Login verifies the stored scrypt hash (non-empty + max length); it does not re-apply the 12-character setup minimum
- Signed cookie-based sessions (24-hour TTL)
- Optional authenticator (TOTP) and one-time recovery codes in `data/setup/totp.json`, turned on from Admin → Security. Sign-in stays password-only until that file is confirmed.
- If the phone and the recovery codes are both lost, stop GrowCast and delete `data/setup/totp.json`. The next sign-in is password-only. Rotating `ADMIN_SESSION_SECRET` also makes that file unreadable; delete it and turn the authenticator on again.
- In-memory session store (single-node deploy). Recreating the container with `docker compose up --build` signs you out.


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
- `plugins/timelapse` folder missing or no media generated.

Fix:
- Install/run the timelapse plugin and ensure snapshots/timelapse files exist.

### Changes are not visible immediately
Cause:
- Stale page cache after edits.

Fix:
- Restart dev server.