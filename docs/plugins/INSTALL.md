# Install a plugin from a GitHub release

GrowCast loads plugins from folders under `plugins/`. Core does not vendor
plugin source. Each plugin publishes its own GitHub repo and a release
**dist** artifact. You download that artifact, drop it into `plugins/<id>/`,
and enable it in Admin.

First-party plugins:

| Plugin | Repo | Folder |
|--------|------|--------|
| GrowCast GGS | [GrowCast-GGS](https://github.com/zeroXmrcl/GrowCast-GGS) | `plugins/ggs/` |
| GrowCast Timelapse | [GrowCast-Timelapse](https://github.com/zeroXmrcl/GrowCast-Timelapse) | `plugins/timelapse/` |
| GrowCast Restream | [GrowCast-Restream](https://github.com/zeroXmrcl/GrowCast-Restream) | `plugins/restream/` |
| GrowCast Solar | [GrowCast-Solar](https://github.com/zeroXmrcl/GrowCast-Solar) | `plugins/solar/` |

The SDK is [GrowCast-SDK](https://github.com/zeroXmrcl/GrowCast-SDK). You do
not install the SDK into `plugins/`. Core serves one import-map runtime
(`public/plugin-runtime/plugin-sdk-ui.js`) built from `@growcast/plugin-sdk`.
Plugin UI marks `react` and `@growcast/plugin-sdk/ui` external.

## Dist contents

The release asset is a `.tar.gz` or `.zip`. After extract, `plugins/<id>/`
must contain:

- `plugin.json` (required)
- `ui/dist/index.js` and any `ui/dist` styles listed in `plugin.json`
- `host/dist/index.js` when the plugin has a host module
- backend entry + `Dockerfile` when `runtime.type` is `docker` (or `python` / `node`)
- `LICENSE`

Do not nest an extra folder (`plugins/solar/solar/plugin.json` will not
load). The folder name is the last label of the plugin id (`growcast.solar`
→ `solar`) so Docker binds stay `{project}/plugins/<folder>:/plugin:ro`.

A good release also publishes:

- a checksum of the archive (`*.tar.gz.sha256`)
- `GROWCAST-HASH` — the GrowCast folder pin (`sha256:` + 64 hex chars) for
  the extracted tree, which is what Admin shows

GrowCast's pin is a hash of the extracted files (it skips `host/dist`,
`node_modules`, snapshots, and other build/media dirs). It is **not** the
SHA-256 of the tarball.

## Install

On the GrowCast host, in the compose project directory:

```bash
cd <install-dir>
ls docker-compose.yml plugins
```

1. Open the plugin repo → **Releases** → download the dist for the version
   you want, plus its archive checksum.
2. Check the download:

   ```bash
   sha256sum -c growcast-solar-0.1.0.tar.gz.sha256
   ```

3. Extract into `plugins/<id>/`. Replace `<id>` with the folder from the
   table (`solar`, `ggs`, `timelapse`, `restream`):

   ```bash
   mkdir -p plugins/solar
   tar -xzf growcast-solar-0.1.0.tar.gz -C plugins/solar --strip-components=1
   ls plugins/solar/plugin.json plugins/solar/ui/dist/index.js
   ```

4. If the dist includes `GROWCAST-HASH`, keep it next to `plugin.json`.
5. Restart is not required for discovery. Open **Admin → Plugins**.
6. Read the trusted-install warning. Confirm the **SHA-256** line matches
   `GROWCAST-HASH` when that file is present. Tick the trust checkbox and
   **Enable**.

GrowCast pins that hash, mints a per-plugin token, and starts the backend
through `docker-plugin-proxy`. First-party plugins are never auto-enabled.

If the plugin image is not on the host yet, build it from the dist
Dockerfile (on the host, not inside the GrowCast container):

```bash
docker build -t growcast-plugin-solar:local plugins/solar
```

Image names must match `growcast-plugin-<folder>:local` (or an extra tag
in `GROWCAST_PLUGIN_IMAGES`).

## Check the SHA-256

Admin → Plugins shows `SHA-256: sha256:<64 hex chars>` for the folder as
GrowCast hashed it.

- If `GROWCAST-HASH` is in the dist, the two strings must be identical.
- If files change after enable, the plugin is **paused** until you confirm
  the new hash. Do not tick enable on a hash you did not expect.

To print the same pin the host uses (from this repo):

```bash
node --experimental-strip-types -e '
import {hashPluginFolder} from "./lib/plugins/hash.ts";
console.log(await hashPluginFolder("plugins/solar"));
'
```

## Update

1. Disable is optional. Replacing files while enabled pauses the plugin on
   the next scan (hash mismatch).
2. Download the new dist, verify the archive checksum, extract over
   `plugins/<id>/` (keep `data/plugins/<id>/` — config and history stay).
3. In Admin → Plugins the status is paused. Confirm the new SHA-256
   matches `GROWCAST-HASH` for that release, tick trust, enable.

Do not mix files from two versions in one folder.

## Remove

1. **Admin → Plugins → Disable**. GrowCast stops the container.
2. Delete the dist:

   ```bash
   rm -rf plugins/solar
   ```

3. Config, tokens, and history stay in `data/plugins/<plugin-id>/` until
   you delete them. Remove that directory only if you want a clean slate:

   ```bash
   rm -rf data/plugins/growcast.solar
   ```

Core keeps running with an empty `plugins/` (this README only). Pages and
widgets from the removed plugin disappear; other plugins are unchanged.

## Troubleshooting

- **Not listed in Admin:** `plugin.json` is missing or nested one folder too
  deep. `plugins/<id>/plugin.json` must exist.
- **Enable does nothing / paused:** the folder hash changed. Confirm the
  new hash, or restore the files you enabled.
- **Backend does not start:** the image is missing, `GROWCAST_HOST_PROJECT`
  is unset, or the proxy refused create (privileged, extra binds, wrong
  name). See [DOCKER-PROXY.md](./DOCKER-PROXY.md).
- **UI is blank:** `ui/dist/index.js` is missing, or it bundled its own
  React. Rebuild with `react` and `@growcast/plugin-sdk/ui` external.
- **Empty plugins/ is valid.** Admin shows "No plugins". The site, overlay,
  and admin settings still work.
