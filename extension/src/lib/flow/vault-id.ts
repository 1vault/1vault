import { Connection, PublicKey } from "@solana/web3.js";
import { listVaults } from "../api/client";
import { getProtocol } from "../api/client";
import { RPC_URL } from "../config";

export async function nextVaultId(strategist: string): Promise<number> {
  const data = await listVaults({ strategist, pageSize: 100 });
  let max = 0;
  for (const v of data.items ?? []) {
    const id = Number(v.vaultId ?? v.vault_id ?? 0);
    if (id > max) max = id;
  }
  let candidate = max + 1;
  try {
    const proto = await getProtocol();
    const programId = proto.programId;
    if (programId) {
      const conn = new Connection(RPC_URL, "confirmed");
      const program = new PublicKey(programId);
      const st = new PublicKey(strategist);
      for (let i = 0; i < 64; i++) {
        const id = candidate + i;
        const idBuf = new Uint8Array(8);
        new DataView(idBuf.buffer).setBigUint64(0, BigInt(id), true);
        const [pda] = PublicKey.findProgramAddressSync(
          [new TextEncoder().encode("vault"), st.toBuffer(), idBuf],
          program
        );
        const info = await conn.getAccountInfo(pda, "confirmed");
        if (!info) return id;
      }
    }
  } catch {
    /* indexer-based id */
  }
  return candidate || 1;
}
