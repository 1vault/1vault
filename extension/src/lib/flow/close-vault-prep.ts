import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { Keypair } from "@solana/web3.js";
import { getProtocol, getVault, listVaultPositions, listVaultTrades } from "../api/client";
import { api } from "../api/client";
import { RPC_URL } from "../config";
import { runPreparedTx } from "../tx-run";
import {
  attachTradeIds,
  parseVaultPositions,
  type VaultPositionRow,
} from "../trade/positions";
import { fetchVaultCloseMeta } from "../vault-layout";
import { fetchOnChainOpenPositions } from "./vault-positions-onchain";
import { fetchVaultTradeCursor } from "./vault-cursor";

export type ExitPositionTarget = VaultPositionRow & { outputAmount: string };

const CANCEL_TRADE_DISC = Uint8Array.from([124, 66, 91, 59, 175, 107, 208, 120]);
const WSOL = "So11111111111111111111111111111111111111112";

function u64LE(id: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(id), true);
  return buf;
}

function tradePda(program: PublicKey, vault: PublicKey, tradeId: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("trade"), vault.toBuffer(), u64LE(tradeId)],
    program
  );
  return pda;
}

/** Open/reduced positions from API + on-chain (merged by positionId). */
export async function resolveOpenVaultPositions(vault: string): Promise<ExitPositionTarget[]> {
  const [posData, tradesData, onChain] = await Promise.all([
    listVaultPositions(vault).catch(() => ({})),
    listVaultTrades(vault).catch(() => ({ items: [] as Array<Record<string, unknown>> })),
    fetchOnChainOpenPositions(vault).catch(() => [] as Array<VaultPositionRow & { outputAmount: string }>),
  ]);

  const byId = new Map<number, ExitPositionTarget>();

  for (const row of onChain) {
    byId.set(row.positionId, { ...row, tradeId: row.tradeId || 0 });
  }

  const parsed = attachTradeIds(
    parseVaultPositions(posData as Record<string, unknown>),
    tradesData.items ?? []
  );
  const envelope = posData as Record<string, unknown>;
  const raw = (envelope.vault ?? envelope.items ?? envelope.positions ?? []) as Array<
    Record<string, unknown>
  >;
  parsed.forEach((p, i) => {
    const src = raw[i] ?? {};
    const amt = String(src.output_amount ?? src.outputAmount ?? p.entryValue ?? "0");
    const existing = byId.get(p.positionId);
    byId.set(p.positionId, {
      ...p,
      outputAmount: existing?.outputAmount ?? amt,
      inputMint: existing?.inputMint || p.inputMint,
      outputMint: existing?.outputMint || p.outputMint,
      tradeId: p.tradeId || existing?.tradeId || 0,
    });
  });

  return attachTradeIds([...byId.values()], tradesData.items ?? []).map((p) => {
    const prev = byId.get(p.positionId);
    return { ...p, outputAmount: prev?.outputAmount ?? p.entryValue ?? "0" };
  });
}

async function resolveVaultTokenAccount(vault: string): Promise<string> {
  try {
    const raw = await getVault(vault);
    const row = ((raw as { vault?: Record<string, unknown> }).vault ?? raw) as Record<
      string,
      unknown
    >;
    const vta = String(row.vaultTokenAccount ?? row.vault_token_account ?? "");
    if (vta.length >= 32) return vta;
  } catch {
    /* fall through */
  }
  const conn = new Connection(RPC_URL, "confirmed");
  const info = await conn.getAccountInfo(new PublicKey(vault), "confirmed");
  if (!info?.data) throw new Error("vault account not found");
  const d = info.data;
  let o = 8 + 32 + 8;
  const skipStr = () => {
    const n = d.readUInt32LE(o);
    o += 4 + n;
  };
  skipStr();
  skipStr();
  o += 32 + 1 + 32 * 5 + 32; // base, count, mints, share
  return new PublicKey(d.subarray(o, o + 32)).toBase58();
}

/** Close position on-chain without DEX sell (proceeds=0). Clears open_positions + position_value. */
export async function closePositionAccounting(
  strategist: string,
  vault: string,
  positionId: number,
  keypair: Keypair,
  vaultTokenAccount?: string
): Promise<string> {
  const vta = vaultTokenAccount || (await resolveVaultTokenAccount(vault));
  const prepared = await api<{
    close?: {
      transaction?: string;
      signerDetails?: Array<{ pubkey: string; userMustSign?: boolean }>;
    };
    transaction?: string;
    signerDetails?: Array<{ pubkey: string; userMustSign?: boolean }>;
  }>("/v1/tx/close-position", {
    method: "POST",
    body: JSON.stringify({
      strategist,
      vault,
      vaultTokenAccount: vta,
      outputTokenAccount: vta,
      positionId,
      proceeds: 0,
    }),
  });
  const tx = prepared.close ?? prepared;
  return runPreparedTx(tx, keypair);
}

/** Cancel Pending trade requests that block vault close. */
export async function cancelPendingTrades(
  vault: string,
  strategistKey: Keypair
): Promise<number> {
  const proto = await getProtocol().catch(() => ({} as { programId?: string }));
  if (!proto.programId) return 0;

  const program = new PublicKey(proto.programId);
  const vaultPk = new PublicKey(vault);
  const cursor = await fetchVaultTradeCursor(RPC_URL, vault);
  if (cursor.tradeId <= 1) return 0;

  const conn = new Connection(RPC_URL, "confirmed");
  const ids = Array.from({ length: Math.min(cursor.tradeId - 1, 32) }, (_, i) => i + 1);
  const keys = ids.map((id) => tradePda(program, vaultPk, id));
  const infos = await conn.getMultipleAccountsInfo(keys, "confirmed");

  let cancelled = 0;
  for (let i = 0; i < infos.length; i++) {
    const info = infos[i];
    if (!info?.data || info.data.length < 178) continue;
    // TradeStatus Pending = 0 at offset 177
    if (info.data[177] !== 0) continue;

    const tradeId = ids[i]!;
    const trade = keys[i]!;
    const ix = new TransactionInstruction({
      programId: program,
      keys: [
        { pubkey: strategistKey.publicKey, isSigner: true, isWritable: true },
        { pubkey: vaultPk, isSigner: false, isWritable: true },
        { pubkey: trade, isSigner: false, isWritable: true },
      ],
      // web3.js typings expect Buffer; Uint8Array is accepted at runtime
      data: CANCEL_TRADE_DISC as never,
    });
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction().add(ix);
    tx.feePayer = strategistKey.publicKey;
    tx.recentBlockhash = blockhash;
    tx.sign(strategistKey);
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    cancelled++;
  }
  return cancelled;
}

export async function waitVaultLiquidForClose(
  vault: string,
  maxMs = 45000,
  intervalMs = 800
): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    const meta = await fetchVaultCloseMeta(vault);
    if (meta.canClose) return;
    if (meta.closeBlockedReason === "closed") return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const meta = await fetchVaultCloseMeta(vault);
  if (!meta.canClose) {
    const n = meta.openPositions ?? 0;
    const pending = meta.pendingTrades ?? 0;
    const pv = meta.positionValue ?? "0";
    throw new Error(
      `Vault still not ready to close (open_positions=${n}, pending_trades=${pending}, position_value=${pv}). ` +
        (n > 0
          ? "Exit remaining positions on Trade, then retry Close."
          : pending > 0
            ? "Pending trades remain — retry Close to cancel them."
            : "Stuck position value with no open positions — create a new vault if Close keeps failing.")
    );
  }
}
