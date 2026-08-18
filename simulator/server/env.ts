import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(here, "../.env"));
loadEnvFile(path.resolve(here, "../../ProgramID/onevault-program/sdk/.env"));
loadEnvFile(path.resolve(here, "../../ProgramID/onevault-indexer/.env"));

const HELIUS_DEVNET =
  "https://devnet.helius-rpc.com/?api-key=411af969-853a-430a-b169-c052862261b8";

export const RPC_URL = process.env.RPC_URL ?? HELIUS_DEVNET;
export const PORT = Number(process.env.PORT ?? 8788);
export const INDEXER_API = process.env.INDEXER_API ?? "http://127.0.0.1:3001";
