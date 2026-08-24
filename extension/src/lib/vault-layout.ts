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

function decodeStatus(data: Uint8Array): number | null {
  if (data.length !== CURRENT_VAULT_ACCOUNT_LEN) return null;
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let o = 8 + 32 + 8;
    const nameLen = view.getUint32(o, true);
    o += 4 + nameLen;
    const descLen = view.getUint32(o, true);
    o += 4 + descLen;
    o += 32 + 1 + 32 * 5 + 32 + 32 + 8 * 4;
    o += 2 + 1 + 2;
    if (o >= data.length) return null;
    return data[o] ?? null;
  } catch {
    return null;
  }
}

/**
 * Tag vault rows with layoutCompatible + on-chain status.
 * Legacy accounts and non-Active vaults cannot Park.
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

  const byPk = new Map<string, { ok: boolean; status?: string; statusCode?: number }>();
  keys.forEach((k, i) => {
    const info = infos[i];
    if (!info) {
      byPk.set(k.toBase58(), { ok: false });
      return;
    }
    const data = new Uint8Array(info.data);
    const ok = data.length === CURRENT_VAULT_ACCOUNT_LEN;
    const code = ok ? decodeStatus(data) : null;
    byPk.set(k.toBase58(), {
      ok,
      statusCode: code ?? undefined,
      status: code != null ? STATUS_LABEL[code] ?? `Unknown(${code})` : undefined,
    });
  });

  return vaults.map((v) => {
    const pk = String(v.pubkey ?? "");
    const meta = byPk.get(pk) ?? { ok: false };
    const statusCode = meta.statusCode;
    // Close: Active/Paused can initiate; Closing can finish close_vault; Closed is done.
    const canClose =
      meta.ok && (statusCode === 0 || statusCode === 1 || statusCode === 2);
    return {
      ...v,
      layoutCompatible: meta.ok,
      vaultStatus: meta.status,
      vaultStatusCode: statusCode,
      canPark: meta.ok && statusCode === 0,
      canClose,
    };
  });
}
