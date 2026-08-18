import "dotenv/config";
import cors from "cors";
import express from "express";
import { Connection } from "@solana/web3.js";
import { config } from "../config.js";
import { pool } from "../db.js";
import { ingestSignature } from "../ingest.js";

const app = express();
app.use(cors());
app.use(express.json());

function asyncRoute(
  handler: (req: express.Request, res: express.Response) => Promise<void>
) {
  return (req: express.Request, res: express.Response) => {
    handler(req, res).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[1vault-api]", message);
      if (!res.headersSent) res.status(500).json({ error: message });
    });
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "onevault-indexer-api" });
});

/** Index a confirmed Devnet signature into Postgres immediately */
app.post("/api/ingest", asyncRoute(async (req, res) => {
  const signature = String(req.body?.signature ?? "").trim();
  if (!signature) {
    res.status(400).json({ error: "signature required" });
    return;
  }
  const connection = new Connection(config.rpcUrl, "confirmed");
  const events = await ingestSignature(connection, signature);
  res.json({ ok: true, signature, events });
}));

/** Leaderboard — vaults ranked by return % */
app.get("/api/leaderboard", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM vault_leaderboard ORDER BY return_pct DESC NULLS LAST LIMIT 50`
  );
  res.json(rows);
}));

/** All indexed vaults */
app.get("/api/vaults", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM vaults ORDER BY updated_at DESC LIMIT 100`);
  res.json(rows);
}));

/** Vault detail + recent PnL snapshots */
app.get("/api/vaults/:pubkey", asyncRoute(async (req, res) => {
  const { pubkey } = req.params;
  const vault = await pool.query(`SELECT * FROM vaults WHERE pubkey = $1`, [pubkey]);
  if (vault.rowCount === 0) {
    res.status(404).json({ error: "Vault not found" });
    return;
  }
  const pnl = await pool.query(
    `SELECT * FROM pnl_snapshots WHERE vault = $1 ORDER BY snapshot_at DESC LIMIT 100`,
    [pubkey]
  );
  const trades = await pool.query(
    `SELECT * FROM trades WHERE vault = $1 ORDER BY block_time DESC LIMIT 50`,
    [pubkey]
  );
  res.json({ vault: vault.rows[0], pnl: pnl.rows, trades: trades.rows });
}));

/** Trade history */
app.get("/api/trades", asyncRoute(async (req, res) => {
  const vault = req.query.vault as string | undefined;
  const q = vault
    ? `SELECT * FROM trades WHERE vault = $1 ORDER BY block_time DESC LIMIT 100`
    : `SELECT * FROM trades ORDER BY block_time DESC LIMIT 100`;
  const { rows } = await pool.query(q, vault ? [vault] : []);
  res.json(rows);
}));

/** Strategy analytics — deposits/withdrawals summary per vault */
app.get("/api/analytics/vault/:pubkey", asyncRoute(async (req, res) => {
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
}));

/** Performance history */
app.get("/api/performance/:pubkey", asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT share_price, nav, total_shares, snapshot_at FROM pnl_snapshots
     WHERE vault = $1 ORDER BY snapshot_at ASC`,
    [req.params.pubkey]
  );
  res.json(rows);
}));

app.listen(config.apiPort, () => {
  console.log(`[1vault-api] listening on http://localhost:${config.apiPort}`);
});
