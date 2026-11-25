import assert from "node:assert/strict";
import {describe, it} from "node:test";
import {
    assertDockerHostIsProxy,
    assertPluginRuntimeTarget,
    dockerEngineBaseUrl,
    isPluginContainerName,
} from "../../lib/plugins/docker-guard.ts";
import {pluginServiceName} from "../../lib/plugins/ids.ts";

describe("plugin docker supervisor target", () => {
    it("accepts only plugin-<id> service names", () => {
        assert.equal(isPluginContainerName("plugin-growcast-ggs"), true);
        assert.equal(isPluginContainerName("plugin-community-example"), true);
        assert.equal(isPluginContainerName("growcast"), false);
        assert.equal(isPluginContainerName("docker-socket-proxy"), false);
        assert.equal(isPluginContainerName("docker-plugin-proxy"), false);
        assert.equal(isPluginContainerName("plugin-host"), false);
        assert.equal(isPluginContainerName("../growcast"), false);
        assert.equal(isPluginContainerName("plugin-GrowCast-ggs"), false);
    });

    it("refuses start/stop of the GrowCast website and the proxy", () => {
        assert.throws(() => assertPluginRuntimeTarget("growcast"), /Refused/);
        assert.throws(() => assertPluginRuntimeTarget("docker-socket-proxy"), /Refused/);
        assert.throws(() => assertPluginRuntimeTarget("docker-plugin-proxy"), /Refused/);
        assert.throws(
            () => assertPluginRuntimeTarget("plugin-growcast-ggs", "growcast.timelapse"),
            /does not match/,
        );
        assert.doesNotThrow(() => {
            assertPluginRuntimeTarget(pluginServiceName("growcast.ggs"), "growcast.ggs");
        });
    });

    it("points the Engine client at the socket proxy by default", () => {
        assert.equal(
            dockerEngineBaseUrl({}),
            "http://docker-plugin-proxy:2375",
        );
        assert.equal(
            dockerEngineBaseUrl({DOCKER_HOST: "tcp://docker-plugin-proxy:2375"}),
            "http://docker-plugin-proxy:2375",
        );
        assert.throws(
            () => assertDockerHostIsProxy("unix:///var/run/docker.sock"),
            /raw docker\.sock/,
        );
        assert.throws(
            () => dockerEngineBaseUrl({DOCKER_HOST: "/var/run/docker.sock"}),
            /raw docker\.sock/,
        );
    });
});
