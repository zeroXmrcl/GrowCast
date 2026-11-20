# Docker plugin proxy

GrowCast never mounts `/var/run/docker.sock`. The website talks to `docker-plugin-proxy` at `tcp://docker-plugin-proxy:2375`. Only that proxy container mounts the engine socket (`ro`).

The proxy is a small Node HTTP allowlist (`services/docker-plugin-proxy`). It is not tecnativa/docker-socket-proxy. Broad Engine APIs (images, networks, volumes, exec, build) would let GrowCast create privileged containers or bind the host, which is root on the host.

## Allow

- `GET /_ping`, `GET /version`
- `GET /containers/json` (the proxy forces a `growcast.plugin` label filter)
- `GET /containers/{id}/json` and `GET /containers/{id}/logs` for labeled plugin containers
- `POST /containers/{id}/start|stop|restart` for labeled plugin containers
- `DELETE /containers/{id}` for labeled plugin containers
- `POST /containers/create` only when every check below passes

Create is allowed only for:

- Name `plugin-<id>` matching label `growcast.plugin=<id>` (dots in the id become hyphens)
- Image on the allowlist (`growcast-plugin-*`, plus `GROWCAST_PLUGIN_IMAGES`)
- Non-privileged, empty `CapAdd`, empty `Devices`, empty `PidMode`
- Network mode `bridge`/`default` or `GROWCAST_PLUGIN_NETWORK` (never `host`, `container:`, or `ns:`)
- Binds only `{GROWCAST_HOST_PROJECT}/plugins/<folder>:/plugin:ro` and `{GROWCAST_HOST_PROJECT}/data/plugins/<id>:/data`

Set `GROWCAST_HOST_PROJECT` to the compose project directory on the host. The engine sees host paths, not `/host-project`.

## Deny

Everything else, including `exec`, `attach`, `wait`, `kill`, `/images`, `/networks`, `/volumes`, `/build`, `/commit`, swarm, plugins, services, secrets, events, and prune.

Tests: `tests/plugins/docker-proxy-policy.test.ts`.
