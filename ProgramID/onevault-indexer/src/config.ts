import "dotenv/config";

export const config = {
  rpcUrl: process.env.RPC_URL ?? "https://api.devnet.solana.com",
  programId: process.env.PROGRAM_ID ?? "J1EpKCXNJL6JfePvNEkFLRhRRVTFZN46oeatYViqqk3G",
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/onevault",
  apiPort: Number(process.env.API_PORT ?? 3001),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 5000),
  startSlot: Number(process.env.START_SLOT ?? 0),
};
