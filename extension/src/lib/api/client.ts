import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { BACKEND_URL, CLUSTER } from "../config";

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  meta?: { cluster?: string; requestId?: string; version?: string };
  error?: { code?: string; message?: string; details?: unknown } | null;
};

/** Typed OpenAPI client. Paths without operationId — use path methods. */
export const openapi = createClient<paths>({
  baseUrl: BACKEND_URL,
});

openapi.use({
  onRequest({ request }) {
    const url = new URL(request.url);
    if (!url.searchParams.has("cluster")) {
      url.searchParams.set("cluster", CLUSTER);
    }
    return new Request(url, request);
  },
});

/**
 * Envelope-aware GET/POST against /v1.
 * Prefer this over raw openapi when handlers wrap `{ success, data, error }`.
 */
export async function api<T>(
  path: string,
  init?: RequestInit & { query?: Record<string, string | number | undefined> }
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${BACKEND_URL}${path}`);
  if (!url.searchParams.has("cluster")) {
    url.searchParams.set("cluster", CLUSTER);
  }
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const { query: _q, ...rest } = init ?? {};
  const res = await fetch(url.toString(), {
    ...rest,
    headers: {
      "content-type": "application/json",
      "X-1Vault-Cluster": CLUSTER,
      ...(rest.headers ?? {}),
    },
  });
  const json = (await res.json()) as ApiEnvelope<T>;
  if (!res.ok || json.success === false) {
    throw new Error(json.error?.message ?? `request failed (${res.status})`);
  }
  return (json.data ?? json) as T;
}

export async function getHealth(): Promise<unknown> {
  return api("/v1/health");
}

export async function getProtocol(): Promise<{
  programId?: string;
  licenseMint?: string;
  licenseLockAmount?: string | number;
  rpcUrl?: string;
  [k: string]: unknown;
}> {
  return api("/v1/protocol");
}

export async function getStrategist(pubkey: string): Promise<{
  strategist?: unknown;
  vaults?: Array<Record<string, unknown>>;
}> {
  return api(`/v1/strategists/${encodeURIComponent(pubkey)}`);
}

export async function getVault(pubkey: string): Promise<Record<string, unknown>> {
  return api(`/v1/vaults/${encodeURIComponent(pubkey)}`);
}

export async function listVaults(query?: {
  strategist?: string;
  vaultType?: string;
  pageSize?: number;
}): Promise<{ items?: Array<Record<string, unknown>> }> {
  return api("/v1/vaults", {
    query: {
      strategist: query?.strategist,
      vaultType: query?.vaultType,
      pageSize: query?.pageSize,
    },
  });
}

export async function listVaultPositions(pubkey: string): Promise<{
  vault?: Array<Record<string, unknown>>;
  investors?: Array<Record<string, unknown>>;
  items?: Array<Record<string, unknown>>;
  positions?: Array<Record<string, unknown>>;
  wallet?: string;
}> {
  return api(`/v1/vaults/${encodeURIComponent(pubkey)}/positions`);
}

export async function listVaultTrades(pubkey: string): Promise<{
  items?: Array<Record<string, unknown>>;
}> {
  return api(`/v1/vaults/${encodeURIComponent(pubkey)}/trades`);
}

export type VaultFees = {
  accrued?: string | number | null;
  claimed?: string | number | null;
  performanceFeeBps?: number | null;
  managementFeeBps?: number | null;
  items?: Array<Record<string, unknown>>;
  [k: string]: unknown;
};

export async function getVaultFees(pubkey: string): Promise<VaultFees> {
  return api(`/v1/vaults/${encodeURIComponent(pubkey)}/fees`);
}

export async function getTokenResearch(mint: string): Promise<Record<string, unknown>> {
  return api(`/v1/tokens/${encodeURIComponent(mint)}/research`);
}

export type LeaderboardRow = {
  pubkey?: string;
  name?: string;
  strategist?: string;
  active_followers?: number;
  activeFollowers?: number;
  estimated_follower_capital?: string | number;
  estimatedFollowerCapital?: string | number;
  return_pct?: number | string;
  returnPct?: number | string;
  nav?: string | number;
  last_updated?: string;
  lastUpdated?: string;
  [k: string]: unknown;
};

export async function getLeaderboard(): Promise<{
  items?: LeaderboardRow[];
  limit?: number;
  orderBy?: string;
}> {
  return api("/v1/leaderboard");
}

export type VaultHoldingRow = {
  vault?: string;
  investor?: string;
  role?: string;
  deposited?: string | number;
  shares?: string | number;
  remaining_parked?: string | number;
  remainingParked?: string | number;
  [k: string]: unknown;
};

export async function getVaultHoldings(pubkey: string): Promise<{
  items?: VaultHoldingRow[];
  wallet?: string;
}> {
  return api(`/v1/vaults/${encodeURIComponent(pubkey)}/holdings`);
}

export async function getVaultNav(pubkey: string): Promise<{
  items?: Array<Record<string, unknown>>;
}> {
  return api(`/v1/vaults/${encodeURIComponent(pubkey)}/nav`);
}

export type VaultProfileTwitter = {
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
  verifiedAt?: string;
};

export type VaultProfile = {
  pubkey: string;
  name?: string;
  strategist?: string;
  vaultType?: string;
  vaultTypeLabel?: string;
  returnPct?: number | null;
  nav?: string | number | null;
  activeFollowers?: number | null;
  estimatedFollowerCapital?: string | number | null;
  twitter?: VaultProfileTwitter | null;
};

export async function getVaultProfile(pubkey: string): Promise<VaultProfile> {
  return api(`/v1/vaults/${encodeURIComponent(pubkey)}/profile`);
}

export async function getWalletStats(
  walletAddress: string,
  period: "7d" | "30d" = "30d"
): Promise<Record<string, unknown>> {
  return api(`/v1/wallets/${encodeURIComponent(walletAddress)}/stats`, {
    query: { period },
  });
}

export async function getInvestor(pubkey: string): Promise<{
  investor?: string;
  holdings?: Array<Record<string, unknown>>;
  mandates?: Array<Record<string, unknown>>;
}> {
  return api(`/v1/investors/${encodeURIComponent(pubkey)}`);
}

export async function getWalletNonce(
  pubkey: string,
  accessToken: string
): Promise<{ nonce: string; message: string; expiresAt?: string }> {
  return api(`/v1/wallets/nonce`, {
    query: { pubkey },
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export async function bindWallet(
  accessToken: string,
  body: {
    pubkey: string;
    nonce: string;
    signature: string;
    rolePreference: "strategies" | "investors";
    primary?: boolean;
  }
): Promise<{ wallet?: Record<string, unknown> }> {
  return api("/v1/wallets/bind", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
}

export async function prepUnlockLicense(strategist: string): Promise<{
  transaction?: string;
  recentBlockhash?: string;
  feePayer?: string;
  requiredSigners?: string[];
  signerDetails?: Array<{ pubkey: string; userMustSign?: boolean }>;
}> {
  return api("/v1/tx/unlock-license", {
    method: "POST",
    body: JSON.stringify({ strategist }),
  });
}

export async function prepParkGuest(body: {
  investor: string;
  vault: string;
  strategist?: string;
  vaultId?: number;
  vaultTokenAccount: string;
  lamports: number;
  role?: string;
}): Promise<{ prepared?: { transaction?: string; signerDetails?: Array<{ pubkey: string; userMustSign?: boolean }> }; transaction?: string; signerDetails?: Array<{ pubkey: string; userMustSign?: boolean }> }> {
  return api("/v1/tx/park-guest", {
    method: "POST",
    body: JSON.stringify({ ...body, role: body.role ?? "investors" }),
  });
}

export async function prepWithdraw(body: {
  investor: string;
  vault: string;
  strategist?: string;
  vaultId?: number;
  vaultTokenAccount: string;
  shares: number | string;
}): Promise<{
  transaction?: string;
  signerDetails?: Array<{ pubkey: string; userMustSign?: boolean }>;
}> {
  return api("/v1/tx/withdraw", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function submitSignedTx(signedTransaction: string): Promise<Record<string, unknown>> {
  return api("/v1/tx/submit", {
    method: "POST",
    body: JSON.stringify({ signedTransaction }),
  });
}
