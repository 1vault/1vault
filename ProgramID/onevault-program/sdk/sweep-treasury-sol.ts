/**
 * Unwrap wSOL sitting in the protocol treasury PDA to native SOL on 9Yajd...
 * Requires the upgraded program (sweep_treasury_sol).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
} from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { RPC_URL } from "./rpc";
import { FEE_WALLETS, SEEDS } from "./constants";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IDL_PATH = path.join(ROOT, "target", "idl", "onevault.json");
const ADDR_PATH = path.join(ROOT, "scripts", "devnet-addresses.json");

function loadKeypair(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[])
  );
}

async function main() {
  const addr = JSON.parse(fs.readFileSync(ADDR_PATH, "utf8"));
  const payer = loadKeypair();
  const connection = new Connection(RPC_URL, "confirmed");
  const program = new Program(
    JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as Idl,
    new AnchorProvider(connection, new Wallet(payer), { commitment: "confirmed" })
  );
  const protocolConfig = new PublicKey(addr.protocolConfig);
  const treasuryAta = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.treasury), NATIVE_MINT.toBuffer()],
    program.programId
  )[0];
  const treasuryAuthority = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.treasury)],
    program.programId
  )[0];
  const unwrapAccount = PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.feeUnwrap), treasuryAta.toBuffer()],
    program.programId
  )[0];

  const before = await connection.getBalance(FEE_WALLETS.platformSol);
  const methods = program.methods as Record<string, (...args: never[]) => any>;
  const fn = methods.sweepTreasurySol ?? methods.sweep_treasury_sol;
  const sig = await fn()
    .accounts({
      authority: payer.publicKey,
      protocolConfig,
      platformWallet: FEE_WALLETS.platformSol,
      treasuryAuthority,
      treasuryTokenAccount: treasuryAta,
      unwrapAccount,
      nativeMint: NATIVE_MINT,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  const after = await connection.getBalance(FEE_WALLETS.platformSol);
  console.log("platform", FEE_WALLETS.platformSol.toBase58());
  console.log("before SOL", (before / LAMPORTS_PER_SOL).toFixed(9));
  console.log("after  SOL", (after / LAMPORTS_PER_SOL).toFixed(9));
  console.log("delta      ", ((after - before) / LAMPORTS_PER_SOL).toFixed(9));
  console.log("tx", sig);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
