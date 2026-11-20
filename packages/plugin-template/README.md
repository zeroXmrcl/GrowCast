# GrowCast plugin template (MIT)

Copy this folder into `plugins/<folder>/`, change `plugin.json` `id` to a reverse-DNS name (not `growcast.*` unless you are first-party), then enable it in Admin → Plugins.

Build the UI to `ui/dist/index.js` with `react` and `@growcast/plugin-sdk/ui` marked external so the host import map supplies React 19.

The Python backend uses `GROWCAST_URL`, `GROWCAST_PLUGIN_ID`, and `GROWCAST_PLUGIN_TOKEN` injected by GrowCast.
