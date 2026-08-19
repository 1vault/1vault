import "dotenv/config";

const clusterRaw = (process.env.CLUSTER ?? process.env.SOLANA_CLUSTER ?? "devnet").toLowerCase();
const cluster = clusterRaw === "mainnet" || clusterRaw === "mainnet-beta" ? "mainnet-beta" : "devnet";

export const config = {
  cluster: cluster as "devnet" | "mainnet-beta",
  rpcUrl: process.env.RPC_URL ?? "",
  programId: process.env.PROGRAM_ID ?? "2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP",
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/onevault",
  apiPort: Number(process.env.API_PORT ?? 3001),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 8000),
  startSlot: Number(process.env.START_SLOT ?? 0),
};

if (!config.rpcUrl) {
  throw new Error("RPC_URL is required (set CLUSTER=devnet|mainnet-beta in .env)");
}
