// Storage: Postgres in production (DATABASE_URL) and PGlite (Postgres in WebAssembly) locally and in
// tests, behind the same tiny interface. Tables are created at startup when missing.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

/** All the server needs from the database: a parameterized query ($1, $2…) */
export interface Db {
  query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[] }>;
  close(): Promise<void>;
}

/** With DATABASE_URL, Postgres; without it, PGlite stored in dataDir (or in memory when absent) */
export interface DbConfig {
  databaseUrl?: string;
  dataDir?: string;
}

export function readDbConfig(env: NodeJS.ProcessEnv): DbConfig {
  if (env.DATABASE_URL) return { databaseUrl: env.DATABASE_URL };
  return { dataDir: resolve(env.DATA_DIR ?? '.datos') };
}

export async function openDb({ databaseUrl, dataDir }: DbConfig = {}): Promise<Db> {
  if (databaseUrl) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    // an idle connection that drops must not take the process down: the Pool opens another one
    pool.on('error', (e) => console.error('Postgres:', e.message));
    return {
      query: async (sql, params) => pool.query(sql, params) as never,
      close: () => pool.end(),
    };
  }
  // PGlite is a dev dependency: only loaded here
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const db = dataDir ? new PGlite(resolve(dataDir, 'pg')) : new PGlite();
  return {
    query: (sql, params) => db.query(sql, params) as never,
    close: () => db.close(),
  };
}

/** Creates missing tables. Safe to run on every startup */
export async function migrate(db: Db) {
  await db.query(`CREATE TABLE IF NOT EXISTS snapshots (
    source_id text PRIMARY KEY,
    -- last good data; a failed fetch keeps it
    data jsonb,
    -- time of the last successful fetch
    updated_at timestamptz,
    ok boolean NOT NULL DEFAULT false,
    error text,
    -- time of the last attempt, successful or not
    attempted_at timestamptz
  )`);
}

export interface Snapshot<T = unknown> {
  data: T | null;
  updatedAt: string | null;
  ok: boolean;
  error: string | null;
  attemptedAt: string | null;
}

const iso = (v: unknown): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();

export async function loadSnapshots(db: Db): Promise<Map<string, Snapshot>> {
  const { rows } = await db.query<{
    source_id: string;
    data: unknown;
    updated_at: unknown;
    ok: boolean;
    error: string | null;
    attempted_at: unknown;
  }>('SELECT source_id, data, updated_at, ok, error, attempted_at FROM snapshots');
  const out = new Map<string, Snapshot>();
  for (const r of rows)
    out.set(r.source_id, {
      // pg and PGlite both parse jsonb; a string would only come from an unusual driver setup
      data: typeof r.data === 'string' ? JSON.parse(r.data) : (r.data ?? null),
      updatedAt: iso(r.updated_at),
      ok: r.ok,
      error: r.error,
      attemptedAt: iso(r.attempted_at),
    });
  return out;
}

export async function saveSuccess(db: Db, key: string, data: unknown, at = new Date()) {
  await db.query(
    `INSERT INTO snapshots (source_id, data, updated_at, ok, error, attempted_at)
     VALUES ($1, $2::jsonb, $3, true, NULL, $3)
     ON CONFLICT (source_id) DO UPDATE SET data = $2::jsonb, updated_at = $3, ok = true, error = NULL, attempted_at = $3`,
    [key, JSON.stringify(data), at.toISOString()],
  );
}

/** Records a failed attempt and keeps the last good data */
export async function saveFailure(db: Db, key: string, error: string, at = new Date()) {
  await db.query(
    `INSERT INTO snapshots (source_id, data, updated_at, ok, error, attempted_at)
     VALUES ($1, NULL, NULL, false, $2, $3)
     ON CONFLICT (source_id) DO UPDATE SET ok = false, error = $2, attempted_at = $3`,
    [key, error, at.toISOString()],
  );
}
