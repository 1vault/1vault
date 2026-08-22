import {
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

type SolanaWallet = {
  publicKey?: { toBase58(): string };
  signTransaction(tx: Transaction): Promise<Transaction>;
};

function getInjectedWallet(): SolanaWallet | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    solana?: SolanaWallet & { isPhantom?: boolean };
    solflare?: SolanaWallet;
  };
  if (w.solana?.isPhantom) return w.solana;
  if (w.solflare) return w.solflare;
  return w.solana ?? null;
}

async function sendTx(
  conn: Connection,
  tx: Transaction,
  feePayer: PublicKey,
  localSigners: Keypair[],
  useWallet: boolean
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = feePayer;

  let raw: Uint8Array;
  if (useWallet) {
    const wallet = getInjectedWallet();
    if (!wallet?.signTransaction) throw new Error("Phantom/Solflare not connected");
    // Local co-signers first (e.g. fresh mint keypair), then wallet.
    if (localSigners.length) tx.partialSign(...localSigners);
    const signed = await wallet.signTransaction(tx);
    raw = signed.serialize();
  } else {
    tx.sign(...localSigners);
    raw = tx.serialize();
  }

  const sig = await conn.sendRawTransaction(raw, { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

/**
 * Devnet presentation helper (mirrors original simulator):
 * create DEMO mint → vault ATA → mint tokens for empty-swap execute_trade fill.
 */
export async function ensureDemoTradeMint(opts: {
  rpcUrl: string;
  payer: Keypair | null;
  payerPubkey: string;
  vault: string;
  amount: bigint;
  existingMint?: string;
  /** When false, only create mint + vault ATA (fill right before execute_trade). */
  fill?: boolean;
}): Promise<{ mint: string; vaultAta: string; created: boolean; sigs: string[] }> {
  const conn = new Connection(opts.rpcUrl, "confirmed");
  const payerPk = new PublicKey(opts.payerPubkey);
  const vault = new PublicKey(opts.vault);
  const useWallet = !opts.payer;
  const local: Keypair[] = opts.payer ? [opts.payer] : [];
  const sigs: string[] = [];

  let mintPk: PublicKey;
  let created = false;

  if (opts.existingMint?.trim()) {
    mintPk = new PublicKey(opts.existingMint.trim());
  } else {
    const mint = Keypair.generate();
    mintPk = mint.publicKey;
    created = true;
    const lamports = await conn.getMinimumBalanceForRentExemption(MINT_SIZE);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: payerPk,
        newAccountPubkey: mint.publicKey,
        space: MINT_SIZE,
        lamports,
        programId: TOKEN_PROGRAM_ID,
      }),
      createInitializeMint2Instruction(mint.publicKey, 6, payerPk, null)
    );
    sigs.push(await sendTx(conn, tx, payerPk, [...local, mint], useWallet));
  }

  const vaultAta = getAssociatedTokenAddressSync(mintPk, vault, true);
  const ataInfo = await conn.getAccountInfo(vaultAta, "confirmed");
  if (!ataInfo) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(payerPk, vaultAta, vault, mintPk)
    );
    sigs.push(await sendTx(conn, tx, payerPk, local, useWallet));
  }

  // Demo fill: mint output tokens into the vault ATA immediately before execute_trade.
  const shouldFill = opts.fill !== false;
  if (shouldFill) {
    const tx = new Transaction().add(
      createMintToInstruction(mintPk, vaultAta, payerPk, opts.amount)
    );
    try {
      sigs.push(await sendTx(conn, tx, payerPk, local, useWallet));
    } catch (e) {
      if (!opts.existingMint) throw e;
      // Env mint may not be under this payer — rely on whatever balance already exists.
    }
  }

  return {
    mint: mintPk.toBase58(),
    vaultAta: vaultAta.toBase58(),
    created,
    sigs,
  };
}

/** Mint demo output tokens into vault ATA (call immediately before execute_trade). */
export async function mintDemoFill(opts: {
  rpcUrl: string;
  payer: Keypair | null;
  payerPubkey: string;
  mint: string;
  vaultAta: string;
  amount: bigint;
}): Promise<string> {
  const conn = new Connection(opts.rpcUrl, "confirmed");
  const payerPk = new PublicKey(opts.payerPubkey);
  const mintPk = new PublicKey(opts.mint);
  const vaultAta = new PublicKey(opts.vaultAta);
  const useWallet = !opts.payer;
  const local: Keypair[] = opts.payer ? [opts.payer] : [];
  const tx = new Transaction().add(
    createMintToInstruction(mintPk, vaultAta, payerPk, opts.amount)
  );
  return sendTx(conn, tx, payerPk, local, useWallet);
}
