/** Hardcoded runtime config — no setup screen. */
export const BACKEND_URL = "https://awake-enchantment-production-ea29.up.railway.app";
export const API_DOCS_URL = `${BACKEND_URL}/v1/docs`;
/** Ledger pipeline reads; set when indexer is deployed (local dev: :3001). */
export const INDEXER_URL = "https://1vault-production.up.railway.app";
export const CLUSTER = "devnet" as const;
export const RPC_URL = "https://api.devnet.solana.com";

export const BRAND = "#093C5D";
export const LICENSE_LOCK_WHOLE = 1_000_000;

export type Cluster = typeof CLUSTER;
