import "dotenv/config";
import cors from "cors";
import express from "express";
import { Connection } from "@solana/web3.js";
import { config } from "../config.js";
import { pool } from "../db.js";
import { ingestSignature } from "../ingest.js";
import {
  createDepositIntent,
  failDepositIntent,
  submitDepositIntent,
  upsertInvestorMandate,
} from "../ledger.js";

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
  res.json({ ok: true, service: "onevault-indexer-api", cluster: config.cluster });
});

/** Record a deposit before it is sent on-chain. */
app.post("/api/ledger/deposits", asyncRoute(async (req, res) => {
  const vault = String(req.body?.vault ?? "").trim();
  const investor = String(req.body?.investor ?? "").trim();
  const role = req.body?.role === "degen" ? "degen" : req.body?.role === "retail" ? "retail" : "";
  const amount = String(req.body?.amount ?? "").trim();
  if (!vault || !investor || !role || !amount || !/^\d+$/.test(amount)) {
    res.status(400).json({ error: "vault, investor, role (degen|retail), amount required" });
    return;
  }
  const takeProfitBps =
    req.body?.takeProfitBps == null ? null : Number(req.body.takeProfitBps);
  const stopLossBps = req.body?.stopLossBps == null ? null : Number(req.body.stopLossBps);
  const intent = await createDepositIntent({
    vault,
    investor,
    role,
    amount,
    takeProfitBps: Number.isFinite(takeProfitBps) ? takeProfitBps : null,
    stopLossBps: Number.isFinite(stopLossBps) ? stopLossBps : null,
  });
  res.json({ ok: true, ...intent });
}));

app.post("/api/ledger/deposits/:id/submit", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const signature = String(req.body?.signature ?? "").trim();
  if (!Number.isFinite(id) || !signature) {
    res.status(400).json({ error: "id and signature required" });
    return;
  }
  await submitDepositIntent(id, signature);
  res.json({ ok: true, id, signature, status: "submitted" });
}));

app.post("/api/ledger/deposits/:id/fail", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "id required" });
    return;
  }
  await failDepositIntent(id, String(req.body?.error ?? "failed"));
  res.json({ ok: true, id, status: "failed" });
}));

app.post("/api/ledger/mandates", asyncRoute(async (req, res) => {
  const vault = String(req.body?.vault ?? "").trim();
  const investor = String(req.body?.investor ?? "").trim();
  const role = req.body?.role === "degen" ? "degen" : "retail";
  const parkAmount = String(req.body?.parkAmount ?? "0");
  if (!vault || !investor) {
    res.status(400).json({ error: "vault and investor required" });
    return;
  }
  await upsertInvestorMandate({
    vault,
    investor,
    role,
    parkAmount,
    takeProfitBps: req.body?.takeProfitBps == null ? null : Number(req.body.takeProfitBps),
    stopLossBps: req.body?.stopLossBps == null ? null : Number(req.body.stopLossBps),
    autoFollow: req.body?.autoFollow,
  });
  res.json({ ok: true });
}));

app.get("/api/ledger/deposits", asyncRoute(async (req, res) => {
  const vault = req.query.vault as string | undefined;
  const q = vault
    ? `SELECT * FROM deposit_intents WHERE vault = $1 ORDER BY created_at DESC LIMIT 100`
    : `SELECT * FROM deposit_intents ORDER BY created_at DESC LIMIT 100`;
  const { rows } = await pool.query(q, vault ? [vault] : []);
  res.json(rows);
}));

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

app.get("/api/vaults/:pubkey/holdings", asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM vault_holder_book WHERE vault = $1 ORDER BY role ASC, deposited DESC`,
    [req.params.pubkey]
  );
  res.json(rows);
}));

app.get("/api/vaults/:pubkey/positions", asyncRoute(async (req, res) => {
  const [vaultPos, invPos] = await Promise.all([
    pool.query(
      `SELECT * FROM vault_positions WHERE vault = $1 ORDER BY position_id DESC LIMIT 50`,
      [req.params.pubkey]
    ),
    pool.query(
      `SELECT * FROM investor_positions WHERE vault = $1 ORDER BY opened_at DESC LIMIT 100`,
      [req.params.pubkey]
    ),
  ]);
  res.json({ vault: vaultPos.rows, investors: invPos.rows });
}));

app.get("/api/vaults/:pubkey/payouts", asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM close_payouts WHERE vault = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.params.pubkey]
  );
  res.json(rows);
}));

app.get("/api/vaults/:pubkey/fees", asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM fee_accruals WHERE vault = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.params.pubkey]
  );
  res.json(rows);
}));

app.get("/api/ledger/mandates", asyncRoute(async (req, res) => {
  const vault = req.query.vault as string | undefined;
  const q = vault
    ? `SELECT * FROM investor_mandates WHERE vault = $1 ORDER BY updated_at DESC`
    : `SELECT * FROM investor_mandates ORDER BY updated_at DESC LIMIT 100`;
  const { rows } = await pool.query(q, vault ? [vault] : []);
  res.json(rows);
}));

app.get("/api/stats", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT 'vaults' AS table, COUNT(*)::int AS n FROM vaults
    UNION ALL SELECT 'deposits', COUNT(*)::int FROM deposits
    UNION ALL SELECT 'withdrawals', COUNT(*)::int FROM withdrawals
    UNION ALL SELECT 'deposit_intents', COUNT(*)::int FROM deposit_intents
    UNION ALL SELECT 'investor_mandates', COUNT(*)::int FROM investor_mandates
    UNION ALL SELECT 'vault_holdings', COUNT(*)::int FROM vault_holdings
    UNION ALL SELECT 'vault_positions', COUNT(*)::int FROM vault_positions
    UNION ALL SELECT 'investor_positions', COUNT(*)::int FROM investor_positions
    UNION ALL SELECT 'follow_events', COUNT(*)::int FROM follow_events
    UNION ALL SELECT 'close_payouts', COUNT(*)::int FROM close_payouts
    UNION ALL SELECT 'fee_accruals', COUNT(*)::int FROM fee_accruals
    UNION ALL SELECT 'trades', COUNT(*)::int FROM trades
    UNION ALL SELECT 'transactions', COUNT(*)::int FROM transactions
  `);
  res.json(Object.fromEntries(rows.map((r) => [r.table, r.n])));
}));

app.get("/api/protocol-state", asyncRoute(async (_req, res) => {
  const { rows } = await pool.query(`SELECT * FROM protocol_state WHERE id = 1`);
  res.json(rows[0] ?? null);
}));

app.get("/api/vaults/:pubkey/follows", asyncRoute(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM follow_events WHERE vault = $1 ORDER BY created_at DESC LIMIT 100`,
    [req.params.pubkey]
  );
  res.json(rows);
}));

app.get("/api/vaults/:pubkey/stakes", asyncRoute(async (req, res) => {
  const [current, events] = await Promise.all([
    pool.query(`SELECT * FROM vault_sol_stakes WHERE vault = $1`, [req.params.pubkey]),
    pool.query(
      `SELECT * FROM vault_sol_stake_events WHERE vault = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.pubkey]
    ),
  ]);
  res.json({ current: current.rows[0] ?? null, events: events.rows });
}));

app.listen(config.apiPort, () => {
  console.log(`[1vault-api] listening on http://localhost:${config.apiPort}`);
});
