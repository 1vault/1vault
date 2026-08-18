import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export function parseSecretKey(input: string): Keypair {
  const raw = input.trim();
  if (!raw) throw new Error("empty secret");

  if (raw.startsWith("[")) {
    const nums = JSON.parse(raw) as number[];
    if (!Array.isArray(nums) || nums.length < 32) {
      throw new Error("invalid JSON secret key");
    }
    return Keypair.fromSecretKey(Uint8Array.from(nums));
  }

  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length >= 64) {
    return Keypair.fromSecretKey(Buffer.from(raw, "hex"));
  }

  return Keypair.fromSecretKey(bs58.decode(raw));
}

export function loadCliKeypair(): Keypair {
  const p = path.join(os.homedir(), ".config", "solana", "id.json");
  if (!fs.existsSync(p)) {
    throw new Error(`Solana CLI keypair not found at ${p}`);
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[])
  );
}
