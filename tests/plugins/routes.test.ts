import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {enablePlugin, getRegistryRecord, pluginIsActive} from "../../lib/plugins/registry.ts";
import {resolvePluginPage, widgetsForSlot, isRoutablePlugin} from "../../lib/plugins/routes.ts";
import {pluginSiteNavItems} from "../../lib/plugins/nav.ts";
import {SAMPLE_MANIFEST, withPluginHarness} from "./helpers.ts";

describe("plugin route mounting", {concurrency: 1}, () => {
    it("resolves /p/<plugin>/ to a declared site page", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            const manifest = {...SAMPLE_MANIFEST, id: "community.routes-home"};
            await writePlugin("example", manifest);
            await enablePlugin("community.routes-home");
            const page = await resolvePluginPage("community.routes-home", [], "site");
            assert.equal(page?.page.id, "home");
            assert.equal(page?.public, true);
        });
    });

    it("returns null for an unknown path (core pages keep winning)", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            const manifest = {...SAMPLE_MANIFEST, id: "community.routes-unknown"};
            await writePlugin("example", manifest);
            await enablePlugin("community.routes-unknown");
            const page = await resolvePluginPage("community.routes-unknown", ["not-declared"], "site");
            assert.equal(page, null);
        });
    });

    it("does not resolve pages while the plugin is only discovered", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            const manifest = {...SAMPLE_MANIFEST, id: "community.routes-discovered"};
            await writePlugin("example", manifest);
            const record = await getRegistryRecord("community.routes-discovered");
            assert.equal(record?.status, "discovered", JSON.stringify(record));
            assert.equal(pluginIsActive(record), false, JSON.stringify(record));
            assert.equal(isRoutablePlugin(record), false, JSON.stringify(record));
            const page = await resolvePluginPage("community.routes-discovered", [], "site");
            assert.equal(page, null, "discovered plugins must not mount routes until enabled");
        });
    });

    it("lists dashboard widgets and site nav from enabled plugins", async () => {
        await withPluginHarness(async ({writePlugin}) => {
            const manifest = {...SAMPLE_MANIFEST, id: "community.routes-nav"};
            await writePlugin("example", manifest);
            await enablePlugin("community.routes-nav");
            const widgets = await widgetsForSlot("dashboard");
            assert.equal(widgets.length, 1);
            assert.equal(widgets[0]?.widget.id, "stat");
            const nav = await pluginSiteNavItems();
            assert.equal(nav[0]?.href, "/p/routes-nav");
        });
    });
});
