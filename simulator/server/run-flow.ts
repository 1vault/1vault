import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, BN, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  MINT_SIZE,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  createSyncNativeInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import type { NodeUpdate, RetailSettings, SimMode } from "../shared/events";
import { INDEXER_API } from "./env";
import { RpcPool, sleep } from "./rpc";

const PROGRAM_ID = new PublicKey("2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP");
const PROTOCOL_CONFIG = new PublicKey("2WXErzw6DEZsVQ2QD3oTcwumCknpzhLf99akKu7qweQR");
const PLATFORM_MINT = new PublicKey("4R9AHfF2wE8X8252Swra3ncvKVDe3m73k8EfP99zz6YK");
const PLATFORM_WALLET = new PublicKey("9YajdkrkvyzDm57bPSijfy6sFNj9wuqQtYmuYUXZtPDx");
const DEGEN_FEE_WALLET = new PublicKey("EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286");

const PERFORMANCE_FEE_BPS = 2000;
const TRADE = 30_000_000;
const PNL = 50_000_000;
const DEMO_TOKENS = 1_000_000_000n;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDL_CANDIDATES = [
  path.join(ROOT, "idl", "onevault.json"),
  path.resolve(ROOT, "../ProgramID/onevault-program/target/idl/onevault.json"),
];

function loadIdl(): Idl {
  for (const p of IDL_CANDIDATES) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) as Idl;
  }
  throw new Error("onevault IDL not found");
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

function makeProgram(rpc: RpcPool, signer: Keypair, idl: Idl): Program {
  return new Program(
    idl,
    new AnchorProvider(rpc.conn, new Wallet(signer), {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    })
  );
}

async function sendAndPoll(
  rpc: RpcPool,
  tx: Transaction,
  signers: Keypair[]
): Promise<string> {
  if (!tx.instructions.some((ix) => ix.programId.equals(ComputeBudgetProgram.programId))) {
    tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
  }
  const { blockhash } = await rpc.retry((c) => c.getLatestBlockhash("confirmed"));
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const sig = await rpc.retry((c) =>
    c.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 8 })
  );
  for (let i = 0; i < 50; i++) {
    const st = await rpc.retry((c) => c.getSignatureStatuses([sig]));
    const v = st.value[0];
    if (v?.err) {
      const parsed = await rpc
        .retry((c) =>
          c.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" })
        )
        .catch(() => null);
      const logs = parsed?.meta?.logMessages?.slice(-12).join(" | ");
      throw new Error(logs || JSON.stringify(v.err));
    }
    if (v?.confirmationStatus === "confirmed" || v?.confirmationStatus === "finalized") {
      void ingest(sig);
      return sig;
    }
    await sleep(1500);
  }
  throw new Error("confirm timeout " + sig);
}

async function createDemoMint(rpc: RpcPool, payer: Keypair, decimals = 6): Promise<PublicKey> {
  const mint = Keypair.generate();
  const lamports = await rpc.retry((c) => c.getMinimumBalanceForRentExemption(MINT_SIZE));
  const tx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(mint.publicKey, decimals, payer.publicKey, null)
  );
  await sendAndPoll(rpc, tx, [payer, mint]);
  return mint.publicKey;
}

async function mintDemo(
  rpc: RpcPool,
  payer: Keypair,
  mint: PublicKey,
  dest: PublicKey,
  amount: bigint
): Promise<string> {
  const tx = new Transaction().add(createMintToInstruction(mint, dest, payer.publicKey, amount));
  return sendAndPoll(rpc, tx, [payer]);
}

