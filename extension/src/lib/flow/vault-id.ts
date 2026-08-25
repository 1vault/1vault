import { Connection, PublicKey } from "@solana/web3.js";
import { getProtocol, getStrategist, listVaults } from "../api/client";
import { RPC_URL } from "../config";

function maxVaultId(rows: Array<Record<string, unknown>> | undefined): number {
  let max = 0;
  for (const v of rows ?? []) {
    const id = Number(v.vaultId ?? v.vault_id ?? 0);
    if (Number.isFinite(id) && id > max) max = id;
  }
  return max;
}

function vaultPda(program: PublicKey, strategist: PublicKey, id: number): PublicKey {
  const idBuf = new Uint8Array(8);
  new DataView(idBuf.buffer).setBigUint64(0, BigInt(id), true);
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("vault"), strategist.toBuffer(), idBuf],
    program
  );
  return pda;
}

/** Next unused on-chain vault id for this strategist (never global list max). */
export async function nextVaultId(strategist: string): Promise<number> {
  const [strat, listed] = await Promise.all([
    getStrategist(strategist).catch(() => ({ vaults: [] as Array<Record<string, unknown>> })),
    listVaults({ strategist, pageSize: 100 }).catch(() => ({ items: [] as Array<Record<string, unknown>> })),
  ]);

  let max = Math.max(maxVaultId(strat.vaults), maxVaultId(listed.items));
  // Ignore foreign rows if listVaults is unscoped.
  for (const v of listed.items ?? []) {
    const owner = String(v.strategist ?? "");
    if (owner && owner !== strategist) continue;
    const id = Number(v.vaultId ?? v.vault_id ?? 0);
    if (Number.isFinite(id) && id > max) max = id;
  }
  for (const v of strat.vaults ?? []) {
    const id = Number(v.vaultId ?? v.vault_id ?? 0);
    if (Number.isFinite(id) && id > max) max = id;
  }

  let candidate = max + 1 || 1;
  try {
    const proto = await getProtocol();
    const programId = proto.programId;
    if (programId) {
      const conn = new Connection(RPC_URL, "confirmed");
      const program = new PublicKey(programId);
      const st = new PublicKey(strategist);
      const ids = Array.from({ length: 64 }, (_, i) => candidate + i);
      const pdas = ids.map((id) => vaultPda(program, st, id));
      // One RPC round-trip instead of up to 64 sequential getAccountInfo calls.
      const infos = await conn.getMultipleAccountsInfo(pdas, "confirmed");
      for (let i = 0; i < infos.length; i++) {
        if (!infos[i]) return ids[i]!;
      }
    }
  } catch {
    /* indexer-based id */
  }
  return candidate;
}
