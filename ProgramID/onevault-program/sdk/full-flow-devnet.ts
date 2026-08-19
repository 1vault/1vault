/**
 * Full Devnet simulation: new vault → deposit → PnL → accrue/claim fees → withdraw.
 * claim_fees unwraps wSOL to native SOL on platform + degen wallets.
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
import {
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { FEE_WALLETS, SEEDS } from "./constants";
import { indexTx } from "./index-tx";
import { RPC_URL } from "./rpc";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDL_PATH = path.join(ROOT, "target", "idl", "onevault.json");
const ADDR_PATH = path.join(ROOT, "scripts", "devnet-addresses.json");
const OUT_ADDR = path.join(ROOT, "scripts", "flow-test-addresses.json");
const OUT_REPORT = path.join(ROOT, "scripts", "full-flow-report.json");

const PROGRAM_ID = new PublicKey("2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP");
const VAULT_ID = 6;
const VAULT_NAME = "SOL Fee Vault";
const PERFORMANCE_FEE_BPS = 2000;
const DEPOSIT = 100_000_000;
const PNL = 50_000_000;

const RPCS = [RPC_URL];

type Step = {
  id: string;
  title: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail: string;
  tx?: string;
};

function loadKeypair(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[])
  );
}

function pda(seeds: (Buffer | Uint8Array)[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

function u64Le(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function lamportsToSol(n: bigint | number | string): string {
  return (Number(n) / LAMPORTS_PER_SOL).toFixed(9);
}

function call(program: Program, snake: string, camel: string) {
  const methods = program.methods as Record<string, (...args: unknown[]) => any>;
  const fn = methods[camel] ?? methods[snake];
  if (!fn) throw new Error(`Missing ${camel}`);
  return fn;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(msg: string): boolean {
  return /429|403|fetch failed|timed out|timeout|EAI_AGAIN|503/i.test(msg);
}

class RpcPool {
  private i = 0;
  conn: Connection;
  constructor() {
    this.conn = new Connection(RPCS[0], "confirmed");
    console.log("RPC", RPCS[0]);
  }
  rotate(reason: string): void {
    this.i = (this.i + 1) % RPCS.length;
    this.conn = new Connection(RPCS[this.i], "confirmed");
    console.warn("rotate RPC →", RPCS[this.i], reason.slice(0, 80));
  }
  async retry<T>(fn: (c: Connection) => Promise<T>, attempts = 10): Promise<T> {
    let delay = 2000;
    for (let n = 0; n < attempts; n++) {
      try {
        return await fn(this.conn);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (n === attempts - 1 || !isRetryable(msg)) throw err;
        if (/403/.test(msg) && RPCS[this.i].includes("phantom")) {
          this.rotate(msg);
        } else if (/429/.test(msg)) {
          await sleep(delay);
          delay = Math.min(delay * 2, 20000);
        } else {
          this.rotate(msg);
          await sleep(delay);
        }
      }
    }
    throw new Error("rpc exhausted");
  }
}

async function sendAndPoll(
  rpc: RpcPool,
  tx: Transaction,
  signers: Keypair[]
): Promise<string> {
  const { blockhash } = await rpc.retry((c) => c.getLatestBlockhash("confirmed"));
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const sig = await rpc.retry((c) =>
    c.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 8 })
  );
  for (let i = 0; i < 50; i++) {
    const st = await rpc.retry((c) => c.getSignatureStatuses([sig]));
    const v = st.value[0];
    if (v?.err) throw new Error(JSON.stringify(v.err));
    if (v?.confirmationStatus === "confirmed" || v?.confirmationStatus === "finalized") {
      await indexTx(sig);
      return sig;
    }
    await sleep(1500);
  }
  throw new Error("confirm timeout " + sig);
}

async function tokenAmt(rpc: RpcPool, ata: PublicKey): Promise<bigint> {
  try {
    return (await rpc.retry((c) => getAccount(c, ata))).amount;
  } catch {
    return 0n;
  }
}

async function main() {
  const steps: Step[] = [];
  const add = (s: Step) => {
    steps.push(s);
    console.log(`[${s.status}] ${s.id} ${s.title}\n  ${s.detail}${s.tx ? `\n  ${s.tx}` : ""}`);
  };

  const base = JSON.parse(fs.readFileSync(ADDR_PATH, "utf8"));
  const payer = loadKeypair();
  const rpc = new RpcPool();
  const program = new Program(
    JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as Idl,
    new AnchorProvider(rpc.conn, new Wallet(payer), {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    })
  );

  const protocolConfig = new PublicKey(base.protocolConfig);
  const platformMint = new PublicKey(base.onevaultMint);
  const strategistAta = new PublicKey(base.onevaultAta);
  const strategistAccount = pda([Buffer.from("strategist"), payer.publicKey.toBuffer()]);
  const license = pda([Buffer.from("license"), payer.publicKey.toBuffer()]);
  const vaultPk = pda([Buffer.from("vault"), payer.publicKey.toBuffer(), u64Le(VAULT_ID)]);
  const shareMint = pda([Buffer.from("share_mint"), vaultPk.toBuffer()]);
  const treasuryAta = pda([Buffer.from("treasury"), NATIVE_MINT.toBuffer()]);
  const investorWsol = getAssociatedTokenAddressSync(NATIVE_MINT, payer.publicKey);
  const investorShares = getAssociatedTokenAddressSync(shareMint, payer.publicKey);

  console.log("using Helius Devnet RPC");

  const safeBal = async (pk: PublicKey): Promise<number> => {
    try {
      return await rpc.retry((c) => c.getBalance(pk), 3);
    } catch {
      return -1;
    }
  };

  const beforePlatformSol = await safeBal(FEE_WALLETS.platformSol);
  const beforeDegenSol = await safeBal(FEE_WALLETS.degenSol);
  const beforeTreasuryWsol = await tokenAmt(rpc, treasuryAta);
  const beforeStratWsol = await tokenAmt(rpc, investorWsol);

  try {
    if (!(await rpc.retry((c) => c.getAccountInfo(strategistAccount)))) {
      const tx = await call(program, "register_strategist", "registerStrategist")()
        .accounts({ strategist: payer.publicKey, protocolConfig })
        .transaction();
      const sig = await sendAndPoll(rpc, tx, [payer]);
      add({ id: "S1", title: "register_strategist", status: "PASS", detail: payer.publicKey.toBase58(), tx: sig });
    } else {
      add({ id: "S1", title: "register_strategist", status: "SKIP", detail: "already exists" });
    }
  } catch (e) {
    add({ id: "S1", title: "register_strategist", status: "FAIL", detail: String(e).slice(0, 300) });
  }

  try {
    if (!(await rpc.retry((c) => c.getAccountInfo(license)))) {
      const tx = await call(program, "lock_license", "lockLicense")()
        .accounts({
          strategist: payer.publicKey,
          protocolConfig,
          strategistAccount,
          license,
          strategistTokenAccount: strategistAta,
          platformTokenMint: platformMint,
        })
        .transaction();
      const sig = await sendAndPoll(rpc, tx, [payer]);
      add({ id: "S2", title: "lock_license", status: "PASS", detail: license.toBase58(), tx: sig });
    } else {
      add({ id: "S2", title: "lock_license", status: "SKIP", detail: "already exists" });
    }
  } catch (e) {
    add({ id: "S2", title: "lock_license", status: "FAIL", detail: String(e).slice(0, 300) });
  }

  try {
    if (await rpc.retry((c) => c.getAccountInfo(vaultPk))) {
      add({ id: "S3", title: "create_vault", status: "SKIP", detail: `exists ${vaultPk.toBase58()}` });
    } else {
      const vaultToken = Keypair.generate();
      const risk = {
        description: "Full-flow test vault (wSOL)",
        strategyType: { custom: {} },
        maxPositionBps: 5000,
        maxExposureBps: 8000,
        maxOpenPositions: 3,
        maxSlippageBps: 100,
        mevMode: { standard: {} },
        dcaEnabled: false,
        dcaCount: 0,
        dcaAllocationBps: 0,
        acceptedMints: [NATIVE_MINT],
        yieldStrategy: { none: {} },
      };
      const tx = await call(program, "create_vault", "createVault")(
        new BN(VAULT_ID),
        VAULT_NAME,
        PERFORMANCE_FEE_BPS,
        risk
      )
        .accounts({
          strategist: payer.publicKey,
          protocolConfig,
          strategistAccount,
          license,
          vault: vaultPk,
          baseMint: NATIVE_MINT,
          vaultTokenAccount: vaultToken.publicKey,
          strategistLicenseTokens: strategistAta,
          platformTokenMint: platformMint,
          vaultLicenseVault: pda([Buffer.from("vault_license"), vaultPk.toBuffer()]),
        })
        .signers([vaultToken])
        .transaction();
      const sig = await sendAndPoll(rpc, tx, [payer, vaultToken]);
      add({
        id: "S3",
        title: "create_vault",
        status: "PASS",
        detail: `${VAULT_NAME} id=${VAULT_ID} ${vaultPk.toBase58()} token=${vaultToken.publicKey.toBase58()}`,
        tx: sig,
      });
    }
  } catch (e) {
    add({ id: "S3", title: "create_vault", status: "FAIL", detail: String(e).slice(0, 400) });
  }

  let vault: any;
  try {
    vault = await (program.account as any).vault.fetch(vaultPk);
    add({
      id: "S4",
      title: "fetch vault",
      status: "PASS",
      detail: `name=${vault.name} shares=${vault.totalShares} assets=${vault.totalAssets}`,
    });
  } catch (e) {
    add({ id: "S4", title: "fetch vault", status: "FAIL", detail: String(e).slice(0, 300) });
  }

  const exitOnly = process.argv.includes("--exit-only");
  if (exitOnly) {
    add({ id: "S5", title: "wrap wSOL + share ATA", status: "SKIP", detail: "--exit-only" });
    add({ id: "S6", title: "deposit 0.10 wSOL", status: "SKIP", detail: "--exit-only" });
    add({ id: "S7", title: "inject PnL", status: "SKIP", detail: "--exit-only" });
    add({ id: "S8", title: "update_vault_staked_value", status: "SKIP", detail: "--exit-only" });
    add({ id: "S9", title: "accrue_fees", status: "SKIP", detail: "--exit-only" });
    add({ id: "S10", title: "claim_fees", status: "SKIP", detail: "--exit-only" });
  }

  if (!exitOnly) {
  try {
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
        lamports: DEPOSIT + PNL,
      }),
      createSyncNativeInstruction(investorWsol),
      createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        investorShares,
        payer.publicKey,
        shareMint
      )
    );
    const sig = await sendAndPoll(rpc, setup, [payer]);
    add({ id: "S5", title: "wrap wSOL + share ATA", status: "PASS", detail: "0.15 wSOL", tx: sig });
  } catch (e) {
    add({ id: "S5", title: "wrap wSOL + share ATA", status: "FAIL", detail: String(e).slice(0, 300) });
  }

  try {
    const tx = await call(program, "deposit", "deposit")(new BN(DEPOSIT))
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
    const sig = await sendAndPoll(rpc, tx, [payer]);
    const shares = await tokenAmt(rpc, investorShares);
    add({ id: "S6", title: "deposit 0.10 wSOL", status: "PASS", detail: `shares=${shares}`, tx: sig });
  } catch (e) {
    add({ id: "S6", title: "deposit 0.10 wSOL", status: "FAIL", detail: String(e).slice(0, 400) });
  }

  try {
    const tx = new Transaction().add(
      createTransferInstruction(investorWsol, vault.vaultTokenAccount, payer.publicKey, PNL)
    );
    const sig = await sendAndPoll(rpc, tx, [payer]);
    add({ id: "S7", title: "inject 0.05 wSOL PnL into vault ATA", status: "PASS", detail: "real tokens", tx: sig });
  } catch (e) {
    add({ id: "S7", title: "inject PnL", status: "FAIL", detail: String(e).slice(0, 300) });
  }

  try {
    const tx = await call(program, "update_vault_staked_value", "updateVaultStakedValue")(new BN(PNL))
      .accounts({ strategist: payer.publicKey, vault: vaultPk })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [payer]);
    add({ id: "S8", title: "update_vault_staked_value 0.05", status: "PASS", detail: "NAV +0.05 without raising HWM in this ix", tx: sig });
  } catch (e) {
    add({ id: "S8", title: "update_vault_staked_value", status: "FAIL", detail: String(e).slice(0, 300) });
  }

  try {
    const tx = await call(program, "accrue_fees", "accrueFees")()
      .accounts({ protocolConfig, vault: vaultPk, staker: null })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [payer]);
    const feeState: any = await (program.account as any).vaultFeeState.fetch(
      pda([Buffer.from("vault_fee"), vaultPk.toBuffer()])
    );
    add({
      id: "S9",
      title: "accrue_fees",
      status: "PASS",
      detail: `degen=${lamportsToSol(feeState.accruedPerformanceFees)} protocol=${lamportsToSol(feeState.accruedProtocolFees)}`,
      tx: sig,
    });
  } catch (e) {
    add({ id: "S9", title: "accrue_fees", status: "FAIL", detail: String(e).slice(0, 400) });
  }

  try {
    const unwrapPlatform = pda([
      Buffer.from(SEEDS.feeUnwrap),
      vaultPk.toBuffer(),
      FEE_WALLETS.platformSol.toBuffer(),
    ]);
    const unwrapDegen = pda([
      Buffer.from(SEEDS.feeUnwrap),
      vaultPk.toBuffer(),
      FEE_WALLETS.degenSol.toBuffer(),
    ]);
    const tx = await call(program, "claim_fees", "claimFees")()
      .accounts({
        strategist: payer.publicKey,
        protocolConfig,
        vault: vaultPk,
        vaultTokenAccount: vault.vaultTokenAccount,
        platformWallet: FEE_WALLETS.platformSol,
        degenWallet: FEE_WALLETS.degenSol,
        unwrapPlatform,
        unwrapDegen,
        nativeMint: NATIVE_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [payer]);
    add({
      id: "S10",
      title: "claim_fees",
      status: "PASS",
      detail: "native SOL → platform + degen wallets",
      tx: sig,
    });
  } catch (e) {
    add({ id: "S10", title: "claim_fees", status: "FAIL", detail: String(e).slice(0, 400) });
  }
  }

  // Live withdraw subtracts NAV from total_assets. NAV includes staked_value, so
  // leave staked_value set and withdraw MathOverflows. Clear it, then sync ATA.
  try {
    const tx = await call(program, "update_vault_staked_value", "updateVaultStakedValue")(new BN(0))
      .accounts({ strategist: payer.publicKey, vault: vaultPk })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [payer]);
    add({
      id: "S10b",
      title: "clear staked_value",
      status: "PASS",
      detail: "set 0 so NAV can match vault ATA",
      tx: sig,
    });
  } catch (e) {
    add({ id: "S10b", title: "clear staked_value", status: "FAIL", detail: String(e).slice(0, 300) });
  }

  try {
    const tx = await call(program, "update_nav", "updateNav")()
      .accounts({ vault: vaultPk, vaultTokenAccount: vault.vaultTokenAccount })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [payer]);
    vault = await (program.account as any).vault.fetch(vaultPk);
    add({
      id: "S10c",
      title: "update_nav",
      status: "PASS",
      detail: `assets=${vault.totalAssets} staked=${vault.stakedValue}`,
      tx: sig,
    });
  } catch (e) {
    add({ id: "S10c", title: "update_nav", status: "FAIL", detail: String(e).slice(0, 300) });
  }

  try {
    const shares = await tokenAmt(rpc, investorShares);
    if (shares === 0n) {
      add({ id: "S11", title: "withdraw (exit)", status: "SKIP", detail: "no shares" });
    } else {
      const tx = await call(program, "withdraw", "withdraw")(new BN(shares.toString()))
        .accounts({
          investor: payer.publicKey,
          protocolConfig,
          vault: vaultPk,
          investorShareAccount: investorShares,
          investorTokenAccount: investorWsol,
          vaultTokenAccount: vault.vaultTokenAccount,
          shareMint,
          treasuryTokenAccount: treasuryAta,
          platformWallet: FEE_WALLETS.platformSol,
          unwrapPlatform: pda([
            Buffer.from(SEEDS.feeUnwrap),
            vaultPk.toBuffer(),
            FEE_WALLETS.platformSol.toBuffer(),
          ]),
          nativeMint: NATIVE_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
          staker: null,
          referralAccount: null,
        })
        .transaction();
      const sig = await sendAndPoll(rpc, tx, [payer]);
      add({ id: "S11", title: "withdraw (exit)", status: "PASS", detail: `burned ${shares} shares`, tx: sig });
    }
  } catch (e) {
    add({ id: "S11", title: "withdraw (exit)", status: "FAIL", detail: String(e).slice(0, 400) });
  }

  const afterPlatformSol = await safeBal(FEE_WALLETS.platformSol);
  const afterDegenSol = await safeBal(FEE_WALLETS.degenSol);
  const afterTreasuryWsol = await tokenAmt(rpc, treasuryAta);
  const afterStratWsol = await tokenAmt(rpc, investorWsol);

  const addrs = {
    cluster: "devnet",
    programId: PROGRAM_ID.toBase58(),
    vaultId: VAULT_ID,
    vaultName: VAULT_NAME,
    vault: vaultPk.toBase58(),
    shareMint: shareMint.toBase58(),
    vaultExplorer: `https://explorer.solana.com/address/${vaultPk.toBase58()}?cluster=devnet`,
    protocolConfig: protocolConfig.toBase58(),
    treasuryPda: treasuryAta.toBase58(),
    platformWalletRequested: FEE_WALLETS.platformSol.toBase58(),
    degenWalletRequested: FEE_WALLETS.degenSol.toBase58(),
    degenFeeActual: payer.publicKey.toBase58(),
  };
  fs.writeFileSync(OUT_ADDR, JSON.stringify(addrs, null, 2) + "\n");

  const passed = steps.filter((s) => s.status === "PASS").length;
  const failed = steps.filter((s) => s.status === "FAIL").length;
  const skipped = steps.filter((s) => s.status === "SKIP").length;
  const report = {
    ranAt: new Date().toISOString(),
    ...addrs,
    summary: { passed, failed, skipped, total: steps.length },
    fees: {
      note: "claim_fees unwraps wSOL to native SOL on platform + degen wallets.",
      requested: {
        platformSolWallet: FEE_WALLETS.platformSol.toBase58(),
        degenSolWallet: FEE_WALLETS.degenSol.toBase58(),
        platformSolBefore: lamportsToSol(beforePlatformSol),
        platformSolAfter: lamportsToSol(afterPlatformSol),
        platformSolDelta: lamportsToSol(afterPlatformSol - beforePlatformSol),
        degenSolBefore: lamportsToSol(beforeDegenSol),
        degenSolAfter: lamportsToSol(afterDegenSol),
        degenSolDelta: lamportsToSol(afterDegenSol - beforeDegenSol),
      },
      actual: {
        treasuryPda: treasuryAta.toBase58(),
        treasuryWsolBefore: lamportsToSol(beforeTreasuryWsol),
        treasuryWsolAfter: lamportsToSol(afterTreasuryWsol),
        treasuryWsolDelta: lamportsToSol(afterTreasuryWsol - beforeTreasuryWsol),
        strategistWsolAta: investorWsol.toBase58(),
        strategistWsolBefore: lamportsToSol(beforeStratWsol),
        strategistWsolAfter: lamportsToSol(afterStratWsol),
        strategistWsolDelta: lamportsToSol(afterStratWsol - beforeStratWsol),
      },
    },
    steps,
  };
  fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2) + "\n");
  console.log("\nWrote", OUT_ADDR);
  console.log("Wrote", OUT_REPORT);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log("NEW VAULT", vaultPk.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
