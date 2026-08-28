import { Connection, PublicKey } from "@solana/web3.js";
import { getProtocol } from "../api/client";
import { RPC_URL } from "../config";
import { withRpcRetry } from "../rpc-retry";

export const CURRENT_VAULT_ACCOUNT_LEN = 565;

function u64le(n: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, BigInt(n), true);
  return buf;
}

export function strategistPda(program: PublicKey, strategist: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("strategist"), strategist.toBuffer()],
    program
  );
  return pda;
}

export function vaultPda(program: PublicKey, strategist: PublicKey, vaultId: number): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("vault"), strategist.toBuffer(), u64le(vaultId)],
    program
  );
  return pda;
}

export type StrategistVaultMeta = {
  programId: string;
  vaultCount: number;
  activeVaultCount: number;
};

export async function fetchStrategistVaultMeta(strategist: string): Promise<StrategistVaultMeta> {
  const proto = await getProtocol();
  const programId = String(proto.programId ?? "");
  if (!programId) throw new Error("protocol programId missing");

  const program = new PublicKey(programId);
  const owner = new PublicKey(strategist);
  const pda = strategistPda(program, owner);
  const conn = new Connection(RPC_URL, "confirmed");
  const info = await withRpcRetry(() => conn.getAccountInfo(pda, "confirmed"));
  if (!info?.data || info.data.length < 58) {
    throw new Error("strategist account not found — lock a $1VAULT licence first");
  }
  const d = info.data;
  const vaultCount = Number(d.readBigUInt64LE(8 + 32));
  const activeVaultCount = Number(d.readBigUInt64LE(8 + 32 + 8));
  return { programId, vaultCount, activeVaultCount };
}

/** Skip borsh strings after disc+strategist+vault_id → status byte on current layout. */
export function readVaultStatusCode(data: Uint8Array): number | null {
  if (data.length !== CURRENT_VAULT_ACCOUNT_LEN) return null;
  try {
    let o = 8 + 32 + 8;
    for (let i = 0; i < 2; i++) {
      if (o + 4 > data.length) return null;
      const n = data[o]! | (data[o + 1]! << 8) | (data[o + 2]! << 16) | (data[o + 3]! << 24);
      o += 4 + n;
    }
    o += 32 + 1 + 32 * 5 + 32 + 32 + 8 * 4 + 2 + 1 + 2;
    if (o >= data.length) return null;
    return data[o] ?? null;
  } catch {
    return null;
  }
}

export type VaultSlotKind = "missing" | "legacy" | "closed" | "open";

export async function classifyVaultSlot(
  programId: string,
  strategist: string,
  vaultId: number
): Promise<{ kind: VaultSlotKind; pubkey: string }> {
  const program = new PublicKey(programId);
  const owner = new PublicKey(strategist);
  const pubkey = vaultPda(program, owner, vaultId).toBase58();
  const conn = new Connection(RPC_URL, "confirmed");
  const info = await withRpcRetry(() =>
    conn.getAccountInfo(new PublicKey(pubkey), "confirmed")
  );
  if (!info?.data || info.data.length === 0) {
    return { kind: "missing", pubkey };
  }
  if (info.data.length !== CURRENT_VAULT_ACCOUNT_LEN) {
    return { kind: "legacy", pubkey };
  }
  const status = readVaultStatusCode(new Uint8Array(info.data));
  if (status === 3) return { kind: "closed", pubkey };
  return { kind: "open", pubkey };
}
