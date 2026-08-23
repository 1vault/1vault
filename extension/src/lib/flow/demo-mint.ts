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

async function sendTx(
  conn: Connection,
  tx: Transaction,
  feePayer: PublicKey,
  signers: Keypair[]
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = feePayer;
  tx.sign(...signers);
  const raw = tx.serialize();
  const sig = await conn.sendRawTransaction(raw, { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

export async function ensureDemoTradeMint(opts: {
  rpcUrl: string;
  payer: Keypair;
  vault: string;
  amount: bigint;
  fill?: boolean;
}): Promise<{ mint: string; vaultAta: string; created: boolean; sigs: string[] }> {
  const conn = new Connection(opts.rpcUrl, "confirmed");
  const payerPk = opts.payer.publicKey;
  const vault = new PublicKey(opts.vault);
  const sigs: string[] = [];

  const mint = Keypair.generate();
  const mintPk = mint.publicKey;
  const lamports = await conn.getMinimumBalanceForRentExemption(MINT_SIZE);
  const createTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payerPk,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(mint.publicKey, 6, payerPk, null)
  );
  sigs.push(await sendTx(conn, createTx, payerPk, [opts.payer, mint]));

  const vaultAta = getAssociatedTokenAddressSync(mintPk, vault, true);
  const ataInfo = await conn.getAccountInfo(vaultAta, "confirmed");
  if (!ataInfo) {
    const ataTx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(payerPk, vaultAta, vault, mintPk)
    );
    sigs.push(await sendTx(conn, ataTx, payerPk, [opts.payer]));
  }

  if (opts.fill !== false) {
    const fillTx = new Transaction().add(
      createMintToInstruction(mintPk, vaultAta, payerPk, opts.amount)
    );
    sigs.push(await sendTx(conn, fillTx, payerPk, [opts.payer]));
  }

  return { mint: mintPk.toBase58(), vaultAta: vaultAta.toBase58(), created: true, sigs };
}

export async function mintDemoFill(opts: {
  rpcUrl: string;
  payer: Keypair;
  mint: string;
  vaultAta: string;
  amount: bigint;
}): Promise<string> {
  const conn = new Connection(opts.rpcUrl, "confirmed");
  const payerPk = opts.payer.publicKey;
  const mintPk = new PublicKey(opts.mint);
  const vaultAta = new PublicKey(opts.vaultAta);
  const tx = new Transaction().add(
    createMintToInstruction(mintPk, vaultAta, payerPk, opts.amount)
  );
  return sendTx(conn, tx, payerPk, [opts.payer]);
}
