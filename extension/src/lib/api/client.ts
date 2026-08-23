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

export async function getTokenResearch(mint: string): Promise<Record<string, unknown>> {
  return api(`/v1/tokens/${encodeURIComponent(mint)}/research`);
}
