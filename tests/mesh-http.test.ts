import assert from "node:assert/strict";
import {afterEach, describe, it} from "node:test";
import {meshPluginGetResponse, meshPluginStatePostResponse} from "../lib/mesh-http.ts";
import {MESH_AUTH_MAX_FAILURES, _resetMeshAuthThrottleForTests} from "../lib/mesh-throttle.ts";
import {enableGgsForTests, restoreGgsPluginsDirForTests} from "./enable-ggs.ts";

const GGS_PLUGIN_ID = "growcast.ggs";
const SHORT_TOKEN = "short21charstokenxxxx";

function meshGet(pluginId: string, token?: string): Request {
    const headers: Record<string, string> = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return new Request(`http://localhost/api/mesh/${pluginId}`, {headers});
}

function meshPost(pluginId: string, token?: string): Request {
    const headers: Record<string, string> = {"Content-Type": "application/json"};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }
    return new Request(`http://localhost/api/mesh/${pluginId}/state`, {
        method: "POST",
        headers,
        body: "{}",
    });
}

describe("mesh plugin GET auth throttle", () => {
    const previousToken = process.env.GROWCAST_MESH_TOKEN;

    afterEach(() => {
        _resetMeshAuthThrottleForTests();
        restoreGgsPluginsDirForTests();
        if (previousToken === undefined) {
            delete process.env.GROWCAST_MESH_TOKEN;
        } else {
            process.env.GROWCAST_MESH_TOKEN = previousToken;
        }
    });

    it("throttles repeated wrong Bearer on GET then still accepts the deployed short token", async () => {
        process.env.GROWCAST_MESH_TOKEN = SHORT_TOKEN;
        _resetMeshAuthThrottleForTests();
        await enableGgsForTests();

        assert.equal(SHORT_TOKEN.length, 21);

        for (let i = 0; i < MESH_AUTH_MAX_FAILURES - 1; i += 1) {
            const response = await meshPluginGetResponse(meshGet(GGS_PLUGIN_ID, "wrong"), GGS_PLUGIN_ID);
            assert.equal(response.status, 401);
        }

        const blocked = await meshPluginGetResponse(meshGet(GGS_PLUGIN_ID, "wrong"), GGS_PLUGIN_ID);
        assert.equal(blocked.status, 429);
        assert.ok(Number(blocked.headers.get("retry-after") ?? "0") > 0);

        const ok = await meshPluginGetResponse(meshGet(GGS_PLUGIN_ID, SHORT_TOKEN), GGS_PLUGIN_ID);
        assert.equal(ok.status, 200);
        const body = (await ok.json()) as {pluginId: string};
        assert.equal(body.pluginId, GGS_PLUGIN_ID);
    });

    it("shares the failure bucket with mesh state POST", async () => {
        process.env.GROWCAST_MESH_TOKEN = SHORT_TOKEN;
        _resetMeshAuthThrottleForTests();
        await enableGgsForTests();

        for (let i = 0; i < MESH_AUTH_MAX_FAILURES - 1; i += 1) {
            const response = await meshPluginGetResponse(meshGet(GGS_PLUGIN_ID, "wrong"), GGS_PLUGIN_ID);
            assert.equal(response.status, 401);
        }

        const posted = await meshPluginStatePostResponse(meshPost(GGS_PLUGIN_ID, "wrong"), GGS_PLUGIN_ID);
        assert.equal(posted.status, 429);
    });
});
