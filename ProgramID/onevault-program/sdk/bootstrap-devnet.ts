/**
 * Devnet bootstrap: test 1VAULT mint + initialize_protocol + treasuries.
 * Run from sdk/: npm run bootstrap:devnet
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AnchorProvider,
  BN,
  Program,
  Wallet,
  type Idl,
} from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { RPC_URL } from "./rpc";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDL_PATH = path.join(ROOT, "target", "idl", "onevault.json");
const OUT_PATH = path.join(ROOT, "scripts", "devnet-addresses.json");

const PROGRAM_ID = new PublicKey(
  "2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP"
);
const USDC_DEVNET = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
const JUPITER_V6 = new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
const RAYDIUM_AMM_V4 = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);
const ORCA_WHIRLPOOL = new PublicKey(
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"
);

const DECIMALS = 6;
const LICENSE_LOCK_AMOUNT = new BN("1000000000000"); // 1M 1vault Licence (6 decimals)
const TEST_MINT_AMOUNT = 10_000_000n * 1_000_000n; // 10M tokens

function loadKeypair(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function protocolConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("protocol")],
    programId
  )[0];
}

function method(program: Program, snake: string, camel: string) {
  const methods = program.methods as Record<string, unknown>;
  const fn = methods[camel] ?? methods[snake];
  if (typeof fn !== "function") {
    throw new Error(`Missing method ${camel} / ${snake}`);
  }
  return fn as (...args: unknown[]) => {
    accounts: (a: Record<string, PublicKey>) => {
      rpc: () => Promise<string>;
    };
  };
}

async function main() {
  const payer = loadKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const wallet = new Wallet(payer);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as Idl;
  const program = new Program(idl, provider);
  const protocolConfig = protocolConfigPda(PROGRAM_ID);

  console.log("Deployer:", payer.publicKey.toBase58());
  console.log("Program: ", PROGRAM_ID.toBase58());
  console.log("Protocol PDA:", protocolConfig.toBase58());

  let mintPk: PublicKey;
  const existing = fs.existsSync(OUT_PATH)
    ? (JSON.parse(fs.readFileSync(OUT_PATH, "utf8")) as {
        onevaultMint?: string;
      })
    : {};
  if (existing.onevaultMint) {
    mintPk = new PublicKey(existing.onevaultMint);
    console.log("Reusing 1VAULT test mint:", mintPk.toBase58());
  } else {
    mintPk = await createMint(
      connection,
      payer,
      payer.publicKey,
      payer.publicKey,
      DECIMALS
    );
    console.log("Created 1VAULT test mint:", mintPk.toBase58());
  }

  const ata = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mintPk,
    payer.publicKey
  );
  if (ata.amount < TEST_MINT_AMOUNT) {
    const sig = await mintTo(
      connection,
      payer,
      mintPk,
      ata.address,
      payer,
      TEST_MINT_AMOUNT - ata.amount
    );
    console.log("Minted test 1VAULT:", sig);
  }

  const protocolInfo = await connection.getAccountInfo(protocolConfig);
  let needsInit = !protocolInfo;
  if (protocolInfo) {
    try {
      await (program.account as any).protocolConfig.fetch(protocolConfig);
      console.log("initialize_protocol: MVP config already valid, skip");
    } catch {
      console.log("Legacy protocol config detected — closing for MVP re-init...");
      const closeSig = await method(
        program,
        "close_legacy_protocol_config",
        "closeLegacyProtocolConfig"
      )()
        .accounts({
          authority: payer.publicKey,
          protocolConfig,
        })
        .rpc();
      console.log("close_legacy_protocol_config:", closeSig);
      needsInit = true;
    }
  }
  if (needsInit) {
    const sig = await method(
      program,
      "initialize_protocol",
      "initializeProtocol"
    )(
      payer.publicKey,
      mintPk,
      LICENSE_LOCK_AMOUNT,
      2000,
      [JUPITER_V6, RAYDIUM_AMM_V4, ORCA_WHIRLPOOL]
    )
      .accounts({
        authority: payer.publicKey,
        protocolConfig,
      })
      .rpc();
    console.log("initialize_protocol:", sig);
  }

  const treasuryMints = [
    { name: "USDC", mint: USDC_DEVNET },
    { name: "wSOL", mint: WSOL },
  ];
  for (const { name, mint } of treasuryMints) {
    const [treasuryAta] = PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), mint.toBuffer()],
      PROGRAM_ID
    );
    const info = await connection.getAccountInfo(treasuryAta);
    if (info) {
      console.log(`initialize_treasury ${name}: already exists, skip`);
      continue;
    }
    const sig = await method(
      program,
      "initialize_treasury",
      "initializeTreasury"
    )()
      .accounts({
        authority: payer.publicKey,
        protocolConfig,
        mint,
      })
      .rpc();
    console.log(`initialize_treasury ${name}:`, sig);
  }

  const out = {
    cluster: "devnet",
    programId: PROGRAM_ID.toBase58(),
    authority: payer.publicKey.toBase58(),
    treasury: payer.publicKey.toBase58(),
    protocolConfig: protocolConfig.toBase58(),
    onevaultMint: mintPk.toBase58(),
    onevaultAta: ata.address.toBase58(),
    usdcMint: USDC_DEVNET.toBase58(),
    wsolMint: WSOL.toBase58(),
    licenseLockAmount: LICENSE_LOCK_AMOUNT.toString(),
    explorer: `https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log("\nWrote", OUT_PATH);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
