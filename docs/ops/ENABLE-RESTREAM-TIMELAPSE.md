# Enable Restream and Timelapse

Both plugins stay disabled until you enable them in Admin. Nothing in this checklist enables them, starts their old containers, or deletes legacy media.

Prod stopped the legacy Restream and Timelapse containers when plugins moved. Their manifests are discovered only. Enable pins a SHA-256 of the plugin folder and pauses the plugin if that folder changes until you confirm the new hash.

Do this while you are at the screen. GGS also pauses when its folder hash changes, and climate ingest stops until you confirm that hash.

## Before you enable

1. Build the images the manifests name. From the plugin checkouts (the directories that contain each `Dockerfile`):

```bash
docker build -t growcast-plugin-restream:local /path/to/GrowCast-Restream/plugins/restream
docker build -t growcast-plugin-timelapse:local /path/to/GrowCast-Timelapse
```

2. Confirm each `plugin.json` has `"id"` of `growcast.restream` or `growcast.timelapse`, a `runtime.image` equal to the tag you built, and no field that enables the plugin by itself. GrowCast only enables a plugin from Admin.

3. Copy legacy data into the plugin data directories. Dry-run first. These commands copy. They do not move or delete.

```bash
GROWCAST_DATA_DIR=./data npx tsx scripts/migrate-plugin-data.ts --dry-run
GROWCAST_DATA_DIR=./data npx tsx scripts/migrate-plugin-data.ts --apply
```

That copies `data/restream/` to `data/plugins/growcast.restream/` when the plugin directory does not already have the files. Restream's host and the container both use that plugin directory (`/data` in the container). They do not keep writing `data/restream/`.

Timelapse settings stay in `data/mesh/growcast.timelapse.json`. The sidecar reads them with `GET /api/mesh/growcast.timelapse`. That file is still the settings store.

4. Copy timelapse media into the plugin data directory. Default is a dry run. `--apply` copies and does not move or delete the originals.

```bash
npx tsx scripts/migrate-timelapse-media.ts --install-root . --data-dir ./data
npx tsx scripts/migrate-timelapse-media.ts --install-root . --data-dir ./data --apply
```

Sources, when they exist:

- `extensions/GrowCast-Timelapse/snapshots/` → `data/plugins/growcast.timelapse/snapshots/`
- `timelapse/latest_timelapse.mp4` → `data/plugins/growcast.timelapse/timelapse/latest_timelapse.mp4`
- `plugins/timelapse/snapshots/` and `plugins/timelapse/timelapse/` the same way

The timelapse container writes new stills to `/data/snapshots` and new video to `/data/timelapse`, which is this plugin data directory. The gallery reads that directory first.

## Enable

Admin → Plugins.

1. Confirm the GGS hash first if GGS is paused. Climate ingest stays paused until you do.
2. Open Restream. Confirm the hash. Enable. Do not press Start on Broadcast until a stream key is saved.
3. Open Timelapse. Confirm the hash. Enable. The worker waits until an RTSP URL and the plugin token are both present. It does not start a second copy of the old exited container.

## Smoke checks

- Admin → Plugins shows Restream and Timelapse enabled, not paused for hash mismatch.
- Restream: saving control state creates `data/plugins/growcast.restream/control.json`. The container log follows that file. Broadcast stays idle until you press Start.
- Timelapse: `GET /api/mesh/growcast.timelapse` with the mesh bearer token returns the schedule. After a capture, `data/plugins/growcast.timelapse/snapshots/` has a new still and the gallery lists it.
- Public `/p/timelapse/gallery` loads. It does not require the legacy `extensions/` path.

## Rollback

Admin → Plugins → Disable Restream and Timelapse. That stops the plugin containers through the docker proxy. Leave `data/plugins/growcast.restream` and `data/plugins/growcast.timelapse` in place. The copied media and the original files are both still on disk. To return to the previous plugin bits, check out the previous commit, rebuild the two images with the same tags, and enable again only if you want them running.
