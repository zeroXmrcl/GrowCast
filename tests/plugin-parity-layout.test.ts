import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";
import {isAdminAuthenticated} from "../lib/admin-auth.ts";
import {PACKED_PLUGIN_ADMIN_AUTH} from "../lib/plugins/packed-host-auth.ts";
import {widgetColumnSpan, widgetJoinsDashboardBoard} from "../lib/plugins/widget-layout.ts";

function src(rel: string): string {
    return readFileSync(path.join(process.cwd(), rel), "utf8");
}

describe("plugin parity layout and public energy", () => {
    it("treats 2x1 live-climate as the dashboard board row", () => {
        assert.equal(widgetColumnSpan("2x1"), 2);
        assert.equal(widgetColumnSpan("1x1"), 1);
        assert.equal(widgetColumnSpan(undefined), 1);
        assert.equal(widgetJoinsDashboardBoard({id: "live-climate", size: "2x1"}), true);
        assert.equal(widgetJoinsDashboardBoard({id: "energy-flow", size: "2x1"}), false);
        assert.equal(widgetJoinsDashboardBoard({id: "energy-flow", size: "2x1"}, {liveClimate: true}), true);
    });

    it("plugin-mount-root is display:contents and does not paint a loading card", () => {
        const css = src(path.join("app", "globals.css"));
        const mount = src(path.join("components", "plugin-mount.tsx"));
        const widgets = src(path.join("components", "plugin-widgets.tsx"));
        assert.match(css, /\.plugin-mount-root\s*\{\s*display:\s*contents;/);
        assert.match(css, /grid-area:\s*plugins/);
        assert.match(mount, /failed && message/);
        assert.doesNotMatch(mount, /Loading plugin…/);
        assert.match(widgets, /slot === "dashboard"/);
        assert.match(widgets, /widgetJoinsDashboardBoard/);
        assert.match(widgets, /growcast-area-plugins grid sm:grid-cols-2/);
        assert.match(widgets, /sm:border-b-0 sm:border-r/);
        assert.doesNotMatch(widgets, /growcast-area-plugins grid gap-4/);
        assert.match(css, /gc-solar-absent/);
        assert.match(widgets, /OVERLAY_ORDER_CLIMATE/);
    });

    it("capture is token-gated and solar overlay widgets default off", () => {
        const restream = JSON.parse(src(path.join("plugins", "restream", "plugin.json"))) as {
            pages: Array<{id: string; public?: boolean}>;
        };
        const solar = JSON.parse(src(path.join("plugins", "solar", "plugin.json"))) as {
            config: Record<string, {default?: unknown}>;
        };
        const capture = restream.pages.find((page) => page.id === "capture");
        assert.equal(capture?.public, undefined);
        const host = src(path.join("plugins", "restream", "host", "index.ts"));
        const site = src(path.join("app", "p", "[pluginId]", "[[...path]]", "page.tsx"));
        assert.match(host, /export async function authorizePage/);
        assert.match(site, /authorizePage/);
        assert.match(site, /pageData/);
        assert.equal(solar.config.overlayWidgets.default, false);
        const routes = src(path.join("lib", "plugins", "routes.ts"));
        assert.match(routes, /overlayWidgets/);
    });

    it("binds packed plugin admin auth onto globalThis", async () => {
        const bound = (globalThis as Record<symbol, unknown>)[PACKED_PLUGIN_ADMIN_AUTH];
        assert.equal(typeof bound, "function");
        assert.equal(await (bound as typeof isAdminAuthenticated)(), await isAdminAuthenticated());
    });

    it("admin toast does not fetch plugin-notices until signed in", () => {
        const layout = src(path.join("app", "admin", "layout.tsx"));
        const toast = src(path.join("app", "admin", "admin-toast.tsx"));
        assert.match(layout, /loggedIn \? \(/);
        assert.match(layout, /<AdminToast enabled\/>/);
        assert.match(toast, /if \(!enabled\)/);
    });

    it("keeps overlay settings on Broadcast and AI Assessment on GGS admin", () => {
        const grow = src(path.join("app", "admin", "page.tsx"));
        const pluginAdmin = src(path.join("app", "admin", "plugins", "[pluginId]", "[[...path]]", "page.tsx"));
        assert.doesNotMatch(grow, /StreamSettingsFields/);
        assert.match(pluginAdmin, /StreamSettingsFields/);
        assert.match(pluginAdmin, /AiSummaryPanel/);
        assert.match(pluginAdmin, /pluginAdminShowsStreamSettings/);
        assert.match(pluginAdmin, /pluginAdminShowsAiSummary/);
        const extras = src(path.join("lib", "plugins", "admin-host-extras.ts"));
        assert.match(extras, /exports\?\.broadcast/);
        assert.match(extras, /exports\?\.liveClimate/);
    });
});
