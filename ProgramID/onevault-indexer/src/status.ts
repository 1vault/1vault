import { pool } from "./db.js";

async function main(): Promise<void> {
  const tables = await pool.query(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const vaults = await pool.query(`SELECT COUNT(*)::int AS n FROM vaults`);
  const demo = await pool.query(
    `SELECT 1 FROM vaults WHERE pubkey = $1`,
    ["CxUvVKea9nyv3a6EdHwaHVmjNMRXbA7X3D32LTWDmKLG"]
  );
  const txs = await pool.query(`SELECT COUNT(*)::int AS n FROM transactions`);
  const deposits = await pool.query(`SELECT COUNT(*)::int AS n FROM deposits`);
  console.log(
    JSON.stringify(
      {
        publicTables: tables.rows[0].n,
        vaults: vaults.rows[0].n,
        demoVaultIndexed: (demo.rowCount ?? 0) > 0,
        transactions: txs.rows[0].n,
        deposits: deposits.rows[0].n,
      },
      null,
      2
    )
  );
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
