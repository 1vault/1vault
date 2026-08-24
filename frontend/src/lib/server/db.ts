import { Pool } from "pg";
import { databaseUrl } from "./config";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: 2,
      ssl: databaseUrl().includes("supabase")
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const db = getPool();
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          twitter_id TEXT NOT NULL UNIQUE,
          handle TEXT NOT NULL,
          display_name TEXT,
          avatar_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS waitlist (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          twitter_id TEXT NOT NULL,
          handle TEXT NOT NULL,
          joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await db.query(`
        CREATE INDEX IF NOT EXISTS waitlist_joined_at_idx ON waitlist(joined_at);
      `);
    })();
  }
  await schemaReady;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  await ensureSchema();
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function queryOne<T extends Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}
