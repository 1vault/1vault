import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HELIUS_DEVNET =
  "https://devnet.helius-rpc.com/?api-key=411af969-853a-430a-b169-c052862261b8";

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

const sdkDir = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(sdkDir, ".env"));
loadEnvFile(path.resolve(sdkDir, "../../onevault-indexer/.env"));

/** Devnet Helius JSON-RPC. Override with RPC_URL. */
export const RPC_URL = process.env.RPC_URL ?? HELIUS_DEVNET;
