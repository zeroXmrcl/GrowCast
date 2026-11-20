# Plugin cutover runbook

## Placeholders

| Placeholder | Meaning |
|-------------|---------|
| `<host>` | SSH name of the GrowCast machine |
| `<install-dir>` | Compose project directory on that machine |
| `<your-domain>` | Public HTTPS hostname of this instance |

This is the operator procedure for the GrowCast host **`<host>`**. A human ops agent runs it later. **Never run this from a laptop against production. Never delete legacy data folders until the owner gives an explicit go.**

First-party plugins (GGS, Timelapse, Restream, Solar) are **not** auto-enabled. After the update they stay discovered until you enable them in **Admin → Plugins**. Enable them immediately after start or climate, energy, snapshots, and broadcast ingest stop and you will see gaps.

## 0. Prerequisites

- SSH to **`<host>`** as the account that owns the GrowCast compose project.
- Docker Engine and Compose v2 on the host (the host, not the GrowCast container, builds plugin images).
- Disk space: at least 2× `data/` plus plugin media (`plugins/timelapse/snapshots`, `plugins/timelapse/timelapse`).
- Confirm you are in the GrowCast project directory (the folder that contains `docker-compose.yml`, `.env.local`, `data/`, `plugins/`).
- Confirm the current git branch you are deploying is `feat/plugin-system` (or the tagged cutover commit). Do not merge or deploy from another machine.
- Note the public origin (`GROWCAST_PUBLIC_URL` / Cloudflare Tunnel hostname) and that Admin is reachable after restart.
- Stop writing from other sessions. Sidecars should not be ingesting during the backup.

Suggested working directory:

```bash
cd <install-dir>
pwd
ls docker-compose.yml .env.local data plugins
```

## 1. Full backup (before any update)

Stop the stack so files are consistent:

```bash
docker compose stop
```

Stamp a backup directory on the same host (keep it until the owner says the cutover is good):

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="/var/backups/growcast-$STAMP"
mkdir -p "$BACKUP"
```

Copy live data, env, compose, plugin media, and currently running images:

```bash
# Project files
cp -a data "$BACKUP/data"
cp -a plugins "$BACKUP/plugins"
cp -a docker-compose.yml "$BACKUP/"
cp -a compose.plugins.generated.yml "$BACKUP/" 2>/dev/null || true
cp -a .env.local "$BACKUP/" 2>/dev/null || true
cp -a .env "$BACKUP/" 2>/dev/null || true
git rev-parse HEAD > "$BACKUP/git-head.txt"
git status --porcelain > "$BACKUP/git-status.txt"

# Plugin media (also under plugins/, copied above; extra copies if those dirs are bind-mounted elsewhere)
cp -a plugins/timelapse/snapshots "$BACKUP/timelapse-snapshots" 2>/dev/null || true
cp -a plugins/timelapse/timelapse "$BACKUP/timelapse-video" 2>/dev/null || true

# Images currently on the host
docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.CreatedAt}}' > "$BACKUP/docker-images.txt"
docker compose images > "$BACKUP/compose-images.txt" 2>/dev/null || true
docker save -o "$BACKUP/growcast-images.tar" \
  $(docker compose images -q | sort -u)
