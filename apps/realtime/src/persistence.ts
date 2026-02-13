import { Pool } from "pg";

export class Persistence {
  pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init() {
    await this.pool.query(`
      create table if not exists users (
        id text primary key,
        email text unique,
        created_at timestamptz default now()
      );

      create table if not exists teams (
        id text primary key,
        name text not null,
        created_at timestamptz default now()
      );

      create table if not exists team_members (
        team_id text not null,
        user_id text not null,
        role text not null default 'member',
        created_at timestamptz default now(),
        primary key(team_id, user_id)
      );

      create table if not exists documents (
        id text primary key,
        team_id text,
        title text not null default 'Untitled',
        created_by text,
        updated_at timestamptz default now()
      );

      create table if not exists document_snapshots (
        doc_id text not null,
        version bigint not null,
        state_blob bytea not null,
        created_at timestamptz default now(),
        primary key (doc_id, version)
      );

      create table if not exists document_updates (
        doc_id text not null,
        seq bigserial primary key,
        update_blob bytea not null,
        actor_id text not null,
        created_at timestamptz default now()
      );

      create index if not exists idx_document_updates_doc_id_created_at
      on document_updates(doc_id, created_at desc);
    `);
  }

  appendUpdate(docId: string, update: Uint8Array, actorId: string) {
    return this.pool.query(
      "insert into document_updates(doc_id, update_blob, actor_id) values ($1, $2, $3)",
      [docId, Buffer.from(update), actorId]
    );
  }

  snapshot(docId: string, version: number, state: Uint8Array) {
    return this.pool.query(
      "insert into document_snapshots(doc_id, version, state_blob) values ($1, $2, $3)",
      [docId, version, Buffer.from(state)]
    );
  }

  async compactUpdates(docId: string, keepRecent = 100) {
    await this.pool.query(
      `delete from document_updates
       where doc_id=$1 and seq not in (
        select seq from document_updates
        where doc_id=$1
        order by seq desc
        limit $2
       )`,
      [docId, keepRecent]
    );
  }

  async latestSnapshot(docId: string): Promise<Uint8Array | null> {
    const result = await this.pool.query(
      "select state_blob from document_snapshots where doc_id=$1 order by version desc limit 1",
      [docId]
    );

    return result.rows[0]?.state_blob ?? null;
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool.query("select 1");
      return true;
    } catch {
      return false;
    }
  }

  close() {
    return this.pool.end();
  }
}
