import { pool } from "./db.js";

async function main(): Promise<void> {
  const { rows } = await pool.query(`
    SELECT 'vaults' AS t, COUNT(*)::int AS n FROM vaults
    UNION ALL SELECT 'deposits', COUNT(*)::int FROM deposits
    UNION ALL SELECT 'withdrawals', COUNT(*)::int FROM withdrawals
    UNION ALL SELECT 'vault_holdings', COUNT(*)::int FROM vault_holdings
    UNION ALL SELECT 'vault_positions', COUNT(*)::int FROM vault_positions
    UNION ALL SELECT 'investor_positions', COUNT(*)::int FROM investor_positions
    UNION ALL SELECT 'follow_events', COUNT(*)::int FROM follow_events
    UNION ALL SELECT 'fee_accruals', COUNT(*)::int FROM fee_accruals
    UNION ALL SELECT 'close_payouts', COUNT(*)::int FROM close_payouts
    UNION ALL SELECT 'investor_mandates', COUNT(*)::int FROM investor_mandates
    UNION ALL SELECT 'deposit_intents', COUNT(*)::int FROM deposit_intents
    UNION ALL SELECT 'transactions', COUNT(*)::int FROM transactions
  `);
  console.log(JSON.stringify(Object.fromEntries(rows.map((r) => [r.t, r.n])), null, 2));
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
