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

export type CloseBlockedReason =
  | "legacy"
  | "missing"
  | "closed"
  | "open_positions"
  | "status"
  | "rpc";

export type VaultCloseMeta = {
  ok: boolean;
  status?: string;
  statusCode?: number;
  openPositions?: number;
  pendingTrades?: number;
  positionValue?: string;
  liquidForClose?: boolean;
  canClose: boolean;
  closeBlockedReason?: CloseBlockedReason;
  accountLen?: number;
};

function decodeVaultMeta(data: Uint8Array): Omit<VaultCloseMeta, "canClose" | "closeBlockedReason"> & {
  ok: boolean;
} {
  if (data.length !== CURRENT_VAULT_ACCOUNT_LEN) {
    return { ok: false, accountLen: data.length };
  }
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
    if (o + 8 > data.length) return { ok: false, accountLen: data.length };
    const positionValue = view.getBigUint64(o, true).toString();
    o += 8; // position_value
    o += 8; // high_water_mark
    o += 2 + 1 + 2; // perf + book + early_exit
    if (o >= data.length) return { ok: false, accountLen: data.length };
    const statusCode = data[o] ?? null;
    o += 1;
    o += 2; // max_slippage
    if (o + 2 > data.length) return { ok: false, accountLen: data.length };
    const openPositions = data[o] ?? 0;
    const pendingTrades = data[o + 1] ?? 0;
    const liquidForClose =
      openPositions === 0 && pendingTrades === 0 && positionValue === "0";
    return {
      ok: true,
      accountLen: data.length,
      statusCode: statusCode ?? undefined,
      status: statusCode != null ? STATUS_LABEL[statusCode] ?? `Unknown(${statusCode})` : undefined,
      openPositions,
      pendingTrades,
      positionValue,
      liquidForClose,
    };
  } catch {
    return { ok: false, accountLen: data.length };
  }
}

function toCloseMeta(meta: ReturnType<typeof decodeVaultMeta>, missing: boolean): VaultCloseMeta {
  if (missing) {
    return { ok: false, canClose: false, closeBlockedReason: "missing" };
  }
  if (!meta.ok) {
    return {
      ...meta,
      canClose: false,
      closeBlockedReason: "legacy",
    };
  }
  const statusCode = meta.statusCode;
  const statusOk = statusCode === 0 || statusCode === 1 || statusCode === 2;
  const canClose = Boolean(statusOk && meta.liquidForClose);
  const closeBlockedReason: CloseBlockedReason | undefined =
    statusCode === 3
      ? "closed"
      : !meta.liquidForClose
        ? "open_positions"
        : !statusOk
          ? "status"
          : undefined;
  return { ...meta, canClose, closeBlockedReason };
}

/** Fresh on-chain close eligibility for one vault (used on detail screen). */
export async function fetchVaultCloseMeta(vaultPubkey: string): Promise<VaultCloseMeta> {
  try {
    const conn = new Connection(RPC_URL, "confirmed");
    const info = await conn.getAccountInfo(new PublicKey(vaultPubkey), "confirmed");
    if (!info) return toCloseMeta({ ok: false }, true);
    return toCloseMeta(decodeVaultMeta(new Uint8Array(info.data)), false);
  } catch {
    return { ok: false, canClose: false, closeBlockedReason: "rpc" };
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

  let infos: Array<{ data: Uint8Array } | null>;
  try {
    const conn = new Connection(RPC_URL, "confirmed");
    const keys = pks.map((pk) => new PublicKey(pk));
    const raw = await conn.getMultipleAccountsInfo(keys);
    infos = raw.map((info) => (info ? { data: new Uint8Array(info.data) } : null));
  } catch {
    // Public RPC often rate-limits — do not mark everything as legacy.
    return sortVaultsOpenFirst(
      vaults.map((v) => ({
        ...v,
        closeBlockedReason: "rpc",
        canClose: undefined,
        layoutCompatible: undefined,
      }))
    );
  }

  const byPk = new Map<string, VaultCloseMeta>();
  pks.forEach((pk, i) => {
    const info = infos[i];
    if (!info) {
      byPk.set(pk, toCloseMeta({ ok: false }, true));
      return;
    }
    byPk.set(pk, toCloseMeta(decodeVaultMeta(info.data), false));
  });

  return vaults
    .map((v) => {
      const pk = String(v.pubkey ?? "");
      const meta = byPk.get(pk) ?? toCloseMeta({ ok: false }, true);
      return {
        ...v,
        layoutCompatible: meta.ok,
        vaultStatus: meta.status,
        vaultStatusCode: meta.statusCode,
        openPositions: meta.openPositions,
        pendingTrades: meta.pendingTrades,
        canPark: meta.ok && meta.statusCode === 0,
        canClose: meta.canClose,
        closeBlockedReason: meta.closeBlockedReason,
        accountLen: meta.accountLen,
      };
    })
    .sort(compareVaultOpenFirst);
}

/** Active first; then other open; legacy next; Closed last. */
export function compareVaultOpenFirst(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  return vaultListRank(a) - vaultListRank(b);
}

function vaultListRank(v: Record<string, unknown>): number {
  const status = String(v.vaultStatus ?? "").toLowerCase();
  const statusCode = Number(v.vaultStatusCode);
  const legacy =
    v.layoutCompatible === false || String(v.closeBlockedReason ?? "") === "legacy";

  if (legacy) return 3;
  if (status === "closed" || statusCode === 3) return 4;
  if (status === "active" || statusCode === 0) return 0;
  if (status === "paused" || statusCode === 1) return 1;
  if (status === "closing" || statusCode === 2) return 2;
  // Unknown / RPC — keep above closed & legacy
  return 2;
}

export function sortVaultsOpenFirst<T extends Record<string, unknown>>(vaults: T[]): T[] {
  return [...vaults].sort(compareVaultOpenFirst);
}
