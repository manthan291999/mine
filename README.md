# Real-Time Collaboration Platform (CRDT + WebSockets)

Monorepo structure:
- `apps/web`: Next.js App Router UI with collaborative editor and presence bar.
- `apps/realtime`: Node.js WebSocket gateway, CRDT sync engine, Redis fan-out, Postgres snapshots/audit.
- `packages/shared`: shared wire protocol types and zod schemas.

## Quick start

```bash
npm install
docker compose up --build
```

Open `http://localhost:3000/doc/demo` in two windows and type collaboratively.

## Features implemented

- CRDT-based convergence using Yjs.
- WS protocol: `ping`, `sync_request`, `sync_response`, `update`, `awareness`.
- Presence and awareness fan-out.
- Redis pub/sub for multi-instance replication.
- Postgres persistence for snapshots + update audit trail.
- Health and metrics endpoints (`/healthz`, `/metrics`).
- Graceful shutdown handlers.

## Testing

```bash
npm --workspace @rtcp/realtime run test
```

## Database model

- `document_snapshots(doc_id, version, state_blob, created_at)`
- `document_updates(doc_id, seq, update_blob, actor_id, created_at)`

Extend with `users`, `teams`, and `documents` tables for production authz.
