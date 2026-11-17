# Plugin Host API v1

Base: `/api/plugins/v1/:id/`

Auth: `Authorization: Bearer <per-plugin token>` (minted on enable). Fail-closed.

| Method | Path | Result |
|--------|------|--------|
| GET | `config` | Plugin config including secrets (backend only) |
| POST | `ingest` | Metrics + optional state. **204** / **422** / **429** |
| POST | `heartbeat` | `{ ok, status? }` → **204** |
| GET/POST | `x/*` | Admin proxy to the plugin host module |
| GET | `/api/data/plugins/:id` | Public live model |
| GET | `/api/data/plugins/:id/stream` | SSE |

Ingest body:

```json
{
  "apiVersion": 1,
  "observedAt": "2026-11-17T10:00:00Z",
  "metrics": { "pv.power": { "value": 6240 } },
  "state": {}
}
```

Validator: declared keys only, finite numbers, gauge bounds (including `config.field` expressions), secret-key denylist, `observedAt` not more than 5 minutes in the future. Missing metrics are omitted, never coerced to 0. Counter drops are treated as a reset (204), not negative energy. Faster than `config.intervalS` → 429.
