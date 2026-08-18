import "dotenv/config";

export const config = {
  rpcUrl:
    process.env.RPC_URL ??
    "https://devnet.helius-rpc.com/?api-key=411af969-853a-430a-b169-c052862261b8",
  programId: process.env.PROGRAM_ID ?? "2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP",
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/onevault",
  apiPort: Number(process.env.API_PORT ?? 3001),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 8000),
  startSlot: Number(process.env.START_SLOT ?? 0),
};
