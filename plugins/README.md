# plugins/

## Quick install

1. Download a plugin release dist.
2. Extract it here as `plugins/<folder>/` so `plugin.json` is at that path.
3. Enable it in GrowCast **Admin → Plugins**.

Installed plugin distributions live here, one folder per plugin.

GrowCast GGS is not vendored in this repository. Install it from
GrowCast-GGS at `plugins/ggs/`. This branch still contains Timelapse,
Restream, and Solar under `plugins/{timelapse,restream,solar}`. A site
header link appears only when a plugin is installed, enabled, and
declares `nav: "site"`.

See [docs/plugins/INSTALL.md](../docs/plugins/INSTALL.md).
