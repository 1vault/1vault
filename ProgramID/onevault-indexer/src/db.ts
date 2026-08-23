import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Supabase session :5432 → transaction :6543; keep sslmode out of URL when using Pool ssl. */
export function normalizeDatabaseUrl(raw: string): string {
  let s = raw.trim();
  try {
    const u = new URL(s);
    const host = u.hostname.toLowerCase();
    if (host.includes("pooler.supabase.") && (u.port === "" || u.port === "5432")) {
      u.port = "6543";
      console.log("[1vault-indexer] supabase session :5432 → transaction :6543");
    }
    s = u.toString();
  } catch {
    /* keep raw */
  }
  return s.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "").replace(/&&+/g, "&");
}

const connectionString = normalizeDatabaseUrl(config.databaseUrl);

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.DB_MAX_CONNS ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 20_000,
  ssl: /supabase\.(co|com)/i.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined,
});

export async function migrate(): Promise<void> {
  const dir = path.join(__dirname, "..", "schema");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await pool.query(sql);
  }
}

export async function insertTransaction(row: {
  signature: string;
  slot: number;
  blockTime: Date | null;
  instruction: string;
  vault?: string;
  actor?: string;
  rawEvent?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO transactions (signature, slot, block_time, instruction, vault, actor, raw_event)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (signature) DO NOTHING`,
    [row.signature, row.slot, row.blockTime, row.instruction, row.vault ?? null, row.actor ?? null, row.rawEvent ?? null]
  );
}
