import "dotenv/config";
import cors from "cors";
import express from "express";
import { config } from "../config.js";
import { pool } from "../db.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "onevault-indexer-api" });
});

/** Leaderboard — vaults ranked by return % */
app.get("/api/leaderboard", async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM vault_leaderboard ORDER BY return_pct DESC NULLS LAST LIMIT 50`
  );
  res.json(rows);
});

/** All indexed vaults */
app.get("/api/vaults", async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM vaults ORDER BY updated_at DESC LIMIT 100`);
  res.json(rows);
});

/** Vault detail + recent PnL snapshots */
app.get("/api/vaults/:pubkey", async (req, res) => {
  const { pubkey } = req.params;
  const vault = await pool.query(`SELECT * FROM vaults WHERE pubkey = $1`, [pubkey]);
  if (vault.rowCount === 0) return res.status(404).json({ error: "Vault not found" });
  const pnl = await pool.query(
    `SELECT * FROM pnl_snapshots WHERE vault = $1 ORDER BY snapshot_at DESC LIMIT 100`,
    [pubkey]
  );
  const trades = await pool.query(
    `SELECT * FROM trades WHERE vault = $1 ORDER BY block_time DESC LIMIT 50`,
    [pubkey]
  );
  res.json({ vault: vault.rows[0], pnl: pnl.rows, trades: trades.rows });
});

/** Trade history */
app.get("/api/trades", async (req, res) => {
  const vault = req.query.vault as string | undefined;
  const q = vault
    ? `SELECT * FROM trades WHERE vault = $1 ORDER BY block_time DESC LIMIT 100`
    : `SELECT * FROM trades ORDER BY block_time DESC LIMIT 100`;
  const { rows } = await pool.query(q, vault ? [vault] : []);
  res.json(rows);
});

/** Strategy analytics — deposits/withdrawals summary per vault */
app.get("/api/analytics/vault/:pubkey", async (req, res) => {
  const { pubkey } = req.params;
  const [deposits, withdrawals, positions] = await Promise.all([
    pool.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total FROM deposits WHERE vault = $1`,
      [pubkey]
    ),
    pool.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(net_amount),0) AS total FROM withdrawals WHERE vault = $1`,
      [pubkey]
    ),
    pool.query(
      `SELECT event_type, COUNT(*) AS count FROM position_events WHERE vault = $1 GROUP BY event_type`,
      [pubkey]
    ),
  ]);
  res.json({
    deposits: deposits.rows[0],
    withdrawals: withdrawals.rows[0],
    positions: positions.rows,
  });
});

/** Performance history */
app.get("/api/performance/:pubkey", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT share_price, nav, total_shares, snapshot_at FROM pnl_snapshots
     WHERE vault = $1 ORDER BY snapshot_at ASC`,
    [req.params.pubkey]
  );
  res.json(rows);
});

app.listen(config.apiPort, () => {
  console.log(`[1vault-api] listening on http://localhost:${config.apiPort}`);
});
