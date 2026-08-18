import "dotenv/config";
import { Connection } from "@solana/web3.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { ingestSignature } from "./ingest.js";

const signature = process.argv[2];
if (!signature) {
  console.error("usage: npx tsx src/ingest-one.ts <signature>");
  process.exit(1);
}

const connection = new Connection(config.rpcUrl, "confirmed");
const n = await ingestSignature(connection, signature);
console.log(`[ingest] ${signature} events=${n}`);
await pool.end();
