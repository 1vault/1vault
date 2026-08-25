import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_URL } from "./config";

/** Deployed Vault account size (8 + INIT_SPACE with book_mode). */
export const CURRENT_VAULT_ACCOUNT_LEN = 565;

const STATUS_LABEL: Record<number, string> = {
  0: "Active",
  1: "Paused",
  2: "Closing",
  3: "Closed",
};

type VaultOnChainMeta = {
  ok: boolean;
  status?: string;
  statusCode?: number;
  openPositions?: number;
  pendingTrades?: number;
  positionValue?: string;
  liquidForClose?: boolean;
};

function decodeVaultMeta(data: Uint8Array): VaultOnChainMeta {
  if (data.length !== CURRENT_VAULT_ACCOUNT_LEN) return { ok: false };
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let o = 8 + 32 + 8;
    const nameLen = view.getUint32(o, true);
    o += 4 + nameLen;
    const descLen = view.getUint32(o, true);
    o += 4 + descLen;
    o += 32 + 1 + 32 * 5 + 32 + 32; // base_mint … vault_token_account
    o += 8; // total_shares
    o += 8; // total_assets
    if (o + 8 > data.length) return { ok: false };
    const positionValue = view.getBigUint64(o, true).toString();
    o += 8; // position_value
    o += 8; // high_water_mark
    o += 2 + 1 + 2; // perf + book + early_exit
    if (o >= data.length) return { ok: false };
    const statusCode = data[o] ?? null;
    o += 1;
    o += 2; // max_slippage
    if (o + 2 > data.length) return { ok: false };
    const openPositions = data[o] ?? 0;
    const pendingTrades = data[o + 1] ?? 0;
    const liquidForClose =
      openPositions === 0 && pendingTrades === 0 && positionValue === "0";
    return {
      ok: true,
      statusCode: statusCode ?? undefined,
      status: statusCode != null ? STATUS_LABEL[statusCode] ?? `Unknown(${statusCode})` : undefined,
      openPositions,
      pendingTrades,
      positionValue,
      liquidForClose,
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Tag vault rows with layoutCompatible + on-chain status.
 * Legacy accounts and non-Active vaults cannot Park.
 * Close requires Active/Paused/Closing and no open positions/trades.
 */
export async function annotateVaultLayout(
  vaults: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const pks = vaults
    .map((v) => String(v.pubkey ?? ""))
    .filter((pk) => pk.length >= 32);
  if (pks.length === 0) return vaults;

  const conn = new Connection(RPC_URL, "confirmed");
  const keys = pks.map((pk) => new PublicKey(pk));
  const infos = await conn.getMultipleAccountsInfo(keys);

  const byPk = new Map<string, VaultOnChainMeta>();
  keys.forEach((k, i) => {
    const info = infos[i];
    if (!info) {
      byPk.set(k.toBase58(), { ok: false });
      return;
    }
    byPk.set(k.toBase58(), decodeVaultMeta(new Uint8Array(info.data)));
  });

  return vaults.map((v) => {
    const pk = String(v.pubkey ?? "");
    const meta = byPk.get(pk) ?? { ok: false };
    const statusCode = meta.statusCode;
    // Close: Active/Paused can initiate; Closing can finish close_vault; Closed is done.
    // On-chain also requires is_liquid_for_close (no open positions / pending trades / position_value).
    const statusOk = statusCode === 0 || statusCode === 1 || statusCode === 2;
    const canClose = Boolean(meta.ok && statusOk && meta.liquidForClose);
    return {
      ...v,
      layoutCompatible: meta.ok,
      vaultStatus: meta.status,
      vaultStatusCode: statusCode,
      openPositions: meta.openPositions,
      pendingTrades: meta.pendingTrades,
      canPark: meta.ok && statusCode === 0,
      canClose,
      closeBlockedReason: !meta.ok
        ? "legacy"
        : statusCode === 3
          ? "closed"
          : !meta.liquidForClose
            ? "open_positions"
            : !statusOk
              ? "status"
              : undefined,
    };
  });
}
