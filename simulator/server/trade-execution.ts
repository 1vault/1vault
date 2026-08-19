import { PublicKey, type AccountMeta, type TransactionInstruction } from "@solana/web3.js";
import type { Cluster, TradeExecution } from "./cluster";

export type VaultSwapPlan =
  | {
      mode: "demo";
      /** Presentation fill on Devnet when the target mint has no Jupiter route. */
      mintToVault: true;
    }
  | {
      mode: "live";
      dexProgram: PublicKey;
      swapData: Buffer;
      remainingAccounts: AccountMeta[];
    };

const JUPITER_V6 = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");

/**
 * Build the CPI payload for `execute_trade`.
 *
 * Mainnet always uses a live Jupiter (or allowlisted DEX) swap so vault wSOL
 * actually leaves the pool. Devnet presentation falls back to a demo mint when
 * `TRADE_EXECUTION=demo` (default on Devnet) because random mints have no books.
 *
 * Flip `CLUSTER=mainnet-beta` and `TRADE_EXECUTION=live` — this function is the
 * only branch that changes. Do not add a second execute path.
 */
export async function planVaultSwap(opts: {
  cluster: Cluster;
  execution: TradeExecution;
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  slippageBps: number;
  vault: PublicKey;
  vaultInputAta: PublicKey;
  vaultOutputAta: PublicKey;
}): Promise<VaultSwapPlan> {
  if (opts.execution === "live" || opts.cluster === "mainnet-beta") {
    return planJupiterSwap(opts);
  }
  return { mode: "demo", mintToVault: true };
}

async function planJupiterSwap(opts: {
  inputMint: PublicKey;
  outputMint: PublicKey;
  amount: bigint;
  slippageBps: number;
  vault: PublicKey;
  vaultInputAta: PublicKey;
  vaultOutputAta: PublicKey;
}): Promise<VaultSwapPlan> {
  const quoteUrl =
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${opts.inputMint.toBase58()}` +
    `&outputMint=${opts.outputMint.toBase58()}&amount=${opts.amount.toString()}` +
    `&slippageBps=${opts.slippageBps}&swapMode=ExactIn`;

  const quoteRes = await fetch(quoteUrl);
  if (!quoteRes.ok) {
    throw new Error(`Jupiter quote failed (${quoteRes.status}) — set TRADE_EXECUTION=demo on Devnet`);
  }
  const quote = await quoteRes.json();

  const swapRes = await fetch("https://lite-api.jup.ag/swap/v1/swap-instructions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: opts.vault.toBase58(),
      wrapAndUnwrapSol: false,
      useSharedAccounts: true,
    }),
  });
  if (!swapRes.ok) {
    throw new Error(`Jupiter swap-instructions failed (${swapRes.status})`);
  }
  const swap = (await swapRes.json()) as {
    swapInstruction?: {
      programId: string;
      accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
      data: string;
    };
  };
  const ix = swap.swapInstruction;
  if (!ix) {
    throw new Error("Jupiter did not return a swapInstruction");
  }

  const dexProgram = new PublicKey(ix.programId);
  if (!dexProgram.equals(JUPITER_V6) && !dexProgram.equals(new PublicKey(ix.programId))) {
    throw new Error(`Unexpected swap program ${ix.programId}`);
  }

  return {
    mode: "live",
    dexProgram,
    swapData: Buffer.from(ix.data, "base64"),
    remainingAccounts: ix.accounts.map((a) => ({
      pubkey: new PublicKey(a.pubkey),
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
  };
}

/** Reserved for wiring a TransactionInstruction into execute_trade remaining accounts. */
export function asRemaining(ix: TransactionInstruction): AccountMeta[] {
  return ix.keys;
}
