/**
 * Indexer client (:3001) — vault-scoped ledger that Go /v1/ledger cannot serve to degens.
 * Role vocab: indexer uses degen|retail; backend uses strategies|investors.
 */
import { INDEXER_URL } from "../config";

export type IndexerRole = "degen" | "retail";
export type ApiRole = "strategies" | "investors";

export function normalizeRole(role: string | undefined | null): ApiRole {
  const r = (role ?? "").toLowerCase();
  if (r === "degen" || r === "strategies" || r === "strategist") return "strategies";
  return "investors";
}

export type DepositIntent = {
  id?: number;
  vault?: string;
  investor?: string;
  role?: string;
  amount?: string | number;
  status?: string;
  take_profit_bps?: number | null;
  stop_loss_bps?: number | null;
  signature?: string | null;
  created_at?: string;
  [k: string]: unknown;
};

export type InvestorMandate = {
  vault?: string;
  investor?: string;
  role?: string;
  park_amount?: string | number;
  take_profit_bps?: number | null;
  stop_loss_bps?: number | null;
  auto_follow?: boolean;
  updated_at?: string;
  [k: string]: unknown;
};

async function indexerGet<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${INDEXER_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`indexer ${res.status}: ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function listDepositsByVault(vault: string): Promise<DepositIntent[]> {
  const rows = await indexerGet<DepositIntent[]>("/api/ledger/deposits", { vault });
  return Array.isArray(rows) ? rows : [];
}

export async function listMandatesByVault(vault: string): Promise<InvestorMandate[]> {
  const rows = await indexerGet<InvestorMandate[]>("/api/ledger/mandates", { vault });
  return Array.isArray(rows) ? rows : [];
}

export async function indexerHealth(): Promise<unknown> {
  return indexerGet("/health");
}
