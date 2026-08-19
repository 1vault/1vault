import { Connection } from "@solana/web3.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { ingestSignature } from "./ingest.js";

const REPLAY_INSTRUCTIONS = [
  "InvestorMirrored",
  "FeeAccrued",
  "PositionOpened",
  "PositionClosed",
  "PositionUpdated",
  "PositionFollowersClosed",
  "TpSlTriggered",
  "VaultClosePayout",
  "VaultClosed",
  "VaultClosingInitiated",
  "ProtocolInitialized",
];

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT DISTINCT signature, slot
     FROM transactions
     WHERE instruction = ANY($1)
     ORDER BY slot ASC`,
    [REPLAY_INSTRUCTIONS]
  );
  console.log(`[replay] ${rows.length} signatures`);
  const connection = new Connection(config.rpcUrl, "confirmed");
  let events = 0;
  for (const [i, row] of rows.entries()) {
    if (i > 0) await sleep(250);
    try {
      events += await ingestSignature(connection, row.signature);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[replay] ${row.signature}: ${msg}`);
    }
    if ((i + 1) % 20 === 0) {
      console.log(`[replay] ${i + 1}/${rows.length}`);
    }
  }
  const counts = await pool.query(`
    SELECT 'vault_holdings' AS t, COUNT(*)::int AS n FROM vault_holdings
    UNION ALL SELECT 'vault_positions', COUNT(*)::int FROM vault_positions
    UNION ALL SELECT 'investor_positions', COUNT(*)::int FROM investor_positions
    UNION ALL SELECT 'follow_events', COUNT(*)::int FROM follow_events
    UNION ALL SELECT 'fee_accruals', COUNT(*)::int FROM fee_accruals
    UNION ALL SELECT 'close_payouts', COUNT(*)::int FROM close_payouts
  `);
  console.log(`[replay] parsed ${events} event logs`);
  for (const r of counts.rows) console.log(`  ${r.t}=${r.n}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
