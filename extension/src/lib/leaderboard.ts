import { BACKEND_URL, CLUSTER } from "./config";
import type { ApiEnvelope } from "./api/client";
import { filterVisibleVaults } from "./vault-status";

export type LeaderboardPeriod = "7d" | "30d";

export type LeaderboardEntry = {
  rank: number;
  vault: string;
  name: string;
  strategist: string;
  winRate: number | null;
  returnPct: number | null;
  nav: string;
};

function extractWinrate(obj: Record<string, unknown>): number | null {
  if (typeof obj.winrate === "number" && Number.isFinite(obj.winrate)) return obj.winrate;
  const pnl = obj.pnl_stat;
  if (pnl && typeof pnl === "object") {
    const wr = (pnl as Record<string, unknown>).winrate;
    if (typeof wr === "number" && Number.isFinite(wr)) return wr;
  }
  return null;
}

export function parseWalletWinrates(
  payload: Record<string, unknown>,
  wallets: string[]
): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const w of wallets) out.set(w, null);

  const statsRaw = payload.stats;
  if (statsRaw && typeof statsRaw === "object") {
    const stats = statsRaw as Record<string, unknown>;

    if (Array.isArray(stats.list)) {
      for (const item of stats.list) {
        if (!item || typeof item !== "object") continue;
        const m = item as Record<string, unknown>;
        const addr = String(m.wallet_address ?? m.wallet ?? m.address ?? "");
        if (addr && out.has(addr)) out.set(addr, extractWinrate(m));
      }
    }

    for (const w of wallets) {
      const node = stats[w];
      if (node && typeof node === "object") {
        out.set(w, extractWinrate(node as Record<string, unknown>));
      }
    }

    if (wallets.length === 1) {
      const single = extractWinrate(stats);
      if (single != null) out.set(wallets[0]!, single);
    }
  }

  for (const w of wallets) {
    if (out.get(w) != null) continue;
    const wr = extractWinrate(payload);
    if (wr != null) out.set(w, wr);
  }

  return out;
}

export async function fetchWalletWinrates(
  wallets: string[],
  period: LeaderboardPeriod = "30d"
): Promise<Map<string, number | null>> {
  const unique = [...new Set(wallets.filter((w) => w.length >= 32))];
  const result = new Map<string, number | null>();
  if (unique.length === 0) return result;

  const CHUNK = 10;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const primary = chunk[0]!;
    const url = new URL(
      `${BACKEND_URL}/v1/wallets/${encodeURIComponent(primary)}/stats`
    );
    url.searchParams.set("cluster", CLUSTER);
    url.searchParams.set("period", period);
    for (const w of chunk.slice(1)) url.searchParams.append("wallet", w);

    const res = await fetch(url.toString(), {
      headers: {
        "content-type": "application/json",
        "X-1Vault-Cluster": CLUSTER,
      },
    });
    const text = await res.text();
    let json: ApiEnvelope<Record<string, unknown>> | null = null;
    if (text.trim()) {
      try {
        json = JSON.parse(text) as ApiEnvelope<Record<string, unknown>>;
      } catch {
        throw new Error(`Could not load win rates (${res.status})`);
      }
    }
    if (!res.ok || json?.success === false) {
      throw new Error(json?.error?.message ?? `Could not load win rates (${res.status})`);
    }
    const data = (json?.data ?? json) as Record<string, unknown>;
    const rates = parseWalletWinrates(data, chunk);
    for (const [k, v] of rates) result.set(k, v);
  }

  return result;
}

function numField(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Merge global vault sources — no wallet / strategist filter. */
export function mergeGlobalVaultRows(
  ...groups: Array<Array<Record<string, unknown>> | undefined>
): Array<Record<string, unknown>> {
  const byPk = new Map<string, Record<string, unknown>>();
  for (const group of groups) {
    for (const v of group ?? []) {
      const pk = String(v.pubkey ?? "");
      if (pk.length < 32) continue;
      byPk.set(pk, { ...byPk.get(pk), ...v });
    }
  }
  return [...byPk.values()];
}

export function buildWinrateLeaderboard(
  vaults: Array<Record<string, unknown>>,
  winByStrategist: Map<string, number | null>,
  limit = 25
): LeaderboardEntry[] {
  const rows = filterVisibleVaults(vaults)
    .filter((v) => String(v.pubkey ?? "").length >= 32)
    .map((v) => {
      const strategist = String(v.strategist ?? "");
      const winRate = strategist ? (winByStrategist.get(strategist) ?? null) : null;
      return {
        vault: String(v.pubkey ?? ""),
        name: String(v.name ?? "Vault"),
        strategist,
        winRate,
        returnPct: numField(v.return_pct ?? v.returnPct),
        nav: String(v.nav ?? v.total_assets ?? "0"),
      };
    })
    .sort((a, b) => {
      const aw = a.winRate;
      const bw = b.winRate;
      if (aw == null && bw == null) return a.name.localeCompare(b.name);
      if (aw == null) return 1;
      if (bw == null) return -1;
      if (bw !== aw) return bw - aw;
      return (b.returnPct ?? -Infinity) - (a.returnPct ?? -Infinity);
    })
    .slice(0, limit);

  return rows.map((row, i) => ({ ...row, rank: i + 1 }));
}

export function formatWinRate(winRate: number | null): string {
  if (winRate == null) return "—";
  return `${(winRate * 100).toFixed(0)}%`;
}
