/**
 * Devnet: mint 1vault Licence (1VL) to a target wallet.
 * Requires the mint authority keypair (bootstrap deployer).
 *
 * Run from sdk/:
 *   KEYPAIR_PATH=/path/to/deployer.json TARGET_WALLET=... npm run fund-1vl:devnet
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  transfer,
} from "@solana/spl-token";
import { RPC_URL } from "./rpc";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_PATH = path.join(ROOT, "scripts", "devnet-addresses.json");

const DEFAULT_TARGET = "ETCBEqkrKYM6S7M7nqAJadmkDKZrTmftZLwsaoXFtpMR";
/** 1,000,000 whole tokens @ 6 decimals */
const DEFAULT_AMOUNT_RAW = 1_000_000_000_000n;

function loadKeypair(): Keypair {
  const fromEnv = process.env.KEYPAIR_PATH?.trim();
  const p = fromEnv || path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(p)) {
    throw new Error(
      `Keypair not found at ${p}. Set KEYPAIR_PATH to the bootstrap deployer key (mint authority: 9WDdee1AwqRCJ2WSr9dDAcaoCXPkfd19vR5RQdc2zcan).`
    );
  }
  const secret = JSON.parse(fs.readFileSync(p, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function formatWhole(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  return `${(raw / base).toLocaleString("en-US")} 1VL`;
}

async function main() {
  const addresses = JSON.parse(fs.readFileSync(OUT_PATH, "utf8")) as {
    onevaultMint: string;
    authority: string;
  };

  const target = new PublicKey(process.env.TARGET_WALLET?.trim() || DEFAULT_TARGET);
  const amountRaw = process.env.AMOUNT_RAW?.trim()
    ? BigInt(process.env.AMOUNT_RAW)
    : DEFAULT_AMOUNT_RAW;

  const payer = loadKeypair();
  const mint = new PublicKey(addresses.onevaultMint);
  const connection = new Connection(RPC_URL, "confirmed");

  console.log("RPC:      ", RPC_URL.split("?")[0], "(…)");
  console.log("Payer:    ", payer.publicKey.toBase58());
  console.log("Target:   ", target.toBase58());
  console.log("Mint:     ", mint.toBase58());
  console.log("Amount:   ", formatWhole(amountRaw, 6));

  const mintInfo = await getMint(connection, mint);
  const authority = mintInfo.mintAuthority;
  if (!authority) {
    throw new Error("Mint authority is disabled — cannot mint more 1VL.");
  }

  const destAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    target
  );

  let sig: string;
  if (authority.equals(payer.publicKey)) {
    sig = await mintTo(connection, payer, mint, destAta.address, payer, amountRaw);
    console.log("\nMinted to target:", sig);
  } else {
    const sourceAta = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      payer.publicKey
    );
    const balance = BigInt((await connection.getTokenAccountBalance(sourceAta.address)).value.amount);
    if (balance < amountRaw) {
      throw new Error(
        `Payer is not mint authority and only holds ${formatWhole(balance, mintInfo.decimals)}. ` +
          `Use KEYPAIR_PATH for deployer ${addresses.authority}.`
      );
    }
    sig = await transfer(
      connection,
      payer,
      sourceAta.address,
      destAta.address,
      payer,
      amountRaw
    );
    console.log("\nTransferred to target:", sig);
  }

  const after = BigInt(
    (await connection.getTokenAccountBalance(destAta.address)).value.amount
  );
  console.log("Target balance:", formatWhole(after, mintInfo.decimals));
  console.log(
    "Explorer:",
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
