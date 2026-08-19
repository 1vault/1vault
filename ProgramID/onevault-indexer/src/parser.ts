import { PublicKey } from "@solana/web3.js";
import { pool } from "./db.js";
import { parseEventName, readI64, readPubkey, readString, readU64 } from "./events.js";

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
           status = 'active',
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
      const deposited = await pool.query(
        `INSERT INTO deposits (vault, investor, amount, shares_minted, nav, signature, block_time)
         SELECT $1,$2,$3,$4,$5,$6,$7
         WHERE NOT EXISTS (SELECT 1 FROM deposits WHERE signature = $6)
         RETURNING id`,
        [vault, investor, amount.toString(), shares.toString(), nav.toString(), signature, ts]
      );
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
        [shares.toString(), signature, vault, investor, amount.toString()]
      );
      if ((deposited.rowCount ?? 0) > 0) {
        await pool.query(
          `UPDATE vaults
           SET nav = $1,
               total_shares = COALESCE(total_shares, 0) + $2,
               updated_at = NOW()
           WHERE pubkey = $3`,
          [nav.toString(), shares.toString(), vault]
        );
        await pool.query(
          `INSERT INTO vault_holdings (vault, investor, role, deposited, shares, last_nav, updated_at)
           VALUES (
             $1, $2,
             CASE WHEN $2 = (SELECT strategist FROM vaults WHERE pubkey = $1) THEN 'degen' ELSE 'retail' END,
             $3, $4, $5, NOW()
           )
           ON CONFLICT (vault, investor) DO UPDATE SET
             deposited = vault_holdings.deposited + EXCLUDED.deposited,
             shares = vault_holdings.shares + EXCLUDED.shares,
             last_nav = EXCLUDED.last_nav,
             updated_at = NOW()`,
          [vault, investor, amount.toString(), shares.toString(), nav.toString()]
        );
      }
      break;
    }
    case "InvestorWithdraw": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const investor = pk(readPubkey(buf, offset)); offset += 32;
      const shares = readU64(buf, offset); offset += 8;
      const gross = readU64(buf, offset); offset += 8;
      const net = readU64(buf, offset); offset += 8;
      const fee = readU64(buf, offset); offset += 8;
      const withdrawn = await pool.query(
        `INSERT INTO withdrawals (vault, investor, shares_burned, gross_amount, net_amount, fee_amount, signature, block_time)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8
         WHERE NOT EXISTS (SELECT 1 FROM withdrawals WHERE signature = $7)
         RETURNING id`,
        [vault, investor, shares.toString(), gross.toString(), net.toString(), fee.toString(), signature, ts]
      );
      if ((withdrawn.rowCount ?? 0) > 0) {
        await pool.query(
          `UPDATE vaults
           SET total_shares = GREATEST(COALESCE(total_shares, 0) - $1, 0), updated_at = NOW()
           WHERE pubkey = $2`,
          [shares.toString(), vault]
        );
        await pool.query(
          `UPDATE vault_holdings
           SET withdrawn_net = withdrawn_net + $1,
               shares = GREATEST(shares - $2, 0),
               updated_at = NOW()
           WHERE vault = $3 AND investor = $4`,
          [net.toString(), shares.toString(), vault, investor]
        );
      }
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
      const inputMint = pk(readPubkey(buf, offset)); offset += 32;
      const outputMint = pk(readPubkey(buf, offset)); offset += 32;
      const entryValue = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO position_events (vault, position_id, event_type, entry_value, signature, block_time)
         SELECT $1,$2,'open',$3,$4,$5
         WHERE NOT EXISTS (
           SELECT 1 FROM position_events
           WHERE signature = $4 AND event_type = 'open' AND position_id = $2
         )`,
        [vault, positionId.toString(), entryValue.toString(), signature, ts]
      );
      await pool.query(
        `INSERT INTO vault_positions
           (vault, position_id, input_mint, output_mint, entry_value, current_value, status, opened_signature, opened_at)
         VALUES ($1,$2,$3,$4,$5,$5,'open',$6,$7)
         ON CONFLICT (vault, position_id) DO UPDATE SET
           input_mint = EXCLUDED.input_mint,
           output_mint = EXCLUDED.output_mint,
           entry_value = EXCLUDED.entry_value,
           current_value = EXCLUDED.current_value,
           status = 'open',
           opened_signature = EXCLUDED.opened_signature,
           opened_at = EXCLUDED.opened_at`,
        [vault, positionId.toString(), inputMint, outputMint, entryValue.toString(), signature, ts]
      );
      break;
    }
    case "PositionUpdated": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const positionId = readU64(buf, offset); offset += 8;
      offset += 8; // old_value
      const newValue = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO position_events (vault, position_id, event_type, current_value, signature, block_time)
         SELECT $1,$2,'mark',$3,$4,$5
         WHERE NOT EXISTS (
           SELECT 1 FROM position_events
           WHERE signature = $4 AND event_type = 'mark' AND position_id = $2
         )`,
        [vault, positionId.toString(), newValue.toString(), signature, ts]
      );
      await pool.query(
        `UPDATE vault_positions SET current_value = $1 WHERE vault = $2 AND position_id = $3`,
        [newValue.toString(), vault, positionId.toString()]
      );
      break;
    }
    case "PositionClosed": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const positionId = readU64(buf, offset); offset += 8;
      const proceeds = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO position_events (vault, position_id, event_type, proceeds, signature, block_time)
         SELECT $1,$2,'close',$3,$4,$5
         WHERE NOT EXISTS (
           SELECT 1 FROM position_events
           WHERE signature = $4 AND event_type = 'close' AND position_id = $2
         )`,
        [vault, positionId.toString(), proceeds.toString(), signature, ts]
      );
      await pool.query(
        `UPDATE vault_positions
         SET status = 'closed', proceeds = $1, closed_signature = $2, closed_at = $3, current_value = 0
         WHERE vault = $4 AND position_id = $5`,
        [proceeds.toString(), signature, ts, vault, positionId.toString()]
      );
      break;
    }
    case "PositionFollowersClosed": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const positionId = readU64(buf, offset); offset += 8;
      const count = buf.readUInt8(offset);
      await pool.query(
        `INSERT INTO position_events (vault, position_id, event_type, current_value, signature, block_time)
         SELECT $1,$2,'followers_close',$3,$4,$5
         WHERE NOT EXISTS (
           SELECT 1 FROM position_events
           WHERE signature = $4 AND event_type = 'followers_close' AND position_id = $2
         )`,
        [vault, positionId.toString(), String(count), signature, ts]
      );
      await pool.query(
        `UPDATE vault_positions SET follower_count = $1 WHERE vault = $2 AND position_id = $3`,
        [count, vault, positionId.toString()]
      );
      await pool.query(
        `UPDATE investor_positions SET status = 'closed', closed_at = $1
         WHERE vault = $2 AND position_id = $3 AND status = 'open'`,
        [ts, vault, positionId.toString()]
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
         SELECT $1,$2,'tp_sl',$3,$4,$5,$6
         WHERE NOT EXISTS (
           SELECT 1 FROM position_events
           WHERE signature = $5 AND event_type = 'tp_sl' AND position_id = $2
         )`,
        [vault, positionId.toString(), currentValue.toString(), trigger, signature, ts]
      );
      await pool.query(
        `UPDATE vault_positions
         SET status = 'tp_sl', current_value = $1, closed_signature = $2, closed_at = $3
         WHERE vault = $4 AND position_id = $5`,
        [currentValue.toString(), signature, ts, vault, positionId.toString()]
      );
      break;
    }
    case "FeeAccrued": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const performanceFee = readU64(buf, offset); offset += 8;
      const protocolFee = readU64(buf, offset); offset += 8;
      const sharePrice = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO fee_accruals (vault, performance_fee, protocol_fee, share_price, signature, block_time)
         SELECT $1,$2,$3,$4,$5,$6
         WHERE NOT EXISTS (SELECT 1 FROM fee_accruals WHERE signature = $5)`,
        [vault, performanceFee.toString(), protocolFee.toString(), sharePrice.toString(), signature, ts]
      );
      await pool.query(
        `INSERT INTO pnl_snapshots (vault, share_price, nav, total_shares, snapshot_at, signature)
         SELECT $1, $2, COALESCE(nav, 0), COALESCE(total_shares, 0), $3, $4
         FROM vaults WHERE pubkey = $1
           AND NOT EXISTS (SELECT 1 FROM pnl_snapshots WHERE signature = $4)`,
        [vault, sharePrice.toString(), ts ?? new Date(), signature]
      );
      break;
    }
    case "ReferralRewardAccrued": {
      const user = pk(readPubkey(buf, offset)); offset += 32;
      const referrer = pk(readPubkey(buf, offset)); offset += 32;
      const amount = readU64(buf, offset); offset += 8;
      await pool.query(
        `INSERT INTO referral_rewards (user_pubkey, referrer, amount, signature, block_time)
         SELECT $1,$2,$3,$4,$5
         WHERE NOT EXISTS (SELECT 1 FROM referral_rewards WHERE signature = $4)`,
        [user, referrer, amount.toString(), signature, ts]
      );
      break;
    }
    case "PlatformStaked": {
      const owner = pk(readPubkey(buf, offset)); offset += 32;
      const amount = readU64(buf, offset); offset += 8;
      const totalStaked = readU64(buf, offset); offset += 8;
      const tier = buf.readUInt8(offset);
      await pool.query(
        `INSERT INTO staking_events (owner, event_type, amount, tier, signature, block_time)
         SELECT $1,'stake',$2,$3,$4,$5
         WHERE NOT EXISTS (
           SELECT 1 FROM staking_events WHERE signature = $4 AND event_type = 'stake'
         )`,
        [owner, amount.toString(), tier, signature, ts]
      );
      await pool.query(
        `INSERT INTO platform_stakers (owner, total_staked, tier, updated_at)
         VALUES ($1,$2,$3,NOW())
         ON CONFLICT (owner) DO UPDATE SET
           total_staked = EXCLUDED.total_staked,
           tier = EXCLUDED.tier,
           updated_at = NOW()`,
        [owner, totalStaked.toString(), tier]
      );
      break;
    }
    case "PlatformUnstaked": {
      const owner = pk(readPubkey(buf, offset)); offset += 32;
      const amount = readU64(buf, offset); offset += 8;
      const unstaked = await pool.query(
        `INSERT INTO staking_events (owner, event_type, amount, signature, block_time)
         SELECT $1,'unstake',$2,$3,$4
         WHERE NOT EXISTS (
           SELECT 1 FROM staking_events WHERE signature = $3 AND event_type = 'unstake'
         )
         RETURNING id`,
        [owner, amount.toString(), signature, ts]
      );
      if ((unstaked.rowCount ?? 0) > 0) {
        await pool.query(
          `UPDATE platform_stakers
           SET total_staked = GREATEST(total_staked - $1, 0), updated_at = NOW()
           WHERE owner = $2`,
          [amount.toString(), owner]
        );
      }
      break;
    }
    case "InvestorMirrored": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const investor = pk(readPubkey(buf, offset)); offset += 32;
      const positionId = readU64(buf, offset); offset += 8;
      const allocation = readU64(buf, offset); offset += 8;
      const autoByKeeper = buf.readUInt8(offset) !== 0;
      await pool.query(
        `INSERT INTO follow_events (vault, investor, position_id, allocation, auto_by_keeper, signature, block_time)
         SELECT $1,$2,$3,$4,$5,$6,$7
         WHERE NOT EXISTS (
           SELECT 1 FROM follow_events
           WHERE signature = $6 AND investor = $2 AND position_id = $3
         )`,
        [vault, investor, positionId.toString(), allocation.toString(), autoByKeeper, signature, ts]
      );
      await pool.query(
        `INSERT INTO investor_positions
           (vault, investor, position_id, allocation, auto_by_keeper, status, signature, opened_at)
         VALUES ($1,$2,$3,$4,$5,'open',$6,$7)
         ON CONFLICT (vault, investor, position_id) DO UPDATE SET
           allocation = EXCLUDED.allocation,
           status = 'open',
           signature = EXCLUDED.signature,
           opened_at = EXCLUDED.opened_at`,
        [vault, investor, positionId.toString(), allocation.toString(), autoByKeeper, signature, ts]
      );
      await pool.query(
        `UPDATE vaults SET
           active_followers = (SELECT COUNT(DISTINCT investor) FROM investor_positions WHERE vault = $1 AND status = 'open'),
           updated_at = NOW()
         WHERE pubkey = $1`,
        [vault]
      );
      break;
    }
    case "VaultClosingInitiated": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      await pool.query(
        `UPDATE vaults SET status = 'closing', updated_at = NOW() WHERE pubkey = $1`,
        [vault]
      );
      break;
    }
    case "VaultClosed": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      await pool.query(
        `UPDATE vaults SET status = 'closed', updated_at = NOW() WHERE pubkey = $1`,
        [vault]
      );
      await pool.query(
        `UPDATE vault_holdings SET shares = 0, updated_at = NOW() WHERE vault = $1`,
        [vault]
      );
      break;
    }
    case "VaultClosePayout": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const investor = pk(readPubkey(buf, offset)); offset += 32;
      const shares = readU64(buf, offset); offset += 8;
      const amount = readU64(buf, offset); offset += 8;
      const payout = await pool.query(
        `INSERT INTO close_payouts (vault, investor, shares, amount, signature, block_time)
         SELECT $1,$2,$3,$4,$5,$6
         WHERE NOT EXISTS (
           SELECT 1 FROM close_payouts WHERE signature = $5 AND investor = $2
         )
         RETURNING id`,
        [vault, investor, shares.toString(), amount.toString(), signature, ts]
      );
      if ((payout.rowCount ?? 0) > 0) {
        await pool.query(
          `INSERT INTO vault_holdings (vault, investor, role, close_returned, shares, updated_at)
           VALUES ($1,$2,'retail',$3,0,NOW())
           ON CONFLICT (vault, investor) DO UPDATE SET
             close_returned = vault_holdings.close_returned + EXCLUDED.close_returned,
             shares = 0,
             updated_at = NOW()`,
          [vault, investor, amount.toString()]
        );
      }
      break;
    }
    case "VaultSolStaked": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const lamports = readU64(buf, offset); offset += 8;
      const validator = pk(readPubkey(buf, offset)); offset += 32;
      const staked = await pool.query(
        `INSERT INTO vault_sol_stake_events (vault, event_type, lamports, validator, signature, block_time)
         SELECT $1,'stake',$2,$3,$4,$5
         WHERE NOT EXISTS (
           SELECT 1 FROM vault_sol_stake_events WHERE signature = $4 AND event_type = 'stake'
         )
         RETURNING id`,
        [vault, lamports.toString(), validator, signature, ts]
      );
      if ((staked.rowCount ?? 0) > 0) {
        await pool.query(
          `INSERT INTO vault_sol_stakes (vault, lamports, validator, updated_at)
           VALUES ($1,$2,$3,NOW())
           ON CONFLICT (vault) DO UPDATE SET
             lamports = vault_sol_stakes.lamports + EXCLUDED.lamports,
             validator = EXCLUDED.validator,
             updated_at = NOW()`,
          [vault, lamports.toString(), validator]
        );
      }
      break;
    }
    case "VaultSolUnstaked": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const lamports = readU64(buf, offset); offset += 8;
      const unstaked = await pool.query(
        `INSERT INTO vault_sol_stake_events (vault, event_type, lamports, signature, block_time)
         SELECT $1,'unstake',$2,$3,$4
         WHERE NOT EXISTS (
           SELECT 1 FROM vault_sol_stake_events WHERE signature = $3 AND event_type = 'unstake'
         )
         RETURNING id`,
        [vault, lamports.toString(), signature, ts]
      );
      if ((unstaked.rowCount ?? 0) > 0) {
        await pool.query(
          `UPDATE vault_sol_stakes
           SET lamports = GREATEST(lamports - $1, 0), updated_at = NOW()
           WHERE vault = $2`,
          [lamports.toString(), vault]
        );
      }
      break;
    }
    case "ProtocolInitialized": {
      const authority = pk(readPubkey(buf, offset)); offset += 32;
      const treasury = pk(readPubkey(buf, offset)); offset += 32;
      const mint = pk(readPubkey(buf, offset)); offset += 32;
      await pool.query(
        `INSERT INTO protocol_state (id, authority, treasury, platform_token_mint, initialized_at, updated_at)
         VALUES (1,$1,$2,$3,$4,NOW())
         ON CONFLICT (id) DO UPDATE SET
           authority = EXCLUDED.authority,
           treasury = EXCLUDED.treasury,
           platform_token_mint = EXCLUDED.platform_token_mint,
           initialized_at = COALESCE(protocol_state.initialized_at, EXCLUDED.initialized_at),
           updated_at = NOW()`,
        [authority, treasury, mint, ts]
      );
      break;
    }
    case "RiskCircuitBreakerTripped": {
      const vault = pk(readPubkey(buf, offset)); offset += 32;
      const reason = buf.readUInt8(offset); offset += 1;
      const drawdownBps = buf.readUInt16LE(offset);
      await pool.query(
        `INSERT INTO circuit_breaker_events (vault, reason, drawdown_bps, signature, block_time)
         SELECT $1,$2,$3,$4,$5
         WHERE NOT EXISTS (SELECT 1 FROM circuit_breaker_events WHERE signature = $4)`,
        [vault, reason, drawdownBps, signature, ts]
      );
      await pool.query(
        `UPDATE vaults SET circuit_breaker_active = TRUE, updated_at = NOW() WHERE pubkey = $1`,
        [vault]
      );
      break;
    }
    case "UpgradeProposalCreated": {
      const multisig = pk(readPubkey(buf, offset)); offset += 32;
      const proposalId = readU64(buf, offset); offset += 8;
      const proposer = pk(readPubkey(buf, offset)); offset += 32;
      const programBuffer = pk(readPubkey(buf, offset)); offset += 32;
      const label = readString(buf, offset);
      offset += label.size;
      const expiresAt = Number(readI64(buf, offset));
      await pool.query(
        `INSERT INTO upgrade_proposals
           (multisig, proposal_id, proposer, program_buffer, version_label, status, expires_at, signature, updated_at)
         VALUES ($1,$2,$3,$4,$5,'created', to_timestamp($6), $7, NOW())
         ON CONFLICT (multisig, proposal_id) DO UPDATE SET
           proposer = EXCLUDED.proposer,
           program_buffer = EXCLUDED.program_buffer,
           version_label = EXCLUDED.version_label,
           signature = EXCLUDED.signature,
           updated_at = NOW()`,
        [multisig, proposalId.toString(), proposer, programBuffer, label.value, expiresAt, signature]
      );
      break;
    }
    case "UpgradeProposalApproved": {
      const multisig = pk(readPubkey(buf, offset)); offset += 32;
      const proposalId = readU64(buf, offset); offset += 8;
      offset += 32; // member
      const approvalCount = buf.readUInt8(offset); offset += 1;
      const threshold = buf.readUInt8(offset);
      await pool.query(
        `INSERT INTO upgrade_proposals (multisig, proposal_id, status, approval_count, threshold, signature, updated_at)
         VALUES ($1,$2,'approved',$3,$4,$5,NOW())
         ON CONFLICT (multisig, proposal_id) DO UPDATE SET
           status = 'approved',
           approval_count = EXCLUDED.approval_count,
           threshold = EXCLUDED.threshold,
           signature = EXCLUDED.signature,
           updated_at = NOW()`,
        [multisig, proposalId.toString(), approvalCount, threshold, signature]
      );
      break;
    }
    case "UpgradeProposalReady": {
      const multisig = pk(readPubkey(buf, offset)); offset += 32;
      const proposalId = readU64(buf, offset); offset += 8;
      await pool.query(
        `UPDATE upgrade_proposals SET status = 'ready', signature = $3, updated_at = NOW()
         WHERE multisig = $1 AND proposal_id = $2`,
        [multisig, proposalId.toString(), signature]
      );
      break;
    }
    case "UpgradeProposalCancelled": {
      const multisig = pk(readPubkey(buf, offset)); offset += 32;
      const proposalId = readU64(buf, offset); offset += 8;
      await pool.query(
        `UPDATE upgrade_proposals SET status = 'cancelled', signature = $3, updated_at = NOW()
         WHERE multisig = $1 AND proposal_id = $2`,
        [multisig, proposalId.toString(), signature]
      );
      break;
    }
    case "UpgradeProposalExecuted": {
      const multisig = pk(readPubkey(buf, offset)); offset += 32;
      const proposalId = readU64(buf, offset); offset += 8;
      await pool.query(
        `UPDATE upgrade_proposals SET status = 'executed', signature = $3, updated_at = NOW()
         WHERE multisig = $1 AND proposal_id = $2`,
        [multisig, proposalId.toString(), signature]
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