```

What must be in the backup:

| Path | Why |
|------|-----|
| `data/` | Grow JSON, archives, AI summaries, mesh token, plugin storage, legacy energy/climate/restream |
| `data/.env` files (`ggs.env`, `timelapse.env`) | Sidecar credentials |
| `.env` / `.env.local` | Admin hash, session secret, mesh token, Twitch, xAI |
| `docker-compose.yml` and `compose.plugins.generated.yml` | Compose topology |
| `plugins/` including `plugins/timelapse/snapshots` and `timelapse` | Plugin source + stills/video |
| Docker images | Rollback without rebuilding |

Record sizes:

```bash
du -sh "$BACKUP" data plugins
ls -l "$BACKUP/growcast-images.tar"
```

Do **not** start the stack again until the update and migration below are done, unless you are aborting.

## 2. Update and build

```bash
git fetch origin feat/plugin-system
git checkout feat/plugin-system
git pull --ff-only origin feat/plugin-system
git log -1 --oneline
```

Build plugin UI (ES modules under `plugins/*/ui/dist`), plugin host bundles (`plugins/*/host/dist`), and the website image on the host. The GrowCast container does **not** mount `/var/run/docker.sock`; it talks to in-repo `docker-plugin-proxy`. That proxy allowlists list/inspect/start/stop/restart/logs (and a checked create/delete) for containers labeled `growcast.plugin=<id>`. See [DOCKER-PROXY.md](./DOCKER-PROXY.md). Plugin images are built here, on the host:

```bash
npm ci
npm run build:plugin-runtime
npm run build:plugin-host
npm run build:plugin-ui
docker compose build growcast docker-plugin-proxy
```

Set `GROWCAST_HOST_PROJECT` to this directory (the engine bind-mounts host paths). After first enable, generated plugin services appear in `compose.plugins.generated.yml` for operators; GrowCast does not run `docker compose` against it. Pre-build plugin images from the plugin Dockerfiles:

```bash
export GROWCAST_HOST_PROJECT="$(pwd)"
# GGS source is the GrowCast-GGS repo, not this host checkout.
docker build -t growcast-plugin-ggs:local /path/to/GrowCast-GGS/plugins/ggs
docker build -t growcast-plugin-timelapse:local plugins/timelapse
docker build -t growcast-plugin-restream:local plugins/restream
docker build -t growcast-plugin-solar:local plugins/solar
```

The supervisor starts/stops plugin containers only (`plugin-<id>` with label `growcast.plugin=<id>`). It cannot exec, build, or manage images/networks/volumes, and it will refuse `growcast` and `docker-plugin-proxy`.

Start the website (proxy + GrowCast). Plugins stay off until Admin enable:

```bash
GROWCAST_HOST_PROJECT="$(pwd)" docker compose up -d docker-plugin-proxy growcast
docker compose ps
docker compose logs -n 80 growcast
```

Confirm GrowCast did **not** mount the raw socket:

```bash
docker inspect growcast --format '{{json .Mounts}}' | grep -v docker.sock || true
docker inspect "$(docker compose ps -q growcast)" --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

The proxy may mount `/var/run/docker.sock:ro`. The GrowCast container must not.

## 3. Migration dry-run, then apply

Still on `<host>`, in the project directory. Default is dry-run:

```bash
GROWCAST_DATA_DIR=./data node --experimental-strip-types scripts/migrate-plugin-data.ts --dry-run
```

Read the plan. Expected copies:

| Legacy path | Plugin path |
|-------------|-------------|
| `data/energy/` | `data/plugins/growcast.ggs/energy/` |
| `data/climate/` | `data/plugins/growcast.ggs/climate/` |
| `data/mesh/growcast.ggs.json` | `data/plugins/growcast.ggs/live.json` |
| `data/ggs.env` | `data/plugins/growcast.ggs/ggs.env` |
| `data/mesh/growcast.timelapse.json` | `data/plugins/growcast.timelapse/settings.json` |
| `data/timelapse.env` | `data/plugins/growcast.timelapse/timelapse.env` |
| `data/restream/` | `data/plugins/growcast.restream/` |

Apply (copy only, **no delete**, **no enable**):

```bash
GROWCAST_DATA_DIR=./data node --experimental-strip-types scripts/migrate-plugin-data.ts --apply
```

`--enable-first-party` was removed. If you pass it, the script exits 2 and does nothing. Enable in Admin.

A second `--apply` must only print skips.

Leave the legacy folders in place until the owner explicitly says to delete them.

## 4. Enable plugins in Admin immediately

Open `https://<public-origin>/admin/plugins` (or the LAN origin). You should see a banner listing installed-but-disabled plugins.

For **each** of GGS, Timelapse, Restream, Solar:

1. Read the trust warning.
2. Confirm the SHA-256 hash.
3. Enable.

Do this **immediately** after apply. Until enable:

- GGS mesh ingest returns 409 and climate/energy stop updating.
- Timelapse sidecar settings/mesh are unused.
- Restream capture/program/EventSub stay off.
- Solar public tiles stay empty.

GrowCast starts each plugin container through `docker-plugin-proxy` when you enable it. You do not need to run `docker compose` against `compose.plugins.generated.yml`; that file is an operator snapshot of the intended services.

```bash
docker ps --filter label=growcast.plugin
```

## 5. Verification checklist

Data continuity:

