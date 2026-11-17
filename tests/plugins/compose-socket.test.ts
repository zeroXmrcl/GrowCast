import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {describe, it} from "node:test";

describe("docker socket proxy compose", () => {
    const compose = readFileSync(path.join(process.cwd(), "docker-compose.yml"), "utf8");
    const dockerfile = readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");

    it("does not mount raw docker.sock on the GrowCast container", () => {
        assert.match(compose, /docker-socket-proxy:/);
        assert.match(compose, /tecnativa\/docker-socket-proxy/);
        assert.match(compose, /DOCKER_HOST: tcp:\/\/docker-socket-proxy:2375/);
        assert.match(compose, /CONTAINERS: "1"/);
        assert.match(compose, /POST: "1"/);
        assert.match(compose, /BUILD: "0"/);
        const growcast = compose.split(/^  growcast:\s*$/m)[1] ?? "";
        assert.doesNotMatch(growcast, /\/var\/run\/docker\.sock/);
        assert.doesNotMatch(growcast, /DOCKER_GID/);
        assert.doesNotMatch(growcast, /group_add:/);
        assert.match(compose, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock:ro/);
    });

    it("keeps docker CLI in the image so compose can talk to DOCKER_HOST", () => {
        assert.match(dockerfile, /docker-cli/);
        assert.match(dockerfile, /docker-cli-compose/);
    });
});