async function ingest(signature: string): Promise<void> {
  try {
    await fetch(`${INDEXER_API}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature }),
    });
  } catch {
    /* indexer optional */
  }
}

async function tokenAmt(rpc: RpcPool, ata: PublicKey): Promise<bigint> {
  try {
    return (await rpc.retry((c) => getAccount(c, ata))).amount;
  } catch {
    return 0n;
  }
}

function explorerTx(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
}

function explorerAddr(addr: string): string {
  return `https://explorer.solana.com/address/${addr}?cluster=devnet`;
}

export type Emit = (update: NodeUpdate) => void;

export type FlowResult = {
  vaultId: number;
  vault: string;
};

function vaultPda(strategist: PublicKey, vaultId: number): PublicKey {
  return pda([Buffer.from("vault"), strategist.toBuffer(), u64Le(vaultId)]);
}

async function findLatestVaultId(rpc: RpcPool, strategist: PublicKey): Promise<number | null> {
  let latest: number | null = null;
  let miss = 0;
  for (let id = 7; id <= 500; id++) {
    const info = await rpc.retry((c) => c.getAccountInfo(vaultPda(strategist, id)));
    if (info) {
      latest = id;
      miss = 0;
      continue;
    }
    miss += 1;
    if (latest !== null && miss >= 2) break;
    if (latest === null && miss >= 8) break;
  }
  return latest;
}

async function nextFreeVaultId(rpc: RpcPool, strategist: PublicKey): Promise<number> {
  const latest = await findLatestVaultId(rpc, strategist);
  let vaultId = latest === null ? 7 : latest + 1;
  let pk = vaultPda(strategist, vaultId);
  while (await rpc.retry((c) => c.getAccountInfo(pk))) {
    vaultId += 1;
    pk = vaultPda(strategist, vaultId);
    if (vaultId > 10_000) throw new Error("could not find free vault id");
  }
  return vaultId;
}

function bnNum(value: { toString(): string } | number | undefined, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const n = Number(value.toString());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function runLiveFlow(opts: {
  rpcUrl: string;
  degen: Keypair;
  retail: Keypair;
  emit: Emit;
  settings?: Partial<RetailSettings>;
  mode?: SimMode;
  vaultId?: number;
}): Promise<FlowResult> {
  const { degen, retail, emit } = opts;
  const mode: SimMode = opts.mode ?? "open-position";
  const autoFollow = opts.settings?.autoFollow ?? true;
  const copyBps = opts.settings?.copyBps ?? 5000;
  const maxPositionBps = opts.settings?.maxPositionBps ?? 5000;
  const followTpSl = opts.settings?.followTpSl ?? true;
  const parkSol = Math.max(0.05, Number(opts.settings?.parkSol ?? 0.1));
  const DEPOSIT = Math.round(parkSol * LAMPORTS_PER_SOL);
  const rpc = new RpcPool(opts.rpcUrl);
  const idl = loadIdl();
  const degenProg = makeProgram(rpc, degen, idl);
  const retailProg = makeProgram(rpc, retail, idl);

  const safeBal = async (pk: PublicKey): Promise<number> => {
    try {
      return await rpc.retry((c) => c.getBalance(pk), 4);
    } catch {
      return -1;
    }
  };

  const degenSol = await safeBal(degen.publicKey);
  const retailSol = await safeBal(retail.publicKey);

  emit({
    id: "degen",
    status: "success",
    detail: "Strategist wallet loaded",
    fields: {
      pubkey: degen.publicKey.toBase58(),
      sol: lamportsToSol(degenSol),
    },
  });
  emit({
    id: "retail",
    status: "success",
    detail: "Investor wallet loaded",
    fields: {
      pubkey: retail.publicKey.toBase58(),
      sol: lamportsToSol(retailSol),
    },
  });

  const beforePlatform = await safeBal(PLATFORM_WALLET);
  const beforeDegenFee = await safeBal(DEGEN_FEE_WALLET);

  emit({
    id: "protocol",
    status: "success",
    detail: "Live Devnet program",
    fields: {
      program: PROGRAM_ID.toBase58(),
      platform: PLATFORM_WALLET.toBase58(),
      degenFee: DEGEN_FEE_WALLET.toBase58(),
      platformSol: lamportsToSol(beforePlatform),
      degenFeeSol: lamportsToSol(beforeDegenFee),
    },
  });

  const minDegen = 0.05;
  if (degenSol < minDegen * LAMPORTS_PER_SOL) {
    throw new Error(`Degen wallet needs at least ${minDegen} SOL on Devnet`);
  }
  if (mode === "create-vault" && retailSol < DEPOSIT + 0.02 * LAMPORTS_PER_SOL) {
    throw new Error(
      `Retail wallet needs at least ${(parkSol + 0.02).toFixed(2)} SOL on Devnet to park funds + fees`
    );
  }
  if (mode === "open-position" && retailSol < 0.02 * LAMPORTS_PER_SOL) {
    throw new Error("Retail wallet needs a little Devnet SOL for fees");
  }

  const strategistAccount = pda([Buffer.from("strategist"), degen.publicKey.toBuffer()]);
  const license = pda([Buffer.from("license"), degen.publicKey.toBuffer()]);
  const strategistAta = getAssociatedTokenAddressSync(PLATFORM_MINT, degen.publicKey);

  if (mode === "open-position") {
    if (!(await rpc.retry((c) => c.getAccountInfo(license)))) {
      emit({
        id: "ata",
        status: "error",
        detail: "License not found — run Create vault first",
      });
      throw new Error("License not found — run Create vault first");
    }
    emit({
      id: "license",
      status: "skipped",
      detail: "License already on-chain — Open position does not create it again",
      fields: { license: "already active", strategistPda: strategistAccount.toBase58() },
    });
  } else {
  emit({ id: "license", status: "running", detail: "Checking strategist + license PDAs" });
  try {
    const fields: Record<string, string> = {
      strategistPda: strategistAccount.toBase58(),
      licensePda: license.toBase58(),
    };
    if (!(await rpc.retry((c) => c.getAccountInfo(strategistAccount)))) {
      const tx = await call(degenProg, "register_strategist", "registerStrategist")()
        .accounts({ strategist: degen.publicKey, protocolConfig: PROTOCOL_CONFIG })
        .transaction();
      const sig = await sendAndPoll(rpc, tx, [degen]);
      fields.registerTx = sig;
      fields.registerExplorer = explorerTx(sig);
    } else {
      fields.register = "already exists";
    }
    if (!(await rpc.retry((c) => c.getAccountInfo(license)))) {
      const tx = await call(degenProg, "lock_license", "lockLicense")()
        .accounts({
          strategist: degen.publicKey,
          protocolConfig: PROTOCOL_CONFIG,
          strategistAccount,
          license,
          strategistTokenAccount: strategistAta,
          platformTokenMint: PLATFORM_MINT,
        })
        .transaction();
      const sig = await sendAndPoll(rpc, tx, [degen]);
      fields.lockTx = sig;
      fields.lockExplorer = explorerTx(sig);
    } else {
      fields.license = "already locked";
    }
    emit({
      id: "license",
      status: fields.lockTx || fields.registerTx ? "success" : "skipped",
      detail: fields.license === "already locked" ? "License already on-chain" : "License locked",
      tx: fields.lockTx ?? fields.registerTx,
      fields,
    });
  } catch (e) {
    emit({
      id: "license",
      status: "error",
      detail: String(e).slice(0, 400),
    });
    throw e;
  }
  }

  let vaultId: number;
  let vaultPk: PublicKey;
  const shareMintFor = (pk: PublicKey) => pda([Buffer.from("share_mint"), pk.toBuffer()]);

  let vault: {
    vaultTokenAccount: PublicKey;
    totalShares: { toString(): string };
    totalAssets: { toString(): string };
    stakedValue: { toString(): string };
    nextTradeId?: { toString(): string };
    nextPositionId?: { toString(): string };
    name: string;
  };

  if (mode === "open-position") {
    const existing = opts.vaultId ?? (await findLatestVaultId(rpc, degen.publicKey));
    if (!existing) {
      emit({
        id: "ata",
        status: "error",
        detail: "No vault yet — run Create vault first",
      });
      throw new Error("No vault yet — run Create vault first");
    }
    vaultId = existing;
    vaultPk = vaultPda(degen.publicKey, vaultId);
    if (!(await rpc.retry((c) => c.getAccountInfo(vaultPk)))) {
      throw new Error(`Vault ${vaultId} not found on Devnet — run Create vault first`);
    }
    vault = await (degenProg.account as any).vault.fetch(vaultPk);
    emit({
      id: "vault",
      status: "success",
      detail: `Using vault #${vaultId} — degen signs, vault capital buys`,
      fields: {
        vaultId: String(vaultId),
        name: vault.name,
        vault: vaultPk.toBase58(),
        shareMint: shareMintFor(vaultPk).toBase58(),
        vaultAta: vault.vaultTokenAccount.toBase58(),
        explorer: explorerAddr(vaultPk.toBase58()),
      },
    });
  } else {
    vaultId = await nextFreeVaultId(rpc, degen.publicKey);
    vaultPk = vaultPda(degen.publicKey, vaultId);
    const vaultName = `Live Demo ${vaultId}`;
    emit({
      id: "vault",
      status: "running",
      detail: `Creating vault id=${vaultId}`,
      fields: { vaultId: String(vaultId), vault: vaultPk.toBase58() },
    });
    try {
      const vaultToken = Keypair.generate();
      const risk = {
        description: "Live presentation vault (wSOL)",
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
      const tx = await call(degenProg, "create_vault", "createVault")(
        new BN(vaultId),
        vaultName,
        PERFORMANCE_FEE_BPS,
        risk
      )
        .accounts({
          strategist: degen.publicKey,
          protocolConfig: PROTOCOL_CONFIG,
          strategistAccount,
          license,
          vault: vaultPk,
          baseMint: NATIVE_MINT,
          vaultTokenAccount: vaultToken.publicKey,
        })
        .signers([vaultToken])
        .transaction();
      const sig = await sendAndPoll(rpc, tx, [degen, vaultToken]);
      vault = await (degenProg.account as any).vault.fetch(vaultPk);
      emit({
        id: "vault",
        status: "success",
        detail: `${vaultName} created on Devnet`,
        tx: sig,
        fields: {
          vaultId: String(vaultId),
          name: vaultName,
          vault: vaultPk.toBase58(),
          shareMint: shareMintFor(vaultPk).toBase58(),
          vaultAta: vault.vaultTokenAccount.toBase58(),
          explorer: explorerAddr(vaultPk.toBase58()),
          tx: explorerTx(sig),
        },
      });
    } catch (e) {
      emit({ id: "vault", status: "error", detail: String(e).slice(0, 400) });
      throw e;
    }
  }
  const shareMint = shareMintFor(vaultPk);

  const retailWsol = getAssociatedTokenAddressSync(NATIVE_MINT, retail.publicKey);
  const retailShares = getAssociatedTokenAddressSync(shareMint, retail.publicKey);
  const degenWsol = getAssociatedTokenAddressSync(NATIVE_MINT, degen.publicKey);
  const investorConfig = pda([
    Buffer.from("investor_config"),
    vaultPk.toBuffer(),
    retail.publicKey.toBuffer(),
  ]);

  const investorConfigInfo = await rpc.retry((c) => c.getAccountInfo(investorConfig));
  if (mode === "open-position" && investorConfigInfo) {
    emit({
      id: "settings",
      status: "skipped",
      detail: `Retail already follows vault #${vaultId} — settings not created again`,
      fields: {
        autoFollow: autoFollow ? "ON" : "OFF",
        copy: `${(copyBps / 100).toFixed(0)}%`,
        maxPos: `${(maxPositionBps / 100).toFixed(0)}%`,
        create: "already exists",
      },
    });
  } else {
  emit({
    id: "settings",
    status: "running",
    detail: "Retail set auto-follow + copy size on-chain",
  });
  try {
    const fields: Record<string, string> = {
      autoFollow: autoFollow ? "ON" : "OFF",
      copy: `${(copyBps / 100).toFixed(0)}%`,
      maxPos: `${(maxPositionBps / 100).toFixed(0)}%`,
    };
    if (!(await rpc.retry((c) => c.getAccountInfo(investorConfig)))) {
      const tx = await call(retailProg, "create_investor_config", "createInvestorConfig")()
        .accounts({
          investor: retail.publicKey,
          protocolConfig: PROTOCOL_CONFIG,
          vault: vaultPk,
          investorConfig,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      fields.createTx = await sendAndPoll(rpc, tx, [retail]);
    } else {
      fields.create = "already exists";
    }
    const params = {
      autoFollow,
      allocationMode: { percentage: {} },
      positionSize: new BN(copyBps),
      maxPositionBps,
      maxExposureBps: 8000,
      maxOpenPositions: 3,
      followDca: false,
      dcaMode: { followStrategist: {} },
      dcaAllocationBps: 0,
      followPartialExit: true,
      followFullExit: true,
      followTpSl,
      maxSlippageBps: 100,
    };
    const upd = await call(retailProg, "update_investor_config", "updateInvestorConfig")(params)
      .accounts({
        investor: retail.publicKey,
        vault: vaultPk,
        investorConfig,
      })
      .transaction();
    const updSig = await sendAndPoll(rpc, upd, [retail]);
    if (autoFollow) {
      const fol = await call(retailProg, "follow_on", "followOn")()
        .accounts({ investor: retail.publicKey, vault: vaultPk, investorConfig })
        .transaction();
      await sendAndPoll(rpc, fol, [retail]);
    }
    emit({
      id: "settings",
      status: "success",
      detail: `Auto-follow ${autoFollow ? "ON" : "OFF"} · copy ${(copyBps / 100).toFixed(0)}%`,
      tx: updSig,
      fields,
    });
  } catch (e) {
    emit({ id: "settings", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }
  }

  const alreadyParked = await tokenAmt(rpc, retailShares);
  if (mode === "open-position" && alreadyParked > 0n) {
    vault = await (degenProg.account as any).vault.fetch(vaultPk);
    emit({
      id: "deposit",
      status: "skipped",
      detail: `Funds already parked in vault #${vaultId} · ${alreadyParked} shares`,
      fields: {
        vaultId: String(vaultId),
        vault: vaultPk.toBase58(),
        amount: "already parked",
        shares: alreadyParked.toString(),
        vaultAssets: lamportsToSol(vault.totalAssets.toString()),
      },
    });
  } else {
  emit({
    id: "deposit",
    status: "running",
    detail: `Parking ${parkSol} SOL in vault #${vaultId}`,
  });
  try {
    if (retailSol < DEPOSIT + 0.02 * LAMPORTS_PER_SOL) {
      throw new Error(
        `Retail wallet needs at least ${(parkSol + 0.02).toFixed(2)} SOL to park funds + fees`
      );
    }
    const setup = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        retail.publicKey,
        retailWsol,
        retail.publicKey,
        NATIVE_MINT
      ),
      SystemProgram.transfer({
        fromPubkey: retail.publicKey,
        toPubkey: retailWsol,
        lamports: DEPOSIT,
      }),
      createSyncNativeInstruction(retailWsol),
      createAssociatedTokenAccountIdempotentInstruction(
        retail.publicKey,
        retailShares,
        retail.publicKey,
        shareMint
      )
    );
    const wrapSig = await sendAndPoll(rpc, setup, [retail]);
    const tx = await call(retailProg, "deposit", "deposit")(new BN(DEPOSIT))
      .accounts({
        investor: retail.publicKey,
        protocolConfig: PROTOCOL_CONFIG,
        vault: vaultPk,
        investorTokenAccount: retailWsol,
        vaultTokenAccount: vault.vaultTokenAccount,
        shareMint,
        investorShareAccount: retailShares,
      })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [retail]);
    const shares = await tokenAmt(rpc, retailShares);
    vault = await (degenProg.account as any).vault.fetch(vaultPk);
    emit({
      id: "deposit",
      status: "success",
      detail: `Parked ${parkSol} wSOL in vault #${vaultId} · ready to auto-follow`,
      tx: sig,
      fields: {
        vaultId: String(vaultId),
        vault: vaultPk.toBase58(),
        wrapTx: explorerTx(wrapSig),
        depositTx: explorerTx(sig),
        amount: `${parkSol.toFixed(3)} SOL`,
        shares: shares.toString(),
        vaultAssets: lamportsToSol(vault.totalAssets.toString()),
      },
    });
  } catch (e) {
    emit({ id: "deposit", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }
  }

  vault = await (degenProg.account as any).vault.fetch(vaultPk);
  const shareAmtNow = await tokenAmt(rpc, retailShares);
  const totalSharesNow = Number(vault.totalShares.toString());
  const totalAssetsNow = Number(vault.totalAssets.toString());
  const parkedLamports =
    shareAmtNow > 0n && totalSharesNow > 0
      ? Math.floor((totalAssetsNow * Number(shareAmtNow)) / totalSharesNow)
      : DEPOSIT;

  if (mode === "create-vault") {
    const afterRetail = await safeBal(retail.publicKey);
    const afterDegen = await safeBal(degen.publicKey);
    emit({
      id: "degen",
      status: "success",
      detail: "Vault created · retail is set up on this vault",
      fields: {
        pubkey: degen.publicKey.toBase58(),
        sol: lamportsToSol(afterDegen),
      },
    });
    emit({
      id: "retail",
      status: "success",
      detail: "Follow settings + parked funds on the new vault",
      fields: {
        pubkey: retail.publicKey.toBase58(),
        sol: lamportsToSol(afterRetail),
      },
    });
    return { vaultId, vault: vaultPk.toBase58() };
  }

  emit({
    id: "ata",
    status: "running",
    detail: "Creating DEMO mint + vault token account",
  });
  let memeMint: PublicKey;
  let vaultMemeAta: PublicKey;
  try {
    memeMint = await createDemoMint(rpc, degen);
    vaultMemeAta = getAssociatedTokenAddressSync(memeMint, vaultPk, true);
    const tx = await call(degenProg, "ensure_vault_token_ata", "ensureVaultTokenAta")()
      .accounts({
        payer: degen.publicKey,
        vault: vaultPk,
        mint: memeMint,
        vaultTokenAccount: vaultMemeAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [degen]);
    emit({
      id: "ata",
      status: "success",
      detail: "DEMO mint ready · vault ATA created",
      tx: sig,
      fields: {
        mint: memeMint.toBase58(),
        vaultAta: vaultMemeAta.toBase58(),
        explorer: explorerAddr(memeMint.toBase58()),
      },
    });
  } catch (e) {
    emit({ id: "ata", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }

  vault = await (degenProg.account as any).vault.fetch(vaultPk);
  const vaultAssets = Number(vault.totalAssets.toString());
  if (vaultAssets < 1_000_000) {
    emit({
      id: "request",
      status: "error",
      detail: `Vault has ${lamportsToSol(vaultAssets)} SOL. Run Create vault first so retail parks funds, then Open position.`,
    });
    throw new Error(
      `Vault has ${lamportsToSol(vaultAssets)} SOL — run Create vault to park funds, then Open position`
    );
  }
  const maxPosBps = Number((vault as { maxPositionBps?: number }).maxPositionBps ?? 5000);
  const maxPos = Math.floor((vaultAssets * maxPosBps) / 10_000);
  const tradeLamports = Math.min(TRADE, Math.max(1_000_000, maxPos || TRADE));
  const tradeId = bnNum(vault.nextTradeId, 1);
  const positionId = bnNum(vault.nextPositionId, 1);
  const vaultRisk = pda([Buffer.from("vault_risk"), vaultPk.toBuffer()]);
  const tradePk = pda([Buffer.from("trade"), vaultPk.toBuffer(), u64Le(tradeId)]);
  const positionPk = pda([Buffer.from("vault_position"), vaultPk.toBuffer(), u64Le(positionId)]);
  const investorPositionPk = pda([
    Buffer.from("investor_position"),
    vaultPk.toBuffer(),
    retail.publicKey.toBuffer(),
    u64Le(positionId),
  ]);

  emit({
    id: "request",
    status: "running",
    detail: `Vault buys DEMO with ${lamportsToSol(tradeLamports)} wSOL from vault capital`,
  });
  try {
    const tx = await call(degenProg, "request_trade", "requestTrade")(
      new BN(tradeId),
      { buy: {} },
      NATIVE_MINT,
      memeMint,
      { fixed: {} },
      new BN(tradeLamports),
      100,
      new BN(0),
      false,
      0,
      2000,
      500,
      new BN(0),
      { dex: {} }
    )
      .accounts({
        strategist: degen.publicKey,
        protocolConfig: PROTOCOL_CONFIG,
        vault: vaultPk,
        license,
        vaultRiskState: vaultRisk,
        tradeRequest: tradePk,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [degen]);
    emit({
      id: "request",
      status: "success",
      detail: `Vault buy requested · ${lamportsToSol(tradeLamports)} SOL from vault ATA`,
      tx: sig,
      fields: {
        tradeId: String(tradeId),
        action: "BUY",
        amount: lamportsToSol(tradeLamports),
        pair: `vault wSOL → DEMO`,
        signer: "degen (access only)",
        capital: "vault",
        tradePda: tradePk.toBase58(),
        explorer: explorerTx(sig),
      },
    });
  } catch (e) {
    emit({ id: "request", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }

  emit({
    id: "execute",
    status: "running",
    detail: "1Vault executes the buy — degen signs, vault pays",
  });
  try {
    const cfg: any = await (degenProg.account as any).protocolConfig.fetch(PROTOCOL_CONFIG);
    const listed = ((cfg.allowedDexPrograms ?? []) as PublicKey[]).filter(
      (pk) => pk && pk.toBase58() !== PublicKey.default.toBase58()
    );
    let dex: PublicKey | undefined;
    for (const pk of listed) {
      const info = await rpc.retry((c) => c.getAccountInfo(pk), 3);
      if (info) {
        dex = pk;
        break;
      }
    }
    dex = dex ?? listed[0];
    if (!dex) {
      throw new Error("No allowlisted DEX on protocol config — cannot execute vault buy");
    }
    await mintDemo(rpc, degen, memeMint, vaultMemeAta, DEMO_TOKENS);
    const tx = await call(degenProg, "execute_trade", "executeTrade")(Buffer.alloc(0))
      .accounts({
        strategist: degen.publicKey,
        protocolConfig: PROTOCOL_CONFIG,
        vault: vaultPk,
        license,
        tradeRequest: tradePk,
        dexProgram: dex,
        vaultInputToken: vault.vaultTokenAccount,
        vaultOutputToken: vaultMemeAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [degen]);
    emit({
      id: "execute",
      status: "success",
      detail: "Vault buy filled · DEMO tokens now sit in the vault",
      tx: sig,
      fields: {
        dex: dex.toBase58(),
        received: "1000 DEMO",
        explorer: explorerTx(sig),
      },
    });
  } catch (e) {
    emit({ id: "execute", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }

  emit({
    id: "openPos",
    status: "running",
    detail: "Vault opens the token position with vault capital",
  });
  try {
    const tx = await call(degenProg, "open_position", "openPosition")(
      new BN(positionId),
      new BN(tradeLamports),
      new BN(DEMO_TOKENS.toString())
    )
      .accounts({
        strategist: degen.publicKey,
        vault: vaultPk,
        tradeRequest: tradePk,
        vaultPosition: positionPk,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [degen]);
    emit({
      id: "openPos",
      status: "success",
      detail: `Vault position #${positionId} open — retail AUM in the vault rides along`,
      tx: sig,
      fields: {
        positionId: String(positionId),
        entry: lamportsToSol(tradeLamports),
        tokens: "1000 DEMO",
        capital: "vault",
        positionPda: positionPk.toBase58(),
        explorer: explorerTx(sig),
      },
    });
  } catch (e) {
    emit({ id: "openPos", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }

  emit({
    id: "mirror",
    status: "running",
    detail: "Auto-follow: retail is already in the vault — no new deposit",
  });
  try {
    if (!autoFollow) {
      emit({
        id: "mirror",
        status: "skipped",
        detail: "Auto-follow is OFF in retail settings",
      });
    } else {
      vault = await (degenProg.account as any).vault.fetch(vaultPk);
      const shareAmt = await tokenAmt(rpc, retailShares);
      const totalShares = Number(vault.totalShares.toString());
      const totalAssets = Number(vault.totalAssets.toString());
      const parked =
        shareAmt > 0n && totalShares > 0
          ? Math.floor((totalAssets * Number(shareAmt)) / totalShares)
          : DEPOSIT;
      const tx = await call(degenProg, "auto_mirror_position", "autoMirrorPosition")(
        new BN(positionId),
        new BN(parked),
        new BN(tradeLamports)
      )
        .accounts({
          payer: degen.publicKey,
          protocolConfig: PROTOCOL_CONFIG,
          vault: vaultPk,
          investor: retail.publicKey,
          investorConfig,
          vaultPosition: positionPk,
          investorPosition: investorPositionPk,
          systemProgram: SystemProgram.programId,
        })
        .transaction();
      const sig = await sendAndPoll(rpc, tx, [degen]);
      const alloc = Math.floor((parked * copyBps) / 10_000);
      emit({
        id: "mirror",
        status: "success",
        detail: `Retail share of the vault buy · ${(copyBps / 100).toFixed(0)}% · no new deposit`,
        tx: sig,
        fields: {
          auto: "ON",
          copy: `${(copyBps / 100).toFixed(0)}%`,
          allocation: lamportsToSol(alloc),
          explorer: explorerTx(sig),
        },
      });
    }
  } catch (e) {
    emit({ id: "mirror", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }

  emit({
    id: "mark",
    status: "running",
    detail: "DEMO pumps · marking position to 0.08 SOL",
  });
  try {
    const tx = await call(degenProg, "update_position_value", "updatePositionValue")(
      new BN(tradeLamports + PNL)
    )
      .accounts({
        strategist: degen.publicKey,
        vault: vaultPk,
        vaultPosition: positionPk,
      })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [degen]);
    emit({
      id: "mark",
      status: "success",
      detail: "Unrealized PnL +0.05 SOL on-chain",
      tx: sig,
      fields: {
        entry: lamportsToSol(tradeLamports),
        mark: lamportsToSol(tradeLamports + PNL),
        unrealized: "+0.050000000 SOL",
        explorer: explorerTx(sig),
      },
    });
  } catch (e) {
    emit({ id: "mark", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }

  emit({
    id: "closePos",
    status: "running",
    detail: "Selling DEMO · realizing 0.05 SOL into vault",
  });
  try {
    if (autoFollow && (await rpc.retry((c) => c.getAccountInfo(investorPositionPk)))) {
      const closeInv = await call(retailProg, "close_investor_position", "closeInvestorPosition")(
        true
      )
        .accounts({
          investor: retail.publicKey,
          vault: vaultPk,
          investorConfig,
          investorPosition: investorPositionPk,
        })
        .transaction();
      await sendAndPoll(rpc, closeInv, [retail]);
    }
    const wrap = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(
        degen.publicKey,
        degenWsol,
        degen.publicKey,
        NATIVE_MINT
      ),
      SystemProgram.transfer({
        fromPubkey: degen.publicKey,
        toPubkey: degenWsol,
        lamports: PNL,
      }),
      createSyncNativeInstruction(degenWsol),
      createTransferInstruction(degenWsol, vault.vaultTokenAccount, degen.publicKey, PNL)
    );
    const injectSig = await sendAndPoll(rpc, wrap, [degen]);
    const closeTx = await call(degenProg, "close_position", "closePosition")(new BN(0))
      .accounts({
        strategist: degen.publicKey,
        vault: vaultPk,
        vaultPosition: positionPk,
        vaultTokenAccount: vault.vaultTokenAccount,
        outputTokenAccount: vault.vaultTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction();
    const closeSig = await sendAndPoll(rpc, closeTx, [degen]);
    const navTx = await call(degenProg, "update_nav", "updateNav")()
      .accounts({ vault: vaultPk, vaultTokenAccount: vault.vaultTokenAccount })
      .transaction();
    const navSig = await sendAndPoll(rpc, navTx, [degen]);
    vault = await (degenProg.account as any).vault.fetch(vaultPk);
    emit({
      id: "closePos",
      status: "success",
      detail: "Position closed · +0.05 SOL realized in vault ATA",
      tx: closeSig,
      fields: {
        proceeds: "0.050000000 SOL",
        vaultAssets: lamportsToSol(vault.totalAssets.toString()),
        injectTx: explorerTx(injectSig),
        closeTx: explorerTx(closeSig),
        navTx: explorerTx(navSig),
      },
    });
  } catch (e) {
    emit({ id: "closePos", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }

  const unwrapPlatform = pda([
    Buffer.from("fee_unwrap"),
    vaultPk.toBuffer(),
    PLATFORM_WALLET.toBuffer(),
  ]);
  const unwrapDegen = pda([
    Buffer.from("fee_unwrap"),
    vaultPk.toBuffer(),
    DEGEN_FEE_WALLET.toBuffer(),
  ]);

  emit({
    id: "withdraw",
    status: "running",
    detail: "Retail exit first — degen fee is based on this exit amount",
  });

  let degenFeeLamports = 0;
  let protocolFeeLamports = 0;
  let accrueSig = "";
  try {
    const clearTx = await call(degenProg, "update_vault_staked_value", "updateVaultStakedValue")(
      new BN(0)
    )
      .accounts({ strategist: degen.publicKey, vault: vaultPk })
      .transaction();
    await sendAndPoll(rpc, clearTx, [degen]);
    vault = await (degenProg.account as any).vault.fetch(vaultPk);
    const navTx = await call(degenProg, "update_nav", "updateNav")()
      .accounts({ vault: vaultPk, vaultTokenAccount: vault.vaultTokenAccount })
      .transaction();
    await sendAndPoll(rpc, navTx, [degen]);

    const accrueTx = await call(degenProg, "accrue_fees", "accrueFees")()
      .accounts({ protocolConfig: PROTOCOL_CONFIG, vault: vaultPk, staker: null })
      .transaction();
    accrueSig = await sendAndPoll(rpc, accrueTx, [degen]);
    const feeState: any = await (degenProg.account as any).vaultFeeState.fetch(
      pda([Buffer.from("vault_fee"), vaultPk.toBuffer()])
    );
    const accruedDegen = Number(feeState.accruedPerformanceFees?.toString?.() ?? 0);
    const claimedDegen = Number(feeState.claimedPerformanceFees?.toString?.() ?? 0);
    const accruedProto = Number(feeState.accruedProtocolFees?.toString?.() ?? 0);
    const claimedProto = Number(feeState.claimedProtocolFees?.toString?.() ?? 0);
    degenFeeLamports = Math.max(0, accruedDegen - claimedDegen);
    protocolFeeLamports = Math.max(0, accruedProto - claimedProto);

    vault = await (degenProg.account as any).vault.fetch(vaultPk);
    const sharesHeld = await tokenAmt(rpc, retailShares);
    const nav =
      Number(vault.totalAssets.toString()) +
      Number((vault as { positionValue?: { toString(): string } }).positionValue?.toString?.() ?? 0) +
      Number(vault.stakedValue?.toString?.() ?? 0);
    const totalShares = Number(vault.totalShares.toString());
    const feeReserve = degenFeeLamports + protocolFeeLamports + 20_000;
    const withdrawableNav = Math.max(0, nav - feeReserve);
    const sharesToBurn =
      sharesHeld > 0n && nav > 0 && totalShares > 0
        ? BigInt(Math.floor((Number(sharesHeld) * withdrawableNav) / nav))
        : 0n;
    if (sharesToBurn <= 0n) {
      throw new Error("Retail has no shares to exit — park funds with Create vault first");
    }
    const gross = Math.floor((Number(sharesToBurn) * nav) / totalShares);
    const exitFeeLamports = Math.floor((gross * 50) / 10_000);
    const netLamports = gross - exitFeeLamports;
    const parkedForExit =
      sharesHeld > 0n
        ? Math.floor((parkedLamports * Number(sharesToBurn)) / Number(sharesHeld))
        : parkedLamports;
    const profitLamports = netLamports - parkedForExit;
    const platformFeeLamports = protocolFeeLamports + exitFeeLamports;
    const treasuryAta = pda([Buffer.from("treasury"), NATIVE_MINT.toBuffer()]);
    const tx = await call(retailProg, "withdraw", "withdraw")(new BN(sharesToBurn.toString()))
      .accounts({
        investor: retail.publicKey,
        protocolConfig: PROTOCOL_CONFIG,
        vault: vaultPk,
        investorShareAccount: retailShares,
        investorTokenAccount: retailWsol,
        vaultTokenAccount: vault.vaultTokenAccount,
        shareMint,
        treasuryTokenAccount: treasuryAta,
        platformWallet: PLATFORM_WALLET,
        unwrapPlatform,
        nativeMint: NATIVE_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
        staker: null,
        referralAccount: null,
      })
      .transaction();
    const sig = await sendAndPoll(rpc, tx, [retail]);
    emit({
      id: "withdraw",
      status: "success",
      detail: `Exit ${lamportsToSol(gross)} · profit ${lamportsToSol(profitLamports)} · degen fee from this exit ${lamportsToSol(degenFeeLamports)}`,
      tx: sig,
      fields: {
        explorer: explorerTx(sig),
        sharesBurned: sharesToBurn.toString(),
        parked: `${lamportsToSol(parkedForExit)} SOL`,
        profit: `${profitLamports >= 0 ? "+" : ""}${lamportsToSol(profitLamports)} SOL`,
        platformFee: `${lamportsToSol(platformFeeLamports)} SOL`,
        degenFee: `${lamportsToSol(degenFeeLamports)} SOL`,
        netReceived: `${lamportsToSol(netLamports)} SOL`,
        exitFee: "50 bps",
      },
    });
  } catch (e) {
    emit({ id: "withdraw", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }

  emit({
    id: "accrue",
    status: "running",
    detail: "Fee from that exit amount — then pay degen",
  });
  emit({
    id: "accrue",
    status: "success",
    detail: `Fee from that exit · degen ${lamportsToSol(degenFeeLamports)} · protocol ${lamportsToSol(protocolFeeLamports)}`,
    tx: accrueSig,
    fields: {
      explorer: explorerTx(accrueSig),
      degenAccrued: lamportsToSol(degenFeeLamports),
      protocolAccrued: lamportsToSol(protocolFeeLamports),
    },
  });

  emit({
    id: "claim",
    status: "running",
    detail: "Retail has exited — now pay degen + platform from that exit",
  });
  try {
    vault = await (degenProg.account as any).vault.fetch(vaultPk);
    const claimTx = await call(degenProg, "claim_fees", "claimFees")()
      .accounts({
        strategist: degen.publicKey,
        protocolConfig: PROTOCOL_CONFIG,
        vault: vaultPk,
        vaultTokenAccount: vault.vaultTokenAccount,
        platformWallet: PLATFORM_WALLET,
        degenWallet: DEGEN_FEE_WALLET,
        unwrapPlatform,
        unwrapDegen,
        nativeMint: NATIVE_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .transaction();
    const claimSig = await sendAndPoll(rpc, claimTx, [degen]);
    const afterPlatform = await safeBal(PLATFORM_WALLET);
    const afterDegenFee = await safeBal(DEGEN_FEE_WALLET);
    const afterRetail = await safeBal(retail.publicKey);
    const afterDegen = await safeBal(degen.publicKey);
    emit({
      id: "claim",
      status: "success",
      detail: "Degen and platform received native SOL after retail exit",
      tx: claimSig,
      fields: {
        explorer: explorerTx(claimSig),
        platformDelta: lamportsToSol(afterPlatform - beforePlatform),
        degenFeeDelta: lamportsToSol(afterDegenFee - beforeDegenFee),
      },
    });
    emit({
      id: "platform",
      status: "success",
      detail: "Platform wallet native SOL after retail exit",
      fields: {
        wallet: PLATFORM_WALLET.toBase58(),
        before: lamportsToSol(beforePlatform),
        after: lamportsToSol(afterPlatform),
        delta: lamportsToSol(afterPlatform - beforePlatform),
        explorer: explorerAddr(PLATFORM_WALLET.toBase58()),
      },
    });
    emit({
      id: "degenFee",
      status: "success",
      detail: "Degen fee wallet native SOL after retail exit",
      fields: {
        wallet: DEGEN_FEE_WALLET.toBase58(),
        before: lamportsToSol(beforeDegenFee),
        after: lamportsToSol(afterDegenFee),
        delta: lamportsToSol(afterDegenFee - beforeDegenFee),
        explorer: explorerAddr(DEGEN_FEE_WALLET.toBase58()),
      },
    });
    emit({
      id: "degen",
      status: "success",
      detail: "Strategist wallet after flow",
      fields: {
        pubkey: degen.publicKey.toBase58(),
        sol: lamportsToSol(afterDegen),
      },
    });
    emit({
      id: "retail",
      status: "success",
      detail: "Investor wallet after flow",
      fields: {
        pubkey: retail.publicKey.toBase58(),
        sol: lamportsToSol(afterRetail),
      },
    });
  } catch (e) {
    emit({ id: "claim", status: "error", detail: String(e).slice(0, 400) });
    throw e;
  }
  return { vaultId, vault: vaultPk.toBase58() };
}
