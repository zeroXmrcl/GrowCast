# AGENTS.md

## Cursor Cloud specific instructions

GrowCast is a single-service **Next.js 16** app (App Router, Turbopack, React 19). There is no database; grow data is persisted as JSON under `data/` and media under `public/` and `extensions/`. See `README.md` for full docs.

### Services / commands
There is only one service. Standard commands live in `package.json` scripts:
- Dev server: `npm run dev` (serves `http://localhost:3000`).
- Lint: `npm run lint`.
- Tests: `npm test` (Node's built-in test runner with a TS loader; no external services needed).
- Prod: `npm run build` then `npm run start`. Docker Compose (`docker compose up --build`) builds a standalone bundle and is the production path only.

### Startup caveats (non-obvious)
- **`.env.local` is required for admin login and the mesh API and is NOT committed.** The update script does not create it. Generate it with `npm run setup:admin:insecure` (dev-only short passwords). The script reads three piped lines (username, password, repeat), so it can run non-interactively, e.g. `printf 'admin\nadminpassword123\nadminpassword123\n' | npm run setup:admin:insecure`.
- The mesh/plugin API (`/api/mesh/[pluginId]`) is **fail-closed**: it returns 401 unless `GROWCAST_MESH_TOKEN` is set in `.env.local` AND the request sends a matching `Authorization: Bearer <token>`. Add this token to `.env.local` manually; the admin setup script does not.
- `ADMIN_PASSWORD_HASH` in `.env.local` contains `$` characters escaped as `\$` (raw env-file format). This is intentional and consumed correctly by both `next dev` and `docker compose`'s `env_file`.
- Node 20+ is required; the VM's Node 22 works.
- The RTSP camera + MediaMTX live stream is an external dependency and cannot run in this environment. The app runs fully without it — the stream embed is simply empty until a `streamUrl` is configured in the admin dashboard.