- [ ] `data/plugins/growcast.ggs/energy/current/` has the same `YYYY-MM-DD.json` files as `data/energy/current/`.
- [ ] A known energy day file has the same byte length (or the same `hours` keys) in both trees.
- [ ] `data/plugins/growcast.ggs/climate/current/` matches `data/climate/current/` for the last several days.
- [ ] Last GGS live snapshot exists at `data/plugins/growcast.ggs/live.json` (or the legacy mesh file if copy skipped).
- [ ] After enable, `GET /api/data/plugins/ggs/energy?grow=current` returns the same kWh as a saved pre-cutover `GET /api/data/energy?grow=current`.
- [ ] After enable, `GET /api/data/plugins/ggs/live-climate` returns the last GGS snapshot; `updatedAt` is recent once the sidecar posts again.
- [ ] No hole in climate/energy timestamps across the cutover (compare last pre-cutover point to first post-enable point).
- [ ] Gallery `/p/timelapse/gallery` lists stills; `/api/data/plugins/timelapse/latest` works.
- [ ] Overlay `/overlay` shows identity plus plugin widgets (climate/gear/energy/solar once enabled).
- [ ] Program monitor iframe is `/p/restream/program`; capture URL is `/p/restream/capture`.
- [ ] Broadcast toast on the public site after Restream is enabled and live.
- [ ] Solar public tiles (PV, battery, grid, tent share) default on; battery discharge origin is `always-solar`.
- [ ] Admin → Plugins no longer shows the “installed but not enabled” banner.

Redirects (308). Hit each old URL and confirm the new location:

| Old | New |
|-----|-----|
| `/energy` | `/p/ggs/energy` |
| `/gallery` | `/p/timelapse/gallery` |
| `/admin/ggs` | `/admin/plugins/growcast.ggs` |
| `/admin/timelapse` | `/admin/plugins/growcast.timelapse` |
| `/admin/stream` | `/admin/plugins/growcast.restream` |
| `/admin/broadcast` | `/admin/plugins/growcast.restream` |
| `/program` | `/p/restream/program` |
| `/overlay/capture` | `/p/restream/capture` |
| `/api/data/energy` | `/api/data/plugins/ggs/energy` |
| `/api/data/live-climate` | `/api/data/plugins/ggs/live-climate` |
| `/api/data/live-climate/stream` | `/api/data/plugins/ggs/live-climate/stream` |
| `/api/data/climate-history` | `/api/data/plugins/ggs/climate-history` |
| `/api/data/broadcast` | `/api/data/plugins/restream/broadcast` |
| `/api/snapshots/:filename` | `/api/data/plugins/timelapse/snapshots/:filename` |
| `/api/timelapse` | `/api/data/plugins/timelapse/latest` |
| `/api/overlay/music/:filename` | `/api/data/plugins/restream/music/:filename` |
| `/api/overlay/program-audio` | `/api/data/plugins/restream/program-audio` |
| `/api/overlay/program-camera` | `/api/data/plugins/restream/program-camera` |
| `/api/overlay/program-alerts` | `/api/data/plugins/restream/program-alerts` |
| `/api/admin/camera-look` | `/api/plugins/v1/growcast.restream/x/camera-look` |
| `/api/admin/music` | `/api/plugins/v1/growcast.restream/x/music` |
| `/api/admin/program-alert` | `/api/plugins/v1/growcast.restream/x/program-alert` |

Keep these as **dispatchers** (Twitch may not follow redirects): `/api/twitch/eventsub`, `/admin/stream/twitch-connect`, `/admin/stream/twitch-callback`.

Admin hashes: `#stream` / `#twitch` → Restream admin; `#timelapse` → Timelapse admin; `#energy` → GGS admin; `#archive` → `/admin/archives`.

## 6. Rollback

1. `docker compose stop`
2. Restore the backup from step 1 (`cp -a "$BACKUP/data" ./data`, env files, compose files, `plugins/` if needed).
3. `docker load -i "$BACKUP/growcast-images.tar"` if images were replaced.
4. Check out the previous git HEAD from `$BACKUP/git-head.txt` if the tree was updated.
5. `docker compose up -d`
6. Path helpers still read legacy `data/energy`, `data/climate`, `data/mesh`, `data/restream` when the plugin copy is absent.

Do **not** `rm -rf data/plugins` or legacy trees unless the owner says so. A failed apply must not strand the app.

## 7. After the owner’s explicit go

Only then delete old data folders (not part of this runbook’s automatic steps):

```bash
# OWNER GO REQUIRED. Do not run until told.
# rm -rf data/energy data/climate data/restream data/ggs.env data/timelapse.env
# rm -f data/mesh/growcast.ggs.json data/mesh/growcast.timelapse.json
```

## Tests (developer / staging)

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/plugins/migration.test.ts tests/plugins/core-isolation.test.ts tests/plugins/docker-guard.test.ts
```
