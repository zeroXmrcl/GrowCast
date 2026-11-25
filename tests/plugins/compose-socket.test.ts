import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

describe("docker plugin proxy compose", () => {
    const compose = readFileSync(path.join(process.cwd(), "docker-compose.yml"), "utf8");
    const dockerfile = readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");
    const proxyDocker = readFileSync(
        path.join(process.cwd(), "services", "docker-plugin-proxy", "Dockerfile"),
        "utf8",
    );

    it("does not mount raw docker.sock on the GrowCast container", () => {
        assert.match(compose, /docker-plugin-proxy:/);
        assert.doesNotMatch(compose, /tecnativa\/docker-socket-proxy/);
        assert.match(compose, /DOCKER_HOST: tcp:\/\/docker-plugin-proxy:2375/);
        const growcast = compose.split(/^  growcast:\s*$/m)[1] ?? "";
        assert.doesNotMatch(growcast, /\/var\/run\/docker\.sock/);
        assert.doesNotMatch(growcast, /DOCKER_GID/);
        assert.doesNotMatch(growcast, /group_add:/);
        assert.match(compose, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock:ro/);
        assert.doesNotMatch(compose, /:\s*\/host-project\s*$/m);
        assert.doesNotMatch(compose, /0666/);
        const proxy = compose.split(/^  growcast:\s*$/m)[0] ?? "";
        assert.match(proxy, /GROWCAST_DOCKER_PROXY_TOKEN/);
        assert.match(proxy, /GROWCAST_DOCKER_PROXY_INTERNAL:\s*"1"/);
        assert.doesNotMatch(proxy, /^\s*ports:/m);
    });

    it("does not ship a Docker CLI in the GrowCast image", () => {
        assert.doesNotMatch(dockerfile, /docker-cli/);
        assert.doesNotMatch(dockerfile, /docker-cli-compose/);
        assert.match(proxyDocker, /CMD \["node", "server.mjs"\]/);
    });

    it("does not create first-party plugin folders in the GrowCast entrypoint", () => {
        const entrypoint = readFileSync(path.join(process.cwd(), "docker-entrypoint.sh"), "utf8");
        assert.doesNotMatch(entrypoint, /plugins\/timelapse/);
        assert.doesNotMatch(entrypoint, /growcast\.timelapse/);
        assert.doesNotMatch(entrypoint, /growcast\.ggs/);
        assert.doesNotMatch(entrypoint, /growcast\.solar/);
        assert.doesNotMatch(entrypoint, /growcast\.restream/);
    });
});
