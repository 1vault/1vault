import { pool } from "./db.js";
import { config } from "./config.js";

export type DepositRole = "degen" | "retail";
export type IntentStatus = "pending" | "submitted" | "confirmed" | "failed";

export async function createDepositIntent(row: {
  vault: string;
  investor: string;
  role: DepositRole;
  amount: string;
  takeProfitBps?: number | null;
  stopLossBps?: number | null;
}): Promise<{ id: number; status: IntentStatus }> {
  const { rows } = await pool.query(
    `INSERT INTO deposit_intents
       (cluster, vault, investor, role, amount, take_profit_bps, stop_loss_bps, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
     RETURNING id, status`,
    [
      config.cluster,
      row.vault,
      row.investor,
      row.role,
      row.amount,
      row.takeProfitBps ?? null,
      row.stopLossBps ?? null,
    ]
  );
  return { id: Number(rows[0].id), status: rows[0].status };
}

export async function submitDepositIntent(
  id: number,
  signature: string
): Promise<void> {
  const result = await pool.query(
    `UPDATE deposit_intents
     SET status = 'submitted', signature = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [id, signature]
  );
  if (result.rowCount === 0) {
    throw new Error(`deposit intent ${id} is not pending`);
  }
}

export async function failDepositIntent(id: number, error: string): Promise<void> {
  await pool.query(
    `UPDATE deposit_intents SET status = 'failed', error = $2, updated_at = NOW()
     WHERE id = $1 AND status IN ('pending', 'submitted')`,
    [id, error.slice(0, 500)]
  );
}

export async function confirmDepositIntent(row: {
  vault: string;
  investor: string;
  amount: string;
  sharesMinted: string;
  signature: string;
}): Promise<void> {
  await pool.query(
    `UPDATE deposit_intents
     SET status = 'confirmed',
         shares_minted = $1,
         signature = COALESCE(signature, $2),
         updated_at = NOW()
     WHERE signature = $2
        OR (
          status IN ('pending', 'submitted')
          AND vault = $3
          AND investor = $4
          AND amount = $5
        )`,
    [row.sharesMinted, row.signature, row.vault, row.investor, row.amount]
  );
}

export async function upsertInvestorMandate(row: {
  vault: string;
  investor: string;
  role: DepositRole;
  parkAmount: string;
  takeProfitBps?: number | null;
  stopLossBps?: number | null;
  autoFollow?: boolean;
}): Promise<void> {
  await pool.query(
    `INSERT INTO investor_mandates
       (vault, investor, role, park_amount, take_profit_bps, stop_loss_bps, auto_follow, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (vault, investor) DO UPDATE SET
       role = EXCLUDED.role,
       park_amount = EXCLUDED.park_amount,
       take_profit_bps = EXCLUDED.take_profit_bps,
       stop_loss_bps = EXCLUDED.stop_loss_bps,
       auto_follow = EXCLUDED.auto_follow,
       updated_at = NOW()`,
    [
      row.vault,
      row.investor,
      row.role,
      row.parkAmount,
      row.takeProfitBps ?? null,
      row.stopLossBps ?? null,
      row.autoFollow ?? true,
    ]
  );
}
