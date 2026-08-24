import { Connection, PublicKey } from "@solana/web3.js";
import { RPC_URL } from "./config";

/** Deployed Vault account size (8 + INIT_SPACE with book_mode). */
export const CURRENT_VAULT_ACCOUNT_LEN = 565;

/**
 * Tag vault rows with layoutCompatible. Legacy accounts (594 / 562) hit
 * Anchor 3003 AccountDidNotDeserialize on initiate_vault_close.
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

  const byPk = new Map<string, boolean>();
  keys.forEach((k, i) => {
    const info = infos[i];
    byPk.set(k.toBase58(), Boolean(info && info.data.length === CURRENT_VAULT_ACCOUNT_LEN));
  });

  return vaults.map((v) => {
    const pk = String(v.pubkey ?? "");
    return {
      ...v,
      layoutCompatible: byPk.get(pk) ?? false,
    };
  });
}
