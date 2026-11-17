# Migrating sidecar data into the plugin host

Someone else takes the production backup. **Never run this against production from a developer machine.** This document is the exact local/staging procedure.

## What moves

| Legacy path | Plugin path |
|-------------|-------------|
| `data/energy/` | `data/plugins/growcast.ggs/energy/` |
| `data/climate/` | `data/plugins/growcast.ggs/climate/` |
| `data/mesh/growcast.ggs.json` | `data/plugins/growcast.ggs/live.json` |
| `data/ggs.env` | `data/plugins/growcast.ggs/ggs.env` |
| `data/mesh/growcast.timelapse.json` | `data/plugins/growcast.timelapse/settings.json` |
| `data/timelapse.env` | `data/plugins/growcast.timelapse/timelapse.env` |
| `data/restream/` | `data/plugins/growcast.restream/` |

Legacy files are **copied**, not deleted. Core path helpers read the plugin directory when it exists and otherwise keep using the legacy location, so a failed apply does not strand the app.

## Steps

1. Stop GrowCast (`docker compose stop`) so sidecars are not writing.
2. Take a full copy of `./data` (and `./plugins/timelapse/snapshots` plus `timelapse` media if you care about stills).
3. Dry-run:

```bash
GROWCAST_DATA_DIR=./data node --experimental-strip-types scripts/migrate-plugin-data.ts --dry-run
```

4. Apply (still local/staging only):

```bash
GROWCAST_DATA_DIR=./data node --experimental-strip-types scripts/migrate-plugin-data.ts --apply
```

5. Optional: pin and enable the first-party plugins (prints the install warning in Admin either way):

```bash
GROWCAST_DATA_DIR=./data node --experimental-strip-types scripts/migrate-plugin-data.ts --apply --enable-first-party
```

6. Start GrowCast. In **Admin → Plugins**, confirm each SHA-256 and enable GGS, Timelapse, Restream, and Solar if step 5 was skipped.
7. GrowCast writes `compose.plugins.generated.yml` and starts plugin containers. No extra docker command is required after enable.

## Verification checks

- `data/plugins/growcast.ggs/energy/current/` contains the same `YYYY-MM-DD.json` files as `data/energy/current/`.
- A known energy day file has the same byte length (or JSON `hours` keys) in both trees.
- `GET /api/data/energy?grow=current` still returns the same `kWh` for today after apply (compare a saved response from before).
- `GET /api/data/live-climate` still returns the last GGS snapshot.
- Gallery still lists snapshots; Broadcast still reads `control.json`.
- Running `--apply` a second time reports only skips.

## Rollback

1. `docker compose stop`
2. Restore the `./data` backup taken in step 2.
3. Remove `data/plugins/` if you want a clean tree (`rm -rf data/plugins`).
4. Start GrowCast. Path helpers fall back to legacy `data/energy`, `data/climate`, `data/mesh`, `data/restream`.

Do not delete the legacy trees until you have confirmed a full grow-day of energy and climate after cutover.

## Tests

```bash
node --experimental-strip-types --import ./tests/register.mjs --test tests/plugins/migration.test.ts
```
