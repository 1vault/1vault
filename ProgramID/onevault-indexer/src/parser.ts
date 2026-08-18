import { PublicKey } from "@solana/web3.js";
import { pool } from "./db.js";
import { parseEventName, readI64, readPubkey, readU64 } from "./events.js";

function pk(hex: string): string {
  try {
    return new PublicKey(Buffer.from(hex, "hex")).toBase58();
  } catch {
    return hex;
  }
}

export async function handleProgramLog(
  signature: string,
  slot: number,
  blockTime: number | null,
  logLine: string
): Promise<void> {
  const prefix = "Program data: ";
  const idx = logLine.indexOf(prefix);
  if (idx === -1) return;

  const b64 = logLine.slice(idx + prefix.length).trim();
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 8) return;

  const disc = buf.subarray(0, 8).toString("hex");
  const name = parseEventName(disc);
  if (!name) return;

  const ts = blockTime ? new Date(blockTime * 1000) : null;
  let offset = 8;

  switch (name) {
    case "VaultCreated": {
      const vault = pk(readPubkey(buf, offset));
      offset += 32;
      const strategist = pk(readPubkey(buf, offset));
      offset += 32;
      const vaultId = readU64(buf, offset);
      offset += 8;
      const baseMint = pk(readPubkey(buf, offset));
      offset += 32;
      const performanceFeeBps = buf.readUInt16LE(offset);
      await pool.query(
        `INSERT INTO vaults (pubkey, strategist, vault_id, base_mint, performance_fee_bps, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (pubkey) DO UPDATE SET
           strategist = EXCLUDED.strategist,
           vault_id = EXCLUDED.vault_id,
           base_mint = EXCLUDED.base_mint,
           performance_fee_bps = EXCLUDED.performance_fee_bps,
           updated_at = NOW()`,
        [vault, strategist, vaultId.toString(), baseMint, performanceFeeBps, ts]
      );
      await pool.query(
        `INSERT INTO strategists (pubkey, updated_at) VALUES ($1, NOW())
         ON CONFLICT (pubkey) DO UPDATE SET updated_at = NOW()`,
        [strategist]
      );
      break;
    }
    case "InvestorDeposit": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const investor = pk(readPubkey(buf, offset)); offset += 32;
      const amount = readU64(buf, offset); offset += 8;
      const shares = readU64(buf, offset); offset += 8;
      const nav = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO deposits (vault, investor, amount, shares_minted, nav, signature, block_time)
         SELECT $1,$2,$3,$4,$5,$6,$7
         WHERE NOT EXISTS (SELECT 1 FROM deposits WHERE signature = $6)`,
        [vault, investor, amount.toString(), shares.toString(), nav.toString(), signature, ts]
      );
      await pool.query(`UPDATE vaults SET nav = $1, updated_at = NOW() WHERE pubkey = $2`, [nav.toString(), vault]);
      break;
    }
    case "InvestorWithdraw": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const investor = pk(readPubkey(buf, offset)); offset += 32;
      const shares = readU64(buf, offset); offset += 8;
      const gross = readU64(buf, offset); offset += 8;
      const net = readU64(buf, offset); offset += 8;
      const fee = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO withdrawals (vault, investor, shares_burned, gross_amount, net_amount, fee_amount, signature, block_time)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8
         WHERE NOT EXISTS (SELECT 1 FROM withdrawals WHERE signature = $7)`,
        [vault, investor, shares.toString(), gross.toString(), net.toString(), fee.toString(), signature, ts]
      );
      break;
    }
    case "TradeRequested": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      offset += 32; // strategist
      const tradeId = readU64(buf, offset); offset += 8;
      const action = buf.readUInt8(offset); offset += 1;
      const inputMint = pk(readPubkey(buf, offset)); offset += 32;
      const outputMint = pk(readPubkey(buf, offset)); offset += 32;
      const amount = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO trades (vault, trade_id, action, input_mint, output_mint, amount, status, signature, block_time)
         VALUES ($1,$2,$3,$4,$5,$6,'requested',$7,$8)
         ON CONFLICT (vault, trade_id) DO UPDATE SET status = 'requested', signature = EXCLUDED.signature`,
        [vault, tradeId.toString(), action, inputMint, outputMint, amount.toString(), signature, ts]
      );
      break;
    }
    case "TradeExecuted": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const tradeId = readU64(buf, offset); offset += 8;
      const received = readU64(buf, offset); offset += 8;
      const dex = pk(readPubkey(buf, offset)); offset += 32;
      await pool.query(
        `UPDATE trades SET received = $1, dex_program = $2, status = 'executed', signature = $3, block_time = $4
         WHERE vault = $5 AND trade_id = $6`,
        [received.toString(), dex, signature, ts, vault, tradeId.toString()]
      );
      break;
    }
    case "PositionOpened": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const positionId = readU64(buf, offset); offset += 8;
      offset += 64; // mints
      const entryValue = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO position_events (vault, position_id, event_type, entry_value, signature, block_time)
         VALUES ($1,$2,'open',$3,$4,$5)`,
        [vault, positionId.toString(), entryValue.toString(), signature, ts]
      );
      break;
    }
    case "PositionClosed": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const positionId = readU64(buf, offset); offset += 8;
      const proceeds = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO position_events (vault, position_id, event_type, proceeds, signature, block_time)
         VALUES ($1,$2,'close',$3,$4,$5)`,
        [vault, positionId.toString(), proceeds.toString(), signature, ts]
      );
      break;
    }
    case "TpSlTriggered": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const positionId = readU64(buf, offset); offset += 8;
      const trigger = buf.readUInt8(offset); offset += 1;
      const currentValue = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO position_events (vault, position_id, event_type, current_value, trigger_type, signature, block_time)
         VALUES ($1,$2,'tp_sl',$3,$4,$5,$6)`,
        [vault, positionId.toString(), currentValue.toString(), trigger, signature, ts]
      );
      break;
    }
    case "FeeAccrued": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      offset += 16; // fees
      const sharePrice = readU64(buf, offset); offset += 8;
      const nav = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO pnl_snapshots (vault, share_price, nav, total_shares, snapshot_at)
         SELECT $1, $2, $3, COALESCE(total_shares, 0), $4 FROM vaults WHERE pubkey = $1`,
        [vault, sharePrice.toString(), nav.toString(), ts ?? new Date()]
      );
      break;
    }
    case "ReferralRewardAccrued": {
      const user = pk(readPubkey(buf, offset)); offset += 32;
      const referrer = pk(readPubkey(buf, offset)); offset += 32;
      const amount = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO referral_rewards (user_pubkey, referrer, amount, signature, block_time) VALUES ($1,$2,$3,$4,$5)`,
        [user, referrer, amount.toString(), signature, ts]
      );
      break;
    }
    case "PlatformStaked": {
      const owner = pk(readPubkey(buf, offset)); offset += 32;
      const amount = readU64(buf, offset); offset += 8;
      offset += 8; // total
      const tier = buf.readUInt8(offset);
      await pool.query(
        `INSERT INTO staking_events (owner, event_type, amount, tier, signature, block_time) VALUES ($1,'stake',$2,$3,$4,$5)`,
        [owner, amount.toString(), tier, signature, ts]
      );
      break;
    }
    case "PlatformUnstaked": {
      const owner = pk(readPubkey(buf, offset)); offset += 32;
      const amount = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO staking_events (owner, event_type, amount, signature, block_time) VALUES ($1,'unstake',$2,$3,$4)`,
        [owner, amount.toString(), signature, ts]
      );
      break;
    }
    case "InvestorMirrored": {
      const vault = pk(readPubkey(buf, offset));
      await pool.query(
        `UPDATE vaults SET active_followers = COALESCE(active_followers, 0) + 1, updated_at = NOW() WHERE pubkey = $1`,
        [vault]
      );
      break;
    }
    case "RiskCircuitBreakerTripped": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      await pool.query(
        `UPDATE vaults SET circuit_breaker_active = TRUE, updated_at = NOW() WHERE pubkey = $1`,
        [vault]
      );
      break;
    }
    default:
      break;
  }

  await pool.query(
    `INSERT INTO transactions (signature, slot, block_time, instruction, raw_event)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (signature) DO NOTHING`,
    [signature, slot, ts, name, disc]
  );
}
