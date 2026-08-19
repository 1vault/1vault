import { PublicKey } from "@solana/web3.js";
import { ONEVAULT_PROGRAM_ID } from "./constants";

/** Solana cluster the off-chain stack talks to. Same code path for both. */
export type Cluster = "devnet" | "mainnet-beta";

/** How vault buys are filled. `demo` is Devnet presentation only. */
export type TradeExecution = "demo" | "live";

export type ClusterAddresses = {
  cluster: Cluster;
  programId: PublicKey;
  protocolConfig: PublicKey;
  platformWallet: PublicKey;
  degenFeeWallet: PublicKey;
  licenseMint: PublicKey;
  tradeExecution: TradeExecution;
};

const DEVNET: Omit<ClusterAddresses, "cluster" | "tradeExecution"> = {
  programId: ONEVAULT_PROGRAM_ID,
  protocolConfig: new PublicKey("2WXErzw6DEZsVQ2QD3oTcwumCknpzhLf99akKu7qweQR"),
  platformWallet: new PublicKey("9YajdkrkvyzDm57bPSijfy6sFNj9wuqQtYmuYUXZtPDx"),
  degenFeeWallet: new PublicKey("EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286"),
  licenseMint: new PublicKey("4R9AHfF2wE8X8252Swra3ncvKVDe3m73k8EfP99zz6YK"),
};

function pk(envName: string, fallback: PublicKey): PublicKey {
  const raw = process.env[envName]?.trim();
  return raw ? new PublicKey(raw) : fallback;
}

export function resolveCluster(env: NodeJS.ProcessEnv = process.env): Cluster {
  const raw = (env.CLUSTER ?? env.SOLANA_CLUSTER ?? "devnet").toLowerCase();
  if (raw === "mainnet" || raw === "mainnet-beta") return "mainnet-beta";
  return "devnet";
}

export function resolveTradeExecution(
  cluster: Cluster,
  env: NodeJS.ProcessEnv = process.env
): TradeExecution {
  const raw = (env.TRADE_EXECUTION ?? "").toLowerCase();
  if (raw === "live" || raw === "demo") return raw;
  return cluster === "mainnet-beta" ? "live" : "demo";
}

/**
 * Addresses + execution mode. On mainnet, set PROGRAM_ID / PROTOCOL_CONFIG /
 * PLATFORM_WALLET / DEGEN_FEE_WALLET / LICENSE_MINT (and TRADE_EXECUTION=live).
 * Devnet keeps the live presentation defaults unless overridden.
 */
export function loadClusterAddresses(env: NodeJS.ProcessEnv = process.env): ClusterAddresses {
  const cluster = resolveCluster(env);
  const base = DEVNET;
  return {
    cluster,
    programId: pk("PROGRAM_ID", base.programId),
    protocolConfig: pk("PROTOCOL_CONFIG", base.protocolConfig),
    platformWallet: pk("PLATFORM_WALLET", base.platformWallet),
    degenFeeWallet: pk("DEGEN_FEE_WALLET", base.degenFeeWallet),
    licenseMint: pk("LICENSE_MINT", base.licenseMint),
    tradeExecution: resolveTradeExecution(cluster, env),
  };
}

export function explorerTx(signature: string, cluster: Cluster): string {
  const q = cluster === "mainnet-beta" ? "" : "?cluster=devnet";
  return `https://explorer.solana.com/tx/${signature}${q}`;
}

export function explorerAddr(address: string, cluster: Cluster): string {
  const q = cluster === "mainnet-beta" ? "" : "?cluster=devnet";
  return `https://explorer.solana.com/address/${address}${q}`;
}
