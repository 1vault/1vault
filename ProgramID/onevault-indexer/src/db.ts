import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export async function migrate(): Promise<void> {
  const schemaPath = path.join(__dirname, "..", "schema", "001_init.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
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
