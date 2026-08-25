import { useCallback, useEffect, useMemo, useState } from "react";
import { listVaults } from "../lib/api/client";
import { formatLamportsAsSol } from "../lib/estimate";
import { ShimmerList } from "./Shimmer";
import { SolAmount } from "./SolAmount";

const DISCOVER_LIMIT = 20;

type VaultRow = Record<string, unknown>;

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function vaultName(v: VaultRow) {
  return String(v.name ?? "Vault");
}

function vaultType(v: VaultRow) {
  return String(v.vaultType ?? v.vault_type ?? "pooled").toUpperCase();
}

function matchesQuery(v: VaultRow, q: string): boolean {
  if (!q) return true;
  const hay = [
    String(v.name ?? ""),
    String(v.pubkey ?? ""),
    String(v.strategist ?? ""),
    String(v.vaultType ?? v.vault_type ?? ""),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function DiscoverPanel({
  onOpenVault,
  busy,
}: {
  onOpenVault?: (vaultPubkey: string) => void;
  onParkVault?: (vaultPubkey: string) => void;
  busy?: boolean;
}) {
  const [rows, setRows] = useState<VaultRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listVaults({ pageSize: 100 });
      const items = (data.items ?? []).filter((v) => String(v.pubkey ?? "").length >= 32);
      setRows(items);
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((v) => matchesQuery(v, q)).slice(0, DISCOVER_LIMIT);
  }, [rows, query]);

  return (
    <section className="discover">
      <div className="hero-head discover-head">
        <h1 className="hero-title">Discover</h1>
        <div className="discover-search field">
          <label htmlFor="discover-search" className="sr-only">
            Search vaults
          </label>
          <input
            id="discover-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, vault, or strategist…"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </div>

      {loading ? (
        <ShimmerList count={5} />
      ) : error ? (
        <div className="err">{error}</div>
      ) : rows.length === 0 ? (
        <div className="empty-hint">No vaults indexed yet.</div>
      ) : visible.length === 0 ? (
        <div className="empty-hint">No vaults match “{query.trim()}”.</div>
      ) : (
        <div className="list">
          {visible.map((row, idx) => {
            const pk = String(row.pubkey ?? "");
            const strategist = String(row.strategist ?? "");
            return (
              <button
                key={pk || idx}
                type="button"
                className="row-card"
                disabled={busy || !pk}
                onClick={() => pk && onOpenVault?.(pk)}
              >
                <div className="token-icon">1V</div>
                <div className="row-main">
                  <div className="row-title">
                    {vaultName(row)}
                    <span className="chip">{vaultType(row)}</span>
                  </div>
                  <div className="row-sub mono">
                    {strategist ? shortAddr(strategist) : shortAddr(pk)}
                  </div>
                </div>
                <div className="row-right">
                  <div className="row-value">
                    <SolAmount
                      value={formatLamportsAsSol(String(row.nav ?? row.total_assets ?? "0"), 2)}
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
        Refresh vaults
      </button>
    </section>
  );
}
