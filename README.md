# Real-Time Collaboration Platform

Production-oriented monorepo for a Google-Docs-like collaborative editor using CRDTs + WebSockets.

## Architecture

- `apps/web`: Next.js (App Router) editor client and document routes.
- `apps/realtime`: WebSocket gateway, CRDT sync engine (Yjs), Redis fan-out, Postgres persistence.
- `packages/shared`: Protocol contracts, auth claim schema, and update encoding helpers.

### Message flow

1. Client opens a doc and sends `sync_request`.
2. Realtime server hydrates from latest snapshot (if needed) and returns `sync_response`.
3. Client sends `update`/`awareness` messages.
4. Gateway applies CRDT update, persists audit row, publishes to Redis, and broadcasts locally.
5. Snapshot + compaction are run every `SNAPSHOT_EVERY_UPDATES` updates.

## Feature status

✅ Implemented now:
- Versioned wire protocol with runtime validation (`zod`).
- Connection-level rate limiting.
- Health/metrics endpoints (`/healthz`, `/metrics`).
- Redis dedupe via `source` instance marker.
- Snapshot hydration and periodic compaction.
- Structured logging (pino) + graceful shutdown.
- Baseline tests for protocol, rate limiting, and CRDT convergence.

🚧 Still intentionally lightweight:
- UI is a minimal collaborative textarea (not a full rich-text framework yet).
- Auth is token-header based for dev bootstrap.

## Local development

```bash
npm install
docker compose up --build
```

- Web app: `http://localhost:3000`
- Realtime health: `http://localhost:4001/healthz`
- Realtime metrics: `http://localhost:4001/metrics`

Open `/doc/demo` in two browser tabs to verify sync/presence.

## Environment variables

See `.env.example` for defaults.

Key values:
- `AUTH_TOKEN`: bearer token required for non-anonymous identity.
- `RATE_LIMIT_PER_MINUTE`: hard ceiling per connection.
- `SNAPSHOT_EVERY_UPDATES`: frequency of snapshot persistence.
- `DOC_CACHE_MAX`: in-memory CRDT docs cache size.

## Tests

```bash
npm --workspace @rtcp/realtime run test
```

## Persistence schema

Core tables include:
- `users`, `teams`, `team_members`, `documents`
- `document_updates` (audit/update log)
- `document_snapshots` (compressed state checkpoint)

## Next recommended upgrades

1. Replace textarea with ProseMirror/TipTap + Yjs binding.
2. Move auth from header token to JWT/session validation.
3. Add integration tests spinning ephemeral Postgres + Redis.
4. Add ACL checks for `team_id` / `doc_id` before join/update.
