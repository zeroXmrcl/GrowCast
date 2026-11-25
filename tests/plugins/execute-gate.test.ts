import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {meshPluginGetResponse} from "../../lib/mesh-http.ts";
import {listActiveHosts, runPluginSetup} from "../../lib/plugins/hooks.ts";
import {pluginPublicDispatch, pluginProxyResponse} from "../../lib/plugins/http.ts";
import {enablePlugin} from "../../lib/plugins/registry.ts";
import {SAMPLE_MANIFEST, withPluginHarness} from "./helpers.ts";

const HOST = `
let calls = 0;
export function callsSoFar() { return calls; }
export async function handlePublic() {
  calls += 1;
  return new Response("public");
}
export async function handleAction() {
  calls += 1;
  return new Response("action");
}
export async function meshSettings() {
  calls += 1;
  return {pluginId: "community.example", settings: {calls}};
}
export async function handleSetup() {
  calls += 1;
  return {ok: true};
}
`;

const MANIFEST = {
    ...SAMPLE_MANIFEST,
    hostModule: "host/index.js",
    compat: {meshSettings: true},
    installer: {
        stepId: "example-setup",
        sort: 40,
        label: "Example",
        title: "Example setup",
        line: "Optional plugin step.",
    },
};

describe("plugin execution gate", {concurrency: 1}, () => {
    it("does not run host code until the plugin is installed, enabled, and pinned", async () => {
        const previousMesh = process.env.GROWCAST_MESH_TOKEN;
        process.env.GROWCAST_MESH_TOKEN = "mesh-test-token";
        try {
            await withPluginHarness(async ({writePlugin}) => {
                await writePlugin("example", MANIFEST, {"host/index.js": HOST});
                const request = new Request("http://127.0.0.1/plugins/community.example/live");
                const mesh = new Request("http://127.0.0.1/api/mesh/plugins/community.example", {
                    headers: {authorization: "Bearer mesh-test-token"},
                });

                assert.equal((await pluginPublicDispatch(request, "community.example", "live")).status, 404);
                assert.equal((await pluginProxyResponse(request, "community.example", "ping", async () => true)).status, 409);
                assert.equal((await meshPluginGetResponse(mesh, "community.example")).status, 409);
                assert.equal((await listActiveHosts()).length, 0);
                assert.equal(await runPluginSetup("example-setup", new FormData()), null);

                await enablePlugin("community.example");
                assert.equal((await pluginPublicDispatch(request, "community.example", "live")).status, 200);
                assert.equal((await pluginProxyResponse(request, "community.example", "ping", async () => true)).status, 200);
                assert.equal((await meshPluginGetResponse(mesh, "community.example")).status, 200);
                assert.equal((await listActiveHosts()).length, 1);
                const setup = await runPluginSetup("example-setup", new FormData());
                assert.equal(setup?.ok, true);
            });
        } finally {
            if (previousMesh === undefined) {
                delete process.env.GROWCAST_MESH_TOKEN;
            } else {
                process.env.GROWCAST_MESH_TOKEN = previousMesh;
            }
        }
    });
});
