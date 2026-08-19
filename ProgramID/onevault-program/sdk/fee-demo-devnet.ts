/**
 * Demo: deposit → simulated PnL → accrue/claim fees → withdraw.
 * Uses HTTP polling (public Devnet WS is rate-limited).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, BN, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import { RPC_URL } from "./rpc";
import { FEE_WALLETS, SEEDS } from "./constants";
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { indexTx } from "./index-tx";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDL_PATH = path.join(ROOT, "target", "idl", "onevault.json");
const ADDR_PATH = path.join(ROOT, "scripts", "devnet-addresses.json");

function loadKeypair(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[])
  );
}

function call(program: Program, snake: string, camel: string) {
  const methods = program.methods as Record<string, (...args: unknown[]) => any>;
  const fn = methods[camel] ?? methods[snake];
  if (!fn) throw new Error(`Missing ${camel}`);
  return fn;
}

function lamportsToSol(n: bigint | number | string): string {
  return (Number(n) / LAMPORTS_PER_SOL).toFixed(9);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function withRpcRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let delay = 400;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (i === attempts - 1 || !/fetch failed|429|timed out|timeout/i.test(msg)) {
        throw err;
      }
      await sleep(delay);
      delay *= 2;
    }
  }
  throw new Error("rpc retry exhausted");
}

async function sendAndPoll(
  connection: Connection,
  tx: Transaction,
  signers: Keypair[]
): Promise<string> {
  const { blockhash } = await withRpcRetry(() =>
    connection.getLatestBlockhash("confirmed")
  );
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const sig = await withRpcRetry(() =>
    connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 8,
    })
  );
  for (let i = 0; i < 45; i++) {
    const st = await withRpcRetry(() => connection.getSignatureStatuses([sig]));
    const v = st.value[0];
    if (v?.err) throw new Error(JSON.stringify(v.err));
    if (
      v &&
      (v.confirmationStatus === "confirmed" ||
        v.confirmationStatus === "finalized")
    ) {
      await indexTx(sig);
      return sig;
    }
    await sleep(1500);
  }
  throw new Error("confirm timeout " + sig);
}

async function tokenAmt(connection: Connection, ata: PublicKey): Promise<bigint> {
  try {
    return (await getAccount(connection, ata)).amount;
  } catch {
    return 0n;
  }
}

async function main() {
  const addr = JSON.parse(fs.readFileSync(ADDR_PATH, "utf8"));
  const payer = loadKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const program = new Program(
    JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as Idl,
    new AnchorProvider(connection, new Wallet(payer), {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    })
  );

  const vaultPk = new PublicKey(addr.vault);
  const protocolConfig = new PublicKey(addr.protocolConfig);
  const shareMint = new PublicKey(addr.shareMint);
  const vault: any = await (program.account as any).vault.fetch(vaultPk);
  const treasuryAta = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury"), NATIVE_MINT.toBuffer()],
    program.programId
  )[0];
  const investorWsol = getAssociatedTokenAddressSync(NATIVE_MINT, payer.publicKey);
  const investorShares = getAssociatedTokenAddressSync(shareMint, payer.publicKey);

  const depositLamports = 100_000_000;
  const pnlLamports = 50_000_000;

  console.log("vault", vaultPk.toBase58());
  console.log("treasury_pda", treasuryAta.toBase58());
  console.log("degen/investor", payer.publicKey.toBase58());

  const beforeTreasury = await tokenAmt(connection, treasuryAta);
  const beforeDegen = await tokenAmt(connection, investorWsol);
  console.log("before treasury wSOL", lamportsToSol(beforeTreasury));
  console.log("before degen wSOL", lamportsToSol(beforeDegen));

  const sharesNow = await tokenAmt(connection, investorShares);
  if (sharesNow === 0n) {
    const setup = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        investorWsol,
        payer.publicKey,
        NATIVE_MINT
      ),
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: investorWsol,
        lamports: depositLamports + pnlLamports,
      }),
      createSyncNativeInstruction(investorWsol),
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        investorShares,
        payer.publicKey,
        shareMint
      )
    );
    console.log("wrap", await sendAndPoll(connection, setup, [payer]));

    const depTx = await call(program, "deposit", "deposit")(new BN(depositLamports))
      .accounts({
        investor: payer.publicKey,
        protocolConfig,
        vault: vaultPk,
        investorTokenAccount: investorWsol,
        vaultTokenAccount: vault.vaultTokenAccount,
        shareMint,
        investorShareAccount: investorShares,
      })
      .transaction();
    console.log("deposit", await sendAndPoll(connection, depTx, [payer]));
  } else {
    console.log("skip wrap/deposit, existing shares", sharesNow.toString());
  }

  const vaultAfterDep: any = await (program.account as any).vault.fetch(vaultPk);

  const accrueTx = await call(program, "accrue_fees", "accrueFees")()
    .accounts({
      protocolConfig,
      vault: vaultPk,
      vaultFeeState: PublicKey.findProgramAddressSync(
        [Buffer.from("vault_fee"), vaultPk.toBuffer()],
        program.programId
      )[0],
    })
    .transaction();
  console.log("accrue_fees", await sendAndPoll(connection, accrueTx, [payer]));

  const feeState: any = await (program.account as any).vaultFeeState.fetch(
    PublicKey.findProgramAddressSync(
      [Buffer.from("vault_fee"), vaultPk.toBuffer()],
      program.programId
    )[0]
  );
  console.log(
    "accrued degen",
    lamportsToSol(feeState.accruedPerformanceFees.toString())
  );

  const claimable = BigInt(feeState.accruedPerformanceFees.toString());
  if (claimable > 0n) {
    const unwrapDegen = PublicKey.findProgramAddressSync(
      [Buffer.from(SEEDS.feeUnwrap), vaultPk.toBuffer(), FEE_WALLETS.degenSol.toBuffer()],
      program.programId
    )[0];
    const claimTx = await call(program, "claim_fees", "claimFees")()
      .accounts({
        strategist: payer.publicKey,
        protocolConfig,
        vault: vaultPk,
        vaultTokenAccount: vault.vaultTokenAccount,
        degenWallet: FEE_WALLETS.degenSol,
        unwrapDegen,
        nativeMint: NATIVE_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .transaction();
    console.log("claim_fees", await sendAndPoll(connection, claimTx, [payer]));
  } else {
    console.log("claim_fees skipped (nothing accrued)");
  }

  const midTreasury = await tokenAmt(connection, treasuryAta);
  console.log(
    "after claim treasury",
    lamportsToSol(midTreasury),
    "delta",
    lamportsToSol(midTreasury - beforeTreasury)
  );

  const shares = (await getAccount(connection, investorShares)).amount;
  const wdTx = await call(program, "withdraw", "withdraw")(new BN(shares.toString()))
    .accounts({
      investor: payer.publicKey,
      protocolConfig,
      vault: vaultPk,
      investorShareAccount: investorShares,
      investorTokenAccount: investorWsol,
      vaultTokenAccount: vault.vaultTokenAccount,
      shareMint,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction();
  console.log("withdraw", await sendAndPoll(connection, wdTx, [payer]));

  const afterPlatform = await connection.getBalance(FEE_WALLETS.platformSol);
  const afterDegen = await connection.getBalance(FEE_WALLETS.degenSol);
  console.log("\n=== FEE CHECK (native SOL) ===");
  console.log("platform", FEE_WALLETS.platformSol.toBase58(), lamportsToSol(afterPlatform));
  console.log("degen   ", FEE_WALLETS.degenSol.toBase58(), lamportsToSol(afterDegen));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
