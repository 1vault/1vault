import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type IdlError = { code: number; name: string; msg: string };

const IDL_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../idl/onevault.json");

const FRIENDLY: Record<string, string> = {
  InsufficientLicenseBalance:
    "Create vault locks 1,000,000 1VL from the degen wallet. This wallet does not have enough.",
  LicenseNotActive: "Activate the strategist licence before creating a vault.",
  LicenseAlreadyActive: "This wallet already has an active licence.",
  ProtocolPaused: "The protocol is paused.",
  Unauthorized: "This wallet is not allowed to run that instruction.",
  VaultClosed: "This vault is already closed.",
  VaultClosing: "This vault is already closing.",
  VaultHasOpenPositions: "Close open positions before closing the vault.",
  VaultHasPendingTrades: "Wait for pending trades to finish before closing the vault.",
  InsufficientShares: "Not enough vault shares to withdraw.",
  InsufficientLiquidity: "The vault does not have enough SOL for this withdraw.",
  StrategistMustPark: "The degen wallet must park SOL in the vault before opening a trade.",
  ZeroDeposit: "Deposit amount must be greater than zero.",
  ZeroWithdraw: "Withdraw amount must be greater than zero.",
  SlippageExceeded: "The swap slipped more than the vault allows.",
  DexNotAllowed: "That DEX is not on the protocol allowlist.",
};

let cached: Map<number, IdlError> | undefined;

function errorTable(): Map<number, IdlError> {
  if (cached) return cached;
  cached = new Map();
  try {
    const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as { errors?: IdlError[] };
    for (const row of idl.errors ?? []) cached.set(row.code, row);
  } catch {
    /* IDL missing — hex codes still parse */
  }
  return cached;
}

function blob(err: unknown): string {
  if (err instanceof Error) {
    const extra = "logs" in err && Array.isArray((err as { logs?: string[] }).logs)
      ? (err as { logs: string[] }).logs.join("\n")
      : "";
    return `${err.message}\n${extra}`;
  }
  return String(err);
}

function parseProgramCode(text: string): number | undefined {
  const hex = text.match(/custom program error:\s*0x([0-9a-f]+)/i);
  if (hex) return Number.parseInt(hex[1], 16);
  const dec = text.match(/Error Number:\s*(\d+)/i);
  if (dec) return Number(dec[1]);
  return undefined;
}

function lookupError(text: string): IdlError | undefined {
  const code = parseProgramCode(text);
  if (code != null) {
    const row = errorTable().get(code);
    if (row) return row;
  }
  const named = text.match(/Error Code:\s*(\w+)/);
  if (named) {
    for (const row of errorTable().values()) {
      if (row.name === named[1]) return row;
    }
  }
  return undefined;
}

export function explainTxError(err: unknown): string {
  const text = blob(err);
  const row = lookupError(text);
  if (row) return FRIENDLY[row.name] ?? row.msg;
  const code = parseProgramCode(text);
  if (code === 1) return "Not enough SOL or token balance for this transaction.";
  if (/blockhash not found/i.test(text)) return "Network dropped the transaction. Retry.";
  if (/insufficient funds|Attempt to debit an account/i.test(text)) {
    return "Not enough SOL to pay this transaction.";
  }
  if (/already in use/i.test(text)) return "That account already exists on-chain.";
  const msg = text.match(/Error Message:\s*(.+)/);
  if (msg) return msg[1].trim().slice(0, 240);
  return text.split("Logs:")[0].replace(/\s+/g, " ").trim().slice(0, 240);
}