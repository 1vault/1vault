/**
 * Forward already-claimed degen wSOL as native SOL to EXQCB3...
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  createInitializeAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { RPC_URL } from "./rpc";
import { FEE_WALLETS } from "./constants";

const DEGEN = FEE_WALLETS.degenSol;
const CLAIMED_PERF = 9_500_000;
const TOKEN_ACCOUNT_RENT = 2_039_280;

function loadKeypair(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[])
  );
}

async function main() {
  const payer = loadKeypair();
  const connection = new Connection(RPC_URL, { commitment: "confirmed" });
  const src = getAssociatedTokenAddressSync(NATIVE_MINT, payer.publicKey);
  const unwrap = Keypair.generate();

  const before = await connection.getBalance(DEGEN, "confirmed");
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: unwrap.publicKey,
      space: 165,
      lamports: TOKEN_ACCOUNT_RENT,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(
      unwrap.publicKey,
      NATIVE_MINT,
      payer.publicKey
    ),
    createTransferInstruction(src, unwrap.publicKey, payer.publicKey, CLAIMED_PERF),
    createCloseAccountInstruction(unwrap.publicKey, DEGEN, payer.publicKey)
  );
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer, unwrap);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 8,
  });
  for (let i = 0; i < 40; i++) {
    const st = await connection.getSignatureStatuses([sig]);
    const v = st.value[0];
    if (v?.err) throw new Error(JSON.stringify(v.err));
    if (
      v?.confirmationStatus === "confirmed" ||
      v?.confirmationStatus === "finalized"
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  const after = await connection.getBalance(DEGEN, "confirmed");
  console.log("degen wallet", DEGEN.toBase58());
  console.log("before SOL", (before / LAMPORTS_PER_SOL).toFixed(9));
  console.log("after  SOL", (after / LAMPORTS_PER_SOL).toFixed(9));
  console.log("delta      ", ((after - before) / LAMPORTS_PER_SOL).toFixed(9));
  console.log("tx", sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
