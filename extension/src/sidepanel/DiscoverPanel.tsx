import { useCallback, useEffect, useState } from "react";
import {
  getLeaderboard,
  getWalletStats,
  type LeaderboardRow,
} from "../lib/api/client";
import { formatLamportsAsSol } from "../lib/estimate";
import { ShimmerList } from "./Shimmer";
import { SolAmount } from "./SolAmount";

type EnrichedRow = LeaderboardRow & {
  winRate?: number | null;
  returnPct?: number | string | null;
};

function fmtPct(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function fmtWinRate(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(0)}%`;
}

export function DiscoverPanel({
  onOpenVault,
  busy,
}: {
  onOpenVault?: (vaultPubkey: string) => void;
  onParkVault?: (vaultPubkey: string) => void;
  busy?: boolean;
}) {
  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLeaderboard();
      const items = data.items ?? [];
      const enriched: EnrichedRow[] = await Promise.all(
        items.map(async (row) => {
          const strategist = String(row.strategist ?? "");
          let winRate: number | null = null;
          if (strategist.length >= 32) {
            try {
              const stats = await getWalletStats(strategist, "30d");
              const wr = (stats as { winrate?: number }).winrate;
              if (typeof wr === "number" && Number.isFinite(wr)) winRate = wr;
            } catch {
              winRate = null;
            }
          }
          const returnPct = row.return_pct ?? row.returnPct;
          return { ...row, winRate, returnPct };
        })
      );
      setRows(enriched);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="discover">
      <div className="hero-head">
        <h1 className="hero-title">Discover</h1>
        <p className="hero-sub">Top vaults by return %</p>
      </div>

      {loading ? (
        <ShimmerList count={5} />
      ) : error ? (
        <div className="err">{error}</div>
      ) : rows.length === 0 ? (
        <div className="empty-hint">No leaderboard data yet.</div>
      ) : (
        <div className="list">
          {rows.map((row, idx) => {
            const pk = String(row.pubkey ?? "");
            const name = String(row.name ?? "Vault");
            const strategist = String(row.strategist ?? "");
            return (
              <button
                key={pk || idx}
                type="button"
                className="row-card"
                disabled={busy}
                onClick={() => pk && onOpenVault?.(pk)}
              >
                <div className="token-icon">#{idx + 1}</div>
                <div className="row-main">
                  <div className="row-title">
                    {name}
                    <span className="chip">{fmtPct(row.returnPct)}</span>
                    <span className="chip">WR {fmtWinRate(row.winRate)}</span>
                  </div>
                  <div className="row-sub mono">
                    {strategist.slice(0, 4)}…{strategist.slice(-4)}
                  </div>
                </div>
                <div className="row-right">
                  <div className="row-value">
                    <SolAmount
                      value={formatLamportsAsSol(String(row.nav ?? "0"), 2)}
                      unit="SOL NAV"
                      size="md"
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="btn btn-secondary btn-block"
        disabled={loading}
        onClick={() => void load()}
      >
        Refresh leaderboard
      </button>
    </section>
  );
}
