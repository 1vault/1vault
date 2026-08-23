import { parseSecretKey, signWirePartial } from "./keys";

const WSOL = "So11111111111111111111111111111111111111112";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const cluster = import.meta.env.VITE_CLUSTER ?? "devnet";
  const res = await fetch(`${path}?cluster=${cluster}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json = (await res.json()) as { success: boolean; data?: T; error?: { message?: string } };
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  return json.data as T;
}

export async function ensureVaultAcceptsMint(opts: {
  cluster: string;
  rpcUrl: string;
  strategist: string;
  strategistKey: import("@solana/web3.js").Keypair | null;
  walletPubkeys: Set<string>;
  vault: string;
  mint: string;
  priorityFeeMicroLamports?: number;
  computeUnitLimit?: number;
}): Promise<string | undefined> {
  const qs = `?cluster=${encodeURIComponent(opts.cluster)}`;
  const prep = await api<{ transaction: string }>(`/v1/tx/update-vault-risk${qs}`, {
    method: "POST",
    body: JSON.stringify({
      strategist: opts.strategist,
      vault: opts.vault,
      acceptedMints: [WSOL, opts.mint],
      priorityFeeMicroLamports: opts.priorityFeeMicroLamports ?? 150_000,
      computeUnitLimit: opts.computeUnitLimit ?? 200_000,
    }),
  });
  if (!prep?.transaction) return undefined;
  if (!opts.strategistKey) {
    const { signWithExternalWallet } = await import("./keys");
    const signed = await signWithExternalWallet(prep.transaction, opts.strategist);
    const { Connection } = await import("@solana/web3.js");
    const conn = new Connection(opts.rpcUrl, "confirmed");
    const raw = Uint8Array.from(atob(signed), (c) => c.charCodeAt(0));
    const sig = await conn.sendRawTransaction(raw, { skipPreflight: false });
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
    return sig;
  }
  const signed = signWirePartial(prep.transaction, [opts.strategistKey]);
  const { Connection } = await import("@solana/web3.js");
  const conn = new Connection(opts.rpcUrl, "confirmed");
  const raw = Uint8Array.from(atob(signed), (c) => c.charCodeAt(0));
  const sig = await conn.sendRawTransaction(raw, { skipPreflight: false });
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

export { parseSecretKey };
