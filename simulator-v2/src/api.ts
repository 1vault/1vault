import type { NodeUpdate, ProtocolInfo, RetailSettings, SimMode, WalletPreview } from "../shared/events";
import { runBackendFlow } from "./backend-flow";
import { fetchWalletBalance } from "./backend-flow";
import { parseSecretKey } from "./keys";

const CLUSTER = (import.meta.env.VITE_CLUSTER ?? "devnet") as "devnet" | "mainnet-beta";

function qs(): string {
  return `?cluster=${encodeURIComponent(CLUSTER)}`;
}

function explorerProgram(cluster: string, programId: string): string {
  const base = "https://explorer.solana.com";
  const q = cluster === "mainnet-beta" ? "" : "?cluster=devnet";
  return `${base}/address/${programId}${q}`;
}

type Injected = {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string };
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toBase58(): string } }>;
};

function getInjected(): Injected | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { solana?: Injected; solflare?: Injected };
  if (w.solana?.isPhantom) return w.solana;
  return w.solflare ?? w.solana ?? null;
}

export async function fetchProtocol(): Promise<ProtocolInfo> {
  let res: Response;
  try {
    res = await fetch(`/v1/protocol${qs()}`);
  } catch {
    throw new Error(
      "Cannot reach 1Vault backend on :3090. Start backend API and use http://127.0.0.1:5174"
    );
  }
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? "protocol fetch failed");
  }
  const d = json.data as Record<string, string>;
  const cluster = (d.cluster ?? CLUSTER) as ProtocolInfo["cluster"];
  return {
    cluster,
    tradeExecution: "live",
    programId: d.programId,
    protocolConfig: d.protocolConfig,
    platformWallet: d.platformWallet,
    degenFeeWallet: d.strategiesFeeWallet ?? d.degenFeeWallet ?? "",
    explorerProgram: explorerProgram(cluster, d.programId),
    licenseMint: d.licenseMint,
    licenseName: "1vault Licence",
    licenseLockTokens: String(d.licenseLockAmount ?? "1000000"),
  };
}

export async function previewWallet(opts: {
  secret?: string;
  useCli?: boolean;
  wallet?: boolean;
}): Promise<WalletPreview & { cli?: boolean; source?: "secret" | "wallet" }> {
  if (opts.useCli) {
    throw new Error("CLI keypair is not supported in simulator-v2 — use Private key or Connect wallet");
  }
  if (opts.wallet) {
    const injected = getInjected();
    if (!injected) throw new Error("Phantom/Solflare not detected");
    const { publicKey } = await injected.connect();
    const pubkey = publicKey.toBase58();
    const bal = await fetchWalletBalance(pubkey);
    return { pubkey, sol: bal.sol, lamports: bal.lamports, source: "wallet" };
  }
  const kp = parseSecretKey(String(opts.secret ?? ""));
  const pubkey = kp.publicKey.toBase58();
  const bal = await fetchWalletBalance(pubkey);
  return { pubkey, sol: bal.sol, lamports: bal.lamports, source: "secret" };
}

export type WalletRunSlot = {
  source: "secret" | "wallet";
  secret?: string;
  pubkey: string;
};

export async function runWorkflow(
  body: {
    degen: WalletRunSlot;
    retails: WalletRunSlot[];
    settings?: RetailSettings;
    mode: SimMode;
    vaultId?: number;
    vaultPubkey?: string;
    vaultTokenAccount?: string;
  },
  onNode: (u: NodeUpdate) => void,
  onMeta: (event: string, data: unknown) => void
): Promise<void> {
  if (!body.settings) throw new Error("settings required");
  await runBackendFlow(
    {
      degen: body.degen,
      retails: body.retails,
      settings: body.settings,
      mode: body.mode,
      vaultId: body.vaultId,
      vaultPubkey: body.vaultPubkey,
      vaultTokenAccount: body.vaultTokenAccount,
    },
    onNode,
    onMeta
  );
}

export const SETUP_NODES: import("../shared/events").WorkflowNodeId[] = [
  "license",
  "vault",
  "settings",
  "deposit",
];
export const TRADE_NODES: import("../shared/events").WorkflowNodeId[] = [
  "ata",
  "request",
  "execute",
  "openPos",
  "mirror",
  "mark",
  "closePos",
  "withdraw",
  "toWallet",
  "accrue",
  "claim",
  "platform",
  "degenFee",
];
export const WALLET_OUT_NODES: import("../shared/events").WorkflowNodeId[] = ["toWallet", "platform"];
export const CLOSE_NODES: import("../shared/events").WorkflowNodeId[] = ["license", "vault", "deposit"];
export const DEPOSIT_NODES: import("../shared/events").WorkflowNodeId[] = ["settings", "deposit"];
