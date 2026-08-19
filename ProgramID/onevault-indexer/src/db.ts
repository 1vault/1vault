import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = config.databaseUrl
  .replace(/[?&]sslmode=[^&]*/g, "")
  .replace(/\?$/, "");

export const pool = new pg.Pool({
  connectionString,
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
