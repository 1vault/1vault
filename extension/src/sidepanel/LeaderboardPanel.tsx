import { useCallback, useEffect, useMemo, useState } from "react";
import { CLUSTER } from "../lib/config";
import { getLeaderboard, listGlobalVaults } from "../lib/api/client";
import {
  buildWinrateLeaderboard,
  fetchWalletWinrates,
  formatWinRate,
  mergeGlobalVaultRows,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from "../lib/leaderboard";
import { annotateVaultLayout } from "../lib/vault-layout";
import { filterVisibleVaults } from "../lib/vault-status";
import { formatLamportsAsSol } from "../lib/estimate";
import { ShimmerList } from "./Shimmer";
import { SolAmount } from "./SolAmount";

const LEADERBOARD_LIMIT = 25;

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function rankClass(rank: number): string {
  if (rank === 1) return "leaderboard-rank leaderboard-rank--1";
  if (rank === 2) return "leaderboard-rank leaderboard-rank--2";
  if (rank === 3) return "leaderboard-rank leaderboard-rank--3";
  return "leaderboard-rank";
}

export function LeaderboardPanel({
  onOpenVault,
  busy,
}: {
  onOpenVault?: (vaultPubkey: string) => void;
  busy?: boolean;
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("30d");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allVaults, ranked] = await Promise.all([
        listGlobalVaults({ maxItems: 200 }),
        getLeaderboard(100),
      ]);

      const merged = mergeGlobalVaultRows(allVaults, ranked.items);
      const annotated = await annotateVaultLayout(merged).catch(() => merged);
      const vaults = filterVisibleVaults(annotated);
      const strategists = [
        ...new Set(
          vaults
            .map((v) => String(v.strategist ?? ""))
            .filter((s) => s.length >= 32)
        ),
      ];

      const winByStrategist = await fetchWalletWinrates(strategists, period).catch(() => new Map());
      setEntries(buildWinrateLeaderboard(vaults, winByStrategist, LEADERBOARD_LIMIT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const periodLabel = useMemo(() => (period === "30d" ? "30 days" : "7 days"), [period]);

  return (
    <section className="leaderboard">
      <div className="hero-head leaderboard-head">
        <div>
          <h1 className="hero-title">Leaderboard</h1>
          <p className="leaderboard-sub">
            Active vaults on {CLUSTER} — closed and legacy hidden ({periodLabel})
          </p>
        </div>
        <div className="leaderboard-period" role="tablist" aria-label="Win rate period">
          {(["30d", "7d"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={period === p}
              className={`leaderboard-period-btn${period === p ? " active" : ""}`}
              onClick={() => setPeriod(p)}
              disabled={loading}
            >
              {p === "30d" ? "30d" : "7d"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <ShimmerList count={6} />
      ) : error ? (
        <div className="err">{error}</div>
      ) : entries.length === 0 ? (
        <div className="empty-hint">No active vaults ranked yet.</div>
      ) : (
        <div className="list leaderboard-list">
          {entries.map((row) => (
            <button
              key={row.vault}
              type="button"
              className="row-card leaderboard-row"
              disabled={busy}
              onClick={() => onOpenVault?.(row.vault)}
            >
              <span className={rankClass(row.rank)} aria-label={`Rank ${row.rank}`}>
                {row.rank}
              </span>
              <div className="row-main">
                <div className="row-title">{row.name}</div>
                <div className="row-sub mono">
                  {row.strategist ? shortAddr(row.strategist) : shortAddr(row.vault)}
                </div>
              </div>
              <div className="row-right leaderboard-metrics">
                <div className="leaderboard-win">{formatWinRate(row.winRate)}</div>
                <div className="leaderboard-win-label">Win rate</div>
                <div className="leaderboard-nav">
                  <SolAmount
                    value={formatLamportsAsSol(row.nav, 2)}
                    unit="SOL"
                    size="sm"
                  />
                </div>
              </div>
            </button>
          ))}
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
