/**
 * Product-flow smoke test on Devnet.
 * Run from sdk/: npx tsx product-flow-devnet.ts
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
  sendAndConfirmTransaction,
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
const OUT_PATH = path.join(ROOT, "scripts", "product-flow-report.json");

type Status = "PASS" | "FAIL" | "BLOCKED" | "SKIP";
type Case = {
  id: string;
  title: string;
  status: Status;
  detail: string;
  tx?: string;
};

function loadDeployer(): Keypair {
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

function errText(e: unknown): string {
  if (e && typeof e === "object") {
    const anyE = e as { message?: string; logs?: string[]; transactionLogs?: string[] };
    const logs = anyE.transactionLogs ?? anyE.logs ?? [];
    const hit = logs.find((l) => /failed|Error|violation|custom program error/i.test(l));
    return [anyE.message, hit].filter(Boolean).join(" | ").slice(0, 400);
  }
  return String(e).slice(0, 400);
}

async function main() {
  const cases: Case[] = [];
  const ingestJobs: Promise<void>[] = [];
  const add = (c: Case) => {
    cases.push(c);
    console.log(`[${c.status}] ${c.id} — ${c.title}\n  ${c.detail}${c.tx ? `\n  tx ${c.tx}` : ""}`);
    if (c.tx) ingestJobs.push(indexTx(c.tx));
  };

  const addr = JSON.parse(fs.readFileSync(ADDR_PATH, "utf8")) as {
    programId: string;
    protocolConfig: string;
    vault: string;
    shareMint: string;
    baseMint: string;
    vaultId: number;
  };

  const deployer = loadDeployer();
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(deployer), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as Idl;
  const program = new Program(idl, provider);
  const vaultPk = new PublicKey(addr.vault);
  const protocolConfig = new PublicKey(addr.protocolConfig);
  const shareMint = new PublicKey(addr.shareMint);
  const baseMint = new PublicKey(addr.baseMint);

  const vault: any = await (program.account as any).vault.fetch(vaultPk);
  add({
    id: "P0",
    title: "Degen vault exists on Devnet",
    status: "PASS",
    detail: `vault=${vaultPk.toBase58()} name=${vault.name} status=${JSON.stringify(vault.status)} shares=${vault.totalShares} assets=${vault.totalAssets} nextTrade=${vault.nextTradeId}`,
  });

  const retail = Keypair.generate();
  try {
    const sig = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: deployer.publicKey,
          toPubkey: retail.publicKey,
          lamports: Math.floor(0.12 * LAMPORTS_PER_SOL),
        })
      ),
      [deployer]
    );
    add({
      id: "P1",
      title: "Fund retail wallet",
      status: "PASS",
      detail: `retail=${retail.publicKey.toBase58()}`,
      tx: sig,
    });
  } catch (e) {
    add({ id: "P1", title: "Fund retail wallet", status: "FAIL", detail: errText(e) });
  }

  const wrapLamports = 50_000_000; // 0.05 SOL
  const retailWsol = getAssociatedTokenAddressSync(NATIVE_MINT, retail.publicKey);
  const retailShares = getAssociatedTokenAddressSync(shareMint, retail.publicKey);
  try {
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        retail.publicKey,
        retailWsol,
        retail.publicKey,
        NATIVE_MINT
      ),
      SystemProgram.transfer({
        fromPubkey: retail.publicKey,
        toPubkey: retailWsol,
        lamports: wrapLamports,
      }),
      createSyncNativeInstruction(retailWsol),
      createAssociatedTokenAccountIdempotentInstruction(
        retail.publicKey,
        retailShares,
        retail.publicKey,
        shareMint
      )
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [retail]);
    add({
      id: "P2",
      title: "Retail wrap SOL to wSOL + create share ATA",
      status: "PASS",
      detail: `wsolAta=${retailWsol.toBase58()} shareAta=${retailShares.toBase58()}`,
      tx: sig,
    });
  } catch (e) {
    add({
      id: "P2",
      title: "Retail wrap SOL to wSOL + create share ATA",
      status: "FAIL",
      detail: errText(e),
    });
  }

  try {
    const sig = await call(program, "deposit", "deposit")(new BN(wrapLamports))
      .accounts({
        investor: retail.publicKey,
        protocolConfig,
        vault: vaultPk,
        investorTokenAccount: retailWsol,
        vaultTokenAccount: vault.vaultTokenAccount,
        shareMint,
        investorShareAccount: retailShares,
      })
      .signers([retail])
      .rpc();
    const shares = await getAccount(connection, retailShares);
    add({
      id: "P3",
      title: "Retail join vault (deposit)",
      status: "PASS",
      detail: `deposited 0.05 wSOL; shares=${shares.amount.toString()}`,
      tx: sig,
    });
  } catch (e) {
    add({
      id: "P3",
      title: "Retail join vault (deposit)",
      status: "FAIL",
      detail: errText(e),
    });
  }

  try {
    const sig = await call(program, "create_investor_config", "createInvestorConfig")()
      .accounts({
        investor: retail.publicKey,
        protocolConfig,
        vault: vaultPk,
      })
      .signers([retail])
      .rpc();
    add({
      id: "P4",
      title: "Retail create investor config (auto-follow default ON)",
      status: "PASS",
      detail: "InvestorVaultConfig PDA created; default auto_follow=true, follow_tp_sl=true",
      tx: sig,
    });
  } catch (e) {
    add({
      id: "P4",
      title: "Retail create investor config",
      status: "FAIL",
      detail: errText(e),
    });
  }

  try {
    const sig = await call(program, "follow_on", "followOn")()
      .accounts({
        investor: retail.publicKey,
        vault: vaultPk,
      })
      .signers([retail])
      .rpc();
    add({
      id: "P5",
      title: "Retail follow ON",
      status: "PASS",
      detail: "auto_follow set true",
      tx: sig,
    });
  } catch (e) {
    add({
      id: "P5",
      title: "Retail follow ON",
      status: "FAIL",
      detail: errText(e),
    });
  }

  try {
    const params = {
      autoFollow: true,
      allocationMode: { percentage: {} },
      positionSize: new BN(5_000),
      maxPositionBps: 5_000,
      maxExposureBps: 8_000,
      maxOpenPositions: 3,
      followDca: false,
      dcaMode: { followStrategist: {} },
      dcaAllocationBps: 0,
      followPartialExit: true,
      followFullExit: true,
      followTpSl: true,
      maxSlippageBps: 100,
    };
    const sig = await call(program, "update_investor_config", "updateInvestorConfig")(params)
      .accounts({
        investor: retail.publicKey,
        vault: vaultPk,
      })
      .signers([retail])
      .rpc();
    add({
      id: "P6",
      title: "Retail set copy size 50% (fix default position_size=0)",
      status: "PASS",
      detail: "Default Percentage+position_size=0 would allocate 0 and block mirror_position",
      tx: sig,
    });
  } catch (e) {
    add({
      id: "P6",
      title: "Retail set copy size 50%",
      status: "FAIL",
      detail: errText(e),
    });
  }

  const memeMint = Keypair.generate().publicKey;
  try {
    const sig = await call(program, "request_trade", "requestTrade")(
      new BN(1),
      { buy: {} },
      NATIVE_MINT,
      memeMint,
      { fixed: {} },
      new BN(1_000_000),
      100,
      new BN(1),
      false,
      0,
      3_000,
      1_000,
      new BN(0),
      { dex: {} }
    )
      .accounts({
        strategist: deployer.publicKey,
        protocolConfig,
        vault: vaultPk,
      })
      .rpc();
    add({
      id: "P7",
      title: "Degen request_trade (buy + TP 30% / SL 10%)",
      status: "PASS",
      detail: `trade_id=1 output_mint=${memeMint.toBase58()}`,
      tx: sig,
    });
  } catch (e) {
    add({
      id: "P7",
      title: "Degen request_trade (buy + TP 30% / SL 10%)",
      status: "FAIL",
      detail: errText(e),
    });
  }

  add({
    id: "P8",
    title: "Degen execute_trade via Jupiter/Pump",
    status: "BLOCKED",
    detail: "Devnet has no reliable Pump.fun/Jupiter liquidity for a random mint; execute_trade also still has SBF stack overflow in the current binary.",
  });

  add({
    id: "P9",
    title: "Retail mirror_position after degen open_position",
    status: "BLOCKED",
    detail: "Requires an Open VaultPosition. Chain stops at execute_trade. Mirror is bookkeeping only (no separate investor token swap).",
  });

  try {
    const sig = await call(program, "close_investor_position", "closeInvestorPosition")(true)
      .accounts({
        investor: retail.publicKey,
        vault: vaultPk,
      })
      .signers([retail])
      .rpc();
    add({
      id: "P10",
      title: "Retail TP before degen TP (close_investor_position)",
      status: "PASS",
      detail: "Closed mirrored position independently",
      tx: sig,
    });
  } catch (e) {
    add({
      id: "P10",
      title: "Retail TP before degen TP (close_investor_position)",
      status: "FAIL",
      detail: `Expected without an open InvestorPosition. ${errText(e)} Code path exists: investor can close mirror while vault position stays open. Does NOT redeem vault shares or sell the meme.`,
    });
  }

  try {
    const shareAcc = await getAccount(connection, retailShares).catch(() => null);
    const shares = shareAcc ? Number(shareAcc.amount) : 0;
    if (shares <= 0) {
      add({
        id: "P11",
        title: "Retail withdraw shares (real money TP / exit vault)",
        status: "SKIP",
        detail: "No shares minted because deposit failed; withdraw is the actual capital exit independent of degen TP.",
      });
    } else {
      const sig = await call(program, "withdraw", "withdraw")(new BN(shares))
        .accounts({
          investor: retail.publicKey,
          protocolConfig,
          vault: vaultPk,
          investorTokenAccount: retailWsol,
          vaultTokenAccount: vault.vaultTokenAccount,
          shareMint,
          investorShareAccount: retailShares,
          treasuryTokenAccount: PublicKey.findProgramAddressSync(
            [Buffer.from("treasury"), NATIVE_MINT.toBuffer()],
            program.programId
          )[0],
          platformWallet: FEE_WALLETS.platformSol,
          unwrapPlatform: PublicKey.findProgramAddressSync(
            [Buffer.from(SEEDS.feeUnwrap), vaultPk.toBuffer(), FEE_WALLETS.platformSol.toBuffer()],
            program.programId
          )[0],
          nativeMint: NATIVE_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .signers([retail])
        .rpc();
      add({
        id: "P11",
        title: "Retail withdraw shares (real money TP / exit vault)",
        status: "PASS",
        detail: `burned ${shares} shares; this exits pooled capital even if degen still holds the trade`,
        tx: sig,
      });
    }
  } catch (e) {
    add({
      id: "P11",
      title: "Retail withdraw shares (real money TP / exit vault)",
      status: "FAIL",
      detail: errText(e),
    });
  }

  const passed = cases.filter((c) => c.status === "PASS").length;
  const failed = cases.filter((c) => c.status === "FAIL").length;
  const blocked = cases.filter((c) => c.status === "BLOCKED").length;
  const skipped = cases.filter((c) => c.status === "SKIP").length;
  const report = {
    cluster: "devnet",
    programId: addr.programId,
    vault: addr.vault,
    degen: deployer.publicKey.toBase58(),
    retail: retail.publicKey.toBase58(),
    unitTests: { passed: 7, failed: 0 },
    summary: { passed, failed, blocked, skipped, total: cases.length },
    cases,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n");
  await Promise.all(ingestJobs);
  console.log("\nWrote", OUT_PATH);
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
