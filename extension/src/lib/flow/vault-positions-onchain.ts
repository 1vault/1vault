import { Connection, PublicKey } from "@solana/web3.js";
import { getProtocol } from "../api/client";
import { RPC_URL } from "../config";
import type { VaultPositionRow } from "../trade/positions";
import { fetchVaultTradeCursor } from "./vault-cursor";

function u64LE(id: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(id), true);
  return buf;
}

function vaultPositionPDA(program: PublicKey, vault: PublicKey, positionId: number) {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("vault_position"), vault.toBuffer(), u64LE(positionId)],
    program
  );
  return pda;
}

/** PositionStatus: Open=0, Reduced=1, Closed=2 */
function decodePositionAccount(
  data: Uint8Array
): (Omit<VaultPositionRow, "tradeId"> & { outputAmount: string }) | null {
  if (data.length < 141) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8;
  o += 32;
  const positionId = Number(view.getBigUint64(o, true));
  o += 8;
  const inputMint = new PublicKey(data.subarray(o, o + 32)).toBase58();
  o += 32;
  const outputMint = new PublicKey(data.subarray(o, o + 32)).toBase58();
  o += 32;
  const entryValue = view.getBigUint64(o, true).toString();
  o += 8;
  const currentValue = view.getBigUint64(o, true).toString();
  o += 8;
  const outputAmount = view.getBigUint64(o, true).toString();
  o += 8;
  o += 4;
  const status = data[o] ?? 2;
  if (status === 2 || positionId <= 0) return null;
  return {
    positionId,
    inputMint,
    outputMint,
    entryValue,
    currentValue,
    status: status === 0 ? "open" : "reduced",
    outputAmount,
  };
}

/** Scan on-chain vault_position PDAs when the indexer list is empty or stale. */
export async function fetchOnChainOpenPositions(vaultPubkey: string): Promise<
  Array<VaultPositionRow & { outputAmount: string }>
> {
  const proto = await getProtocol().catch(() => ({} as { programId?: string }));
  const programId = proto.programId;
  if (!programId) return [];

  const conn = new Connection(RPC_URL, "confirmed");
  const vault = new PublicKey(vaultPubkey);
  const program = new PublicKey(programId);
  const cursor = await fetchVaultTradeCursor(RPC_URL, vaultPubkey);
  const nextId = cursor.positionId;
  if (nextId <= 1) return [];

  const keys = Array.from({ length: nextId - 1 }, (_, i) =>
    vaultPositionPDA(program, vault, i + 1)
  );
  const infos = await conn.getMultipleAccountsInfo(keys, "confirmed");
  const out: Array<VaultPositionRow & { outputAmount: string }> = [];
  infos.forEach((info, i) => {
    if (!info?.data?.length) return;
    const row = decodePositionAccount(new Uint8Array(info.data));
    if (!row) return;
    out.push({ ...row, tradeId: 0, positionId: row.positionId || i + 1 });
  });
  return out;
}
