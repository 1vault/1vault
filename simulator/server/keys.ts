import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

function simulatorIdJson(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "id.json");
}

export function loadCliKeypair(): Keypair {
  const candidates = [
    simulatorIdJson(),
    path.join(os.homedir(), ".config", "solana", "id.json"),
  ];
  const p = candidates.find((file) => fs.existsSync(file));
  if (!p) {
    throw new Error(
      `Keypair not found. Create simulator/id.json (Solana JSON secret) or ~/.config/solana/id.json`
    );
  }
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8")) as number[])
  );
}
