import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Idl } from "@coral-xyz/anchor";

const SDK_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROGRAM_ROOT = path.resolve(SDK_DIR, "..");

/** Prefer `target/idl` after anchor build; fall back to committed `sdk/idl`. */
export function loadOneVaultIdl(): Idl {
  const candidates = [
    path.join(PROGRAM_ROOT, "target", "idl", "onevault.json"),
    path.join(SDK_DIR, "idl", "onevault.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")) as Idl;
    }
  }
  throw new Error("onevault.json IDL not found — run anchor build or sync sdk/idl/");
}
