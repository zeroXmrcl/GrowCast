# GrowCast plugin system

A plugin is a folder in `plugins/` with `plugin.json`, an optional backend, and an optional `ui/dist` bundle. Core is the generic host: discovery, trusted install (SHA-256 pin), per-plugin tokens, ingest/heartbeat validation, storage under `data/plugins/<id>/`, generic routes, and compose generation.

First-party plugins (this repo):

- `growcast.ggs` — Spider Farmer climate and tent energy
- `growcast.timelapse` — snapshots and video
- `growcast.restream` — Twitch program capture
- `growcast.solar` — FENECON / vendor-agnostic solar split

Install: copy the folder into `plugins/`, open **Admin → Plugins**, read the warning, confirm the hash, enable. GrowCast starts the backend. If files change, the plugin is paused until the new hash is confirmed.

Plugin pages live under `/p/<plugin>/...`. Admin pages under `/admin/plugins/<id>/...`. Core routes always win.

The frontend SDK (`packages/plugin-sdk`, MIT) is shared through an import map so plugin UI uses core's React 19. The Python SDK (`packages/plugin-sdk-python`, MIT) posts ingest and heartbeats.

See [MIGRATION.md](./MIGRATION.md) and [HOST-API.md](./HOST-API.md).
