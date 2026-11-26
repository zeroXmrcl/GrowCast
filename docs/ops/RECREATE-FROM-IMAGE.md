# Recreate the GrowCast container from an image

Use this when the running container was patched in place and you need the same fix from a built image. Run it from a checkout of the commit you intend to boot. These commands do not tag, publish, or change repository visibility.

The image build sets `BUILD_STANDALONE=1`. `next.config.ts` traces the Next entry shims that plugin host bundles import at runtime:

- `node_modules/next/headers.js`
- `node_modules/next/navigation.js`
- `node_modules/next/cache.js`

The runner stage copies `.next/standalone`, so those files have to be inside that tree.

## Build

From the GrowCast checkout:

```bash
git checkout <commit>
docker compose build growcast
```

Compose tags that image `0xmrcl/growcast:latest`. To keep the previous tag untouched, build a second name:

```bash
docker build -t growcast:release-ready .
```

If you use the second name, set `image: growcast:release-ready` on the `growcast` service for the recreate below, then put the compose image name back when you roll forward for real.

## Verify the shim inside the image

```bash
docker run --rm --entrypoint node growcast:release-ready -e '
const fs = require("fs");
for (const name of ["headers.js", "navigation.js", "cache.js"]) {
  const file = "node_modules/next/" + name;
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    console.error("missing", file);
    process.exit(1);
  }
  console.log("ok", file);
}
'
```

Use `0xmrcl/growcast:latest` instead of `growcast:release-ready` when you built with `docker compose build growcast`.

A checkout can check the same files without Docker after `BUILD_STANDALONE=1 npm run build`:

```bash
node scripts/verify-next-entry-shims.mjs
```

## Recreate the container

Stay in the directory that holds `docker-compose.yml` and the existing `./data` mount.

```bash
docker compose up -d --no-deps --force-recreate growcast
```

`--no-deps` leaves `docker-plugin-proxy` running. This does not recreate plugin containers. `./data` and `./plugins` stay on the host.

If the GGS plugin files changed, Admin shows a hash mismatch and GGS stays paused until that hash is confirmed. Confirm it only when you are at the screen.

## Smoke checks

```bash
docker compose ps growcast
docker compose logs --tail=80 growcast
curl -fsS "http://${GROWCAST_BIND:-127.0.0.1}:${GROWCAST_PORT:-3000}/api/data/plugins/ggs/climate-history?range=24h"
```

A healthy history response is JSON with `24h`, `7d`, and `30d`. Ingest returns 409 while a plugin is paused for hash mismatch. The public history route still reads climate files already on disk.

## Rollback

```bash
git checkout <previous-commit>
docker compose build growcast
docker compose up -d --no-deps --force-recreate growcast
```

Leave `./data` in place. Do not delete `data/plugins`.
