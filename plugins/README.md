# plugins/

## Quick install

1. Download a plugin release dist.
2. Extract it here as `plugins/<folder>/` so `plugin.json` is at that path.
3. Enable it in GrowCast **Admin → Plugins**.

Installed plugin distributions live here, one folder per plugin.

Core does not ship plugins. GrowCast builds, tests, and runs with this
directory empty except for this README. A site header link appears only
when a plugin is installed, enabled, and declares `nav: "site"`.

See [docs/plugins/INSTALL.md](../docs/plugins/INSTALL.md).
