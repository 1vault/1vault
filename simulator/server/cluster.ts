import "./env";
import { PublicKey } from "@solana/web3.js";

/** Solana cluster the simulator talks to. Same workflow code for both. */
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

const DEVNET = {
  programId: new PublicKey("2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP"),
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

export function loadClusterAddresses(env: NodeJS.ProcessEnv = process.env): ClusterAddresses {
  const cluster = resolveCluster(env);
  return {
    cluster,
    programId: pk("PROGRAM_ID", DEVNET.programId),
    protocolConfig: pk("PROTOCOL_CONFIG", DEVNET.protocolConfig),
    platformWallet: pk("PLATFORM_WALLET", DEVNET.platformWallet),
    degenFeeWallet: pk("DEGEN_FEE_WALLET", DEVNET.degenFeeWallet),
    licenseMint: pk("LICENSE_MINT", DEVNET.licenseMint),
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

export const CLUSTER_ADDR = loadClusterAddresses();
