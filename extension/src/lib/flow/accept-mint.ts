import { Connection } from "@solana/web3.js";
import type { Keypair } from "@solana/web3.js";
import { updateVaultRisk } from "../api/undocumented";
import { signWirePartial } from "../signing";
import { RPC_URL } from "../config";

const WSOL = "So11111111111111111111111111111111111111112";

export async function ensureVaultAcceptsMint(opts: {
  strategistKey: Keypair;
  strategist: string;
  vault: string;
  mint: string;
  priorityFeeMicroLamports?: number;
  computeUnitLimit?: number;
}): Promise<string | undefined> {
  const prep = await updateVaultRisk({
    strategist: opts.strategist,
    vault: opts.vault,
    acceptedMints: [WSOL, opts.mint],
    priorityFeeMicroLamports: opts.priorityFeeMicroLamports ?? 150_000,
    computeUnitLimit: opts.computeUnitLimit ?? 200_000,
  });
  if (!prep?.transaction) return undefined;
  const signed = signWirePartial(prep.transaction, [opts.strategistKey]);
  const conn = new Connection(RPC_URL, "confirmed");
  const raw = Uint8Array.from(atob(signed), (c) => c.charCodeAt(0));
  const sig = await conn.sendRawTransaction(raw, { skipPreflight: false });
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}
