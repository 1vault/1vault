/**
 * Devnet: register_strategist → lock_license → create_vault.
 * Run from sdk/: npm run create-vault:devnet
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, BN, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { RPC_URL } from "./rpc";
import { loadOneVaultIdl } from "./idl";
import { indexTx, registerVault, type VaultRegisterMeta } from "./index-tx.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "scripts", "devnet-addresses.json");

const PROGRAM_ID = new PublicKey(
  "2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP"
);
const WSOL = new PublicKey("So11111111111111111111111111111111111111112");
const VAULT_ID = Number(process.env.VAULT_ID ?? 53);
const VAULT_NAME = process.env.VAULT_NAME ?? "Sliced Vault Demo 3";
const PERFORMANCE_FEE_BPS = 2000;
/** Anchor enum: { pooledVault: {} } | { slicedVault: {} } */
const BOOK_MODE = { slicedVault: {} } as const;
const EARLY_EXIT_FEE_BPS = 1000;

function loadKeypair(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function pda(seeds: (Buffer | Uint8Array)[]): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

function u64Le(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

function methodsOf(program: Program): Record<string, (...args: unknown[]) => any> {
  return program.methods as Record<string, (...args: unknown[]) => any>;
}

function call(program: Program, snake: string, camel: string) {
  const methods = methodsOf(program);
  const fn = methods[camel] ?? methods[snake];
  if (!fn) throw new Error(`Missing method ${camel} / ${snake}`);
  return fn;
}

async function main() {
  const addresses = JSON.parse(fs.readFileSync(OUT_PATH, "utf8")) as {
    onevaultMint: string;
    onevaultAta: string;
    protocolConfig: string;
  };

  const payer = loadKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const provider = new AnchorProvider(connection, new Wallet(payer), {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const idl = loadOneVaultIdl();
  const program = new Program(idl, provider);

  const protocolConfig = new PublicKey(addresses.protocolConfig);
  const platformMint = new PublicKey(addresses.onevaultMint);
  const strategistAta = new PublicKey(addresses.onevaultAta);
  const strategistAccount = pda([Buffer.from("strategist"), payer.publicKey.toBuffer()]);
  const license = pda([Buffer.from("license"), payer.publicKey.toBuffer()]);
  const vault = pda([
    Buffer.from("vault"),
    payer.publicKey.toBuffer(),
    u64Le(VAULT_ID),
  ]);

  console.log("Strategist:", payer.publicKey.toBase58());
  console.log("Vault PDA: ", vault.toBase58());

  if (!(await connection.getAccountInfo(strategistAccount))) {
    const sig = await call(program, "register_strategist", "registerStrategist")()
      .accounts({
        strategist: payer.publicKey,
        protocolConfig,
      })
      .rpc();
    console.log("register_strategist:", sig);
  } else {
    console.log("register_strategist: already exists, skip");
  }

  if (!(await connection.getAccountInfo(license))) {
    const sig = await call(program, "lock_license", "lockLicense")()
      .accounts({
        strategist: payer.publicKey,
        protocolConfig,
        strategistAccount,
        license,
        strategistTokenAccount: strategistAta,
        platformTokenMint: platformMint,
      })
      .rpc();
    console.log("lock_license:", sig);
  } else {
    console.log("lock_license: already exists, skip");
  }

  const vaultMeta = (): VaultRegisterMeta => ({
    pubkey: vault.toBase58(),
    strategist: payer.publicKey.toBase58(),
    vaultId: VAULT_ID,
    name: VAULT_NAME,
    baseMint: WSOL.toBase58(),
    performanceFeeBps: PERFORMANCE_FEE_BPS,
    bookMode: "slicedVault" in BOOK_MODE ? "sliced_vault" : "pooled_vault",
    earlyExitFeeBps: EARLY_EXIT_FEE_BPS,
  });

  if (await connection.getAccountInfo(vault)) {
    console.log("create_vault: already exists, skip");
    await registerVault(vaultMeta());
  } else {
    const vaultToken = Keypair.generate();
    const risk = {
      description: "Devnet demo vault (wSOL base)",
      maxSlippageBps: 100,
      acceptedMints: [WSOL],
    };

    const sig = await call(program, "create_vault", "createVault")(
      new BN(VAULT_ID),
      VAULT_NAME,
      PERFORMANCE_FEE_BPS,
      BOOK_MODE,
      EARLY_EXIT_FEE_BPS,
      risk
    )
      .accounts({
        strategist: payer.publicKey,
        protocolConfig,
        strategistAccount,
        license,
        vault,
        vaultFeeState: pda([Buffer.from("vault_fee"), vault.toBuffer()]),
        baseMint: WSOL,
        vaultTokenAccount: vaultToken.publicKey,
        strategistLicenseTokens: strategistAta,
        platformTokenMint: platformMint,
        vaultLicenseVault: pda([Buffer.from("vault_license"), vault.toBuffer()]),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([vaultToken])
      .rpc();
    console.log("create_vault:", sig);
    console.log("vault_token_account:", vaultToken.publicKey.toBase58());
    await indexTx(sig, vaultMeta());
  }

  const [shareMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("share_mint"), vault.toBuffer()],
    PROGRAM_ID
  );

  const out = {
    ...addresses,
    vaultId: VAULT_ID,
    vaultName: VAULT_NAME,
    vault: vault.toBase58(),
    shareMint: shareMint.toBase58(),
    baseMint: WSOL.toBase58(),
    performanceFeeBps: PERFORMANCE_FEE_BPS,
    bookMode: BOOK_MODE,
    earlyExitFeeBps: EARLY_EXIT_FEE_BPS,
    vaultExplorer: `https://explorer.solana.com/address/${vault.toBase58()}?cluster=devnet`,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
  console.log("\nWrote", OUT_PATH);
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
