import { useEffect, useMemo, useState } from "react";
import {
  getVault,
  getVaultFees,
  getVaultHoldings,
  getVaultProfile,
  getWalletStats,
  listVaultPositions,
  listVaultTrades,
  type VaultFees,
  type VaultHoldingRow,
  type VaultProfile,
} from "../lib/api/client";
import { normalizeRole } from "../lib/indexer/client";
import { sendBg } from "../lib/messaging";
import type { ParkBreakdown } from "../lib/estimate";
import { formatLamportsAsSol } from "../lib/estimate";
import {
  attachTradeIds,
  parseVaultPositions,
  type VaultPositionRow,
} from "../lib/trade/positions";
import { SolAmount } from "./SolAmount";
import { ShimmerList } from "./Shimmer";

type DetailTab = "capital" | "holdings" | "positions" | "activity";

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function fmtPct(v: unknown): string {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function strField(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v) !== "") return String(v);
  }
  return "";
}

export function VaultProfileView({
  vaultPubkey,
  viewerPubkey,
  seed,
  onBack,
  onPark,
  busy,
}: {
  vaultPubkey: string;
  viewerPubkey?: string | null;
  /** Optional list-row data so detail paints immediately even if profile API fails. */
  seed?: {
    name?: string;
    nav?: string | number | null;
    vaultType?: string;
    vaultStatus?: string | null;
    strategist?: string | null;
  };
  onBack: () => void;
  onPark?: (vaultPubkey: string) => void;
  busy?: boolean;
}) {
  const [profile, setProfile] = useState<VaultProfile | null>(
    seed
      ? {
          pubkey: vaultPubkey,
          name: seed.name,
          nav: seed.nav,
          vaultType: seed.vaultType,
          strategist: seed.strategist ?? undefined,
        }
      : null
  );
  const [vaultStatus, setVaultStatus] = useState<string | null>(seed?.vaultStatus ?? null);
  const [winRate, setWinRate] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<ParkBreakdown | null>(null);
  const [holdings, setHoldings] = useState<VaultHoldingRow[]>([]);
  const [positions, setPositions] = useState<VaultPositionRow[]>([]);
  const [trades, setTrades] = useState<Array<Record<string, unknown>>>([]);
  const [fees, setFees] = useState<VaultFees | null>(null);
  const [tab, setTab] = useState<DetailTab>("capital");
  const [loading, setLoading] = useState(!seed);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [
          profResult,
          vaultRaw,
          parkBd,
          holdingsData,
          positionsData,
          tradesData,
          feesData,
        ] = await Promise.all([
          getVaultProfile(vaultPubkey).catch(() => null),
          getVault(vaultPubkey).catch(() => ({}) as Record<string, unknown>),
          sendBg<ParkBreakdown>({ type: "PARK_BREAKDOWN", vault: vaultPubkey }).catch(() => null),
          getVaultHoldings(vaultPubkey).catch(() => ({ items: [] as VaultHoldingRow[] })),
          listVaultPositions(vaultPubkey).catch(() => ({})),
          listVaultTrades(vaultPubkey).catch(() => ({ items: [] as Array<Record<string, unknown>> })),
          getVaultFees(vaultPubkey).catch(() => null),
        ]);
        if (cancelled) return;

        if (profResult) {
          setProfile(profResult);
        } else if (vaultRaw && Object.keys(vaultRaw).length > 0) {
          const vault = (vaultRaw.vault as Record<string, unknown> | undefined) ?? vaultRaw;
          setProfile({
            pubkey: vaultPubkey,
            name: String(vault.name ?? seed?.name ?? "Vault"),
            strategist: String(vault.strategist ?? seed?.strategist ?? ""),
            vaultType: String(vault.vaultType ?? vault.vault_type ?? seed?.vaultType ?? "pooled"),
            vaultTypeLabel: String(vault.vaultTypeLabel ?? vault.vault_type_label ?? ""),
            nav: (vault.nav ?? vault.total_assets ?? seed?.nav ?? "0") as string | number,
            activeFollowers: Number(vault.activeFollowers ?? vault.active_followers ?? 0) || 0,
            estimatedFollowerCapital: (vault.estimatedFollowerCapital ??
              vault.estimated_follower_capital ??
              null) as string | number | null,
            returnPct:
              typeof vault.returnPct === "number"
                ? vault.returnPct
                : typeof vault.return_pct === "number"
                  ? vault.return_pct
                  : null,
          });
        } else if (!seed) {
          setError("Vault not found");
        }

        setBreakdown(parkBd);
        setHoldings(holdingsData.items ?? []);
        setFees(feesData);

        const tradeItems = tradesData.items ?? [];
        setTrades(tradeItems);
        const parsed = parseVaultPositions(positionsData as Record<string, unknown>);
        setPositions(attachTradeIds(parsed, tradeItems));

        const st = String(
          vaultRaw.vaultStatus ??
            vaultRaw.vault_status ??
            vaultRaw.status ??
            seed?.vaultStatus ??
            ""
        );
        setVaultStatus(st || null);

        const strategist = String(
          profResult?.strategist ??
            ((vaultRaw.vault as Record<string, unknown>) ?? vaultRaw).strategist ??
            seed?.strategist ??
            ""
        );
        if (strategist.length >= 32) {
          try {
            const stats = await getWalletStats(strategist, "30d");
            const wr = (stats as { winrate?: number }).winrate;
            setWinRate(typeof wr === "number" ? wr : null);
          } catch {
            setWinRate(null);
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vaultPubkey]);

  const handle = profile?.twitter?.handle;
  const verified = Boolean(profile?.twitter?.verifiedAt);
  const avatar = profile?.twitter?.avatarUrl;
  const isOwn =
    Boolean(viewerPubkey) &&
    Boolean(profile?.strategist) &&
    viewerPubkey === profile?.strategist;
  const showPark = Boolean(onPark) && !isOwn;
  const isClosed = String(vaultStatus ?? "").toLowerCase() === "closed";
  const typeLabel = profile?.vaultTypeLabel ?? profile?.vaultType ?? "pooled";

  const { strategistRows, investorRows } = useMemo(() => {
    const strat: VaultHoldingRow[] = [];
    const inv: VaultHoldingRow[] = [];
    for (const h of holdings) {
      if (normalizeRole(String(h.role ?? "")) === "strategies") strat.push(h);
      else inv.push(h);
    }
    return { strategistRows: strat, investorRows: inv };
  }, [holdings]);

  const myPark = breakdown ? formatLamportsAsSol(breakdown.strategist.committed, 2) : "—";
  const investorPark = breakdown ? formatLamportsAsSol(breakdown.investor.committed, 2) : "—";
  const totalPark = breakdown ? formatLamportsAsSol(breakdown.total.committed, 2) : "—";
  const walletAvail =
    breakdown?.walletAvailable != null
      ? formatLamportsAsSol(breakdown.walletAvailable, 2)
      : null;

  const feeRows = useMemo(() => {
    if (!fees) return [] as Array<{ label: string; value: string }>;
    const rows: Array<{ label: string; value: string }> = [];
    if (fees.accrued != null) {
      rows.push({
        label: "Accrued",
        value: `${formatLamportsAsSol(String(fees.accrued), 3)} SOL`,
      });
    }
    if (fees.claimed != null) {
      rows.push({
        label: "Claimed",
        value: `${formatLamportsAsSol(String(fees.claimed), 3)} SOL`,
      });
    }
    if (fees.performanceFeeBps != null) {
      rows.push({ label: "Performance", value: `${fees.performanceFeeBps} bps` });
    }
    if (fees.managementFeeBps != null) {
      rows.push({ label: "Management", value: `${fees.managementFeeBps} bps` });
    }
    for (const item of fees.items ?? []) {
      const label =
        strField(item, "label", "type", "kind", "event") || "Fee";
      const amount = strField(item, "amount", "lamports", "value");
      rows.push({
        label,
        value: amount ? `${formatLamportsAsSol(amount, 3)} SOL` : "—",
      });
    }
    return rows;
  }, [fees]);

  return (
    <section className="vault-profile flow-page">
      <button type="button" className="btn btn-ghost profile-back" onClick={onBack}>
        ← Back
      </button>

      {loading ? (
        <ShimmerList count={5} />
      ) : error ? (
        <div className="err">{error}</div>
      ) : profile ? (
        <>
          <div className="flow-card vault-profile-overview">
            <div className="vault-detail-header">
              <div className={`vault-detail-avatar-wrap${isClosed ? " is-closed" : ""}`}>
                {avatar ? (
                  <img className="vault-detail-avatar" src={avatar} alt="" width={40} height={40} />
                ) : (
                  <div className="token-icon vault-detail-token-icon">1V</div>
                )}
                {isClosed ? (
                  <span className="badge-dot badge-closed" title="Closed">
                    ✕
                  </span>
                ) : null}
              </div>
              <div className="vault-detail-title-block">
                <h2 className="vault-profile-name">{String(profile.name ?? "Vault")}</h2>
                <div className="vault-detail-chips">
                  <span className="chip">{String(typeLabel).toUpperCase()}</span>
                  {vaultStatus ? (
                    <span className={`chip${isClosed ? " chip-warn" : ""}`}>
                      {vaultStatus.toUpperCase()}
                    </span>
                  ) : null}
                  {verified && handle ? (
                    <span className="chip">✓ @{handle.replace(/^@/, "")}</span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="vault-summary-nav">
              <SolAmount
                value={formatLamportsAsSol(String(profile.nav ?? "0"), 3)}
                unit="SOL NAV"
                size="display"
              />
            </div>

            <div className="vault-stat-grid">
              <div className="vault-stat-cell">
                <span className="vault-stat-label">Return</span>
                <span className="vault-stat-value">{fmtPct(profile.returnPct)}</span>
              </div>
              <div className="vault-stat-cell">
                <span className="vault-stat-label">Win rate</span>
                <span className="vault-stat-value">
                  {winRate != null ? `${(winRate * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
              <div className="vault-stat-cell">
                <span className="vault-stat-label">Followers</span>
                <span className="vault-stat-value">{profile.activeFollowers ?? 0}</span>
              </div>
              <div className="vault-stat-cell">
                <span className="vault-stat-label">Est. capital</span>
                <span className="vault-stat-value">
                  <SolAmount
                    value={formatLamportsAsSol(
                      String(profile.estimatedFollowerCapital ?? "0"),
                      2
                    )}
                    unit="SOL"
                    size="sm"
                  />
                </span>
              </div>
            </div>

            <div className="vault-profile-meta">
              <div className="vault-profile-meta-row">
                <span className="vault-profile-meta-label">Vault</span>
                <span className="mono vault-profile-meta-value">{shortAddr(vaultPubkey)}</span>
              </div>
              {profile.strategist ? (
                <div className="vault-profile-meta-row">
                  <span className="vault-profile-meta-label">Strategist</span>
                  <span className="mono vault-profile-meta-value">
                    {shortAddr(String(profile.strategist))}
                  </span>
                </div>
              ) : null}
            </div>

            {showPark ? (
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy}
                onClick={() => onPark?.(vaultPubkey)}
              >
                Park SOL
              </button>
            ) : isOwn ? (
              <div className="vault-profile-own">Your vault</div>
            ) : null}
          </div>

          <div className="seg">
            <div className="seg-track">
              {(
                [
                  ["capital", "Capital"],
                  ["holdings", "Holdings"],
                  ["positions", "Positions"],
                  ["activity", "Activity"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`seg-btn${tab === id ? " active" : ""}`}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab === "capital" ? (
            <div className="flow-card vault-profile-tab">
              {breakdown ? (
                <>
                  <div className="vault-summary-park-panel">
                    <div className="vault-summary-stats vault-summary-stats--3">
                      <div className="vault-stat">
                        <span className="vault-stat-label">My Park</span>
                        <span className="vault-stat-value">
                          <SolAmount value={myPark} unit="SOL" size="sm" />
                        </span>
                      </div>
                      <div className="vault-stat">
                        <span className="vault-stat-label">Investor</span>
                        <span className="vault-stat-value">
                          <SolAmount value={investorPark} unit="SOL" size="sm" />
                        </span>
                      </div>
                      <div className="vault-stat">
                        <span className="vault-stat-label">Total</span>
                        <span className="vault-stat-value">
                          <SolAmount value={totalPark} unit="SOL" size="sm" />
                        </span>
                      </div>
                    </div>
                  </div>
                  {walletAvail != null ? (
                    <div className="vault-profile-wallet-avail">
                      <span>Wallet available</span>
                      <SolAmount value={walletAvail} unit="SOL" size="sm" />
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="empty-hint">Park breakdown unavailable.</div>
              )}
            </div>
          ) : null}

          {tab === "holdings" ? (
            <div className="flow-card vault-profile-tab">
              {holdings.length === 0 ? (
                <div className="empty-hint">No holdings indexed yet.</div>
              ) : (
                <div className="list">
                  {strategistRows.length > 0 ? (
                    <>
                      <div className="vault-holdings-group">Strategist</div>
                      {strategistRows.map((h, i) => (
                        <HoldingRow key={`s-${h.investor ?? i}`} row={h} />
                      ))}
                    </>
                  ) : null}
                  {investorRows.length > 0 ? (
                    <>
                      <div className="vault-holdings-group">Investors</div>
                      {investorRows.map((h, i) => (
                        <HoldingRow key={`i-${h.investor ?? i}`} row={h} />
                      ))}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {tab === "positions" ? (
            <div className="flow-card vault-profile-tab">
              {positions.length === 0 ? (
                <div className="empty-hint">No open positions.</div>
              ) : (
                <div className="list">
                  {positions.map((pos) => (
                    <div key={pos.positionId} className="row-card">
                      <div className="token-icon">#{pos.positionId}</div>
                      <div className="row-main">
                        <div className="row-title">Position {pos.positionId}</div>
                        <div className="row-sub mono">
                          {shortAddr(pos.outputMint || pos.inputMint)}
                          {pos.tradeId ? ` · trade ${pos.tradeId}` : ""}
                        </div>
                      </div>
                      <div className="row-right">
                        <div className="row-value">
                          <SolAmount
                            value={formatLamportsAsSol(
                              pos.currentValue || pos.entryValue,
                              3
                            )}
                            unit="SOL"
                            size="md"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === "activity" ? (
            <div className="flow-card vault-profile-tab">
              {trades.length === 0 && feeRows.length === 0 ? (
                <div className="empty-hint">No trades or fee activity yet.</div>
              ) : (
                <div className="list">
                  {trades.length > 0 ? (
                    <>
                      <div className="vault-holdings-group">Trades</div>
                      {trades.slice(0, 20).map((t, i) => {
                        const id =
                          strField(t, "trade_id", "tradeId") || String(i + 1);
                        const mint = strField(
                          t,
                          "output_mint",
                          "outputMint",
                          "input_mint",
                          "inputMint"
                        );
                        const status = strField(t, "status") || "—";
                        const value =
                          strField(t, "amount", "value", "entry_value", "entryValue") ||
                          "0";
                        return (
                          <div key={`t-${id}-${i}`} className="row-card">
                            <div className="token-icon">T</div>
                            <div className="row-main">
                              <div className="row-title">Trade #{id}</div>
                              <div className="row-sub mono">
                                {mint ? shortAddr(mint) : "—"} · {status}
                              </div>
                            </div>
                            <div className="row-right">
                              <div className="row-value">
                                <SolAmount
                                  value={formatLamportsAsSol(value, 3)}
                                  unit="SOL"
                                  size="md"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  ) : null}
                  {feeRows.length > 0 ? (
                    <>
                      <div className="vault-holdings-group">Fees</div>
                      {feeRows.map((row, i) => (
                        <div key={`f-${row.label}-${i}`} className="row-card">
                          <div className="token-icon">₣</div>
                          <div className="row-main">
                            <div className="row-title">{row.label}</div>
                          </div>
                          <div className="row-right">
                            <div className="row-value">{row.value}</div>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function HoldingRow({ row }: { row: VaultHoldingRow }) {
  const investor = String(row.investor ?? "");
  const deposited = String(row.deposited ?? row.shares ?? "0");
  const remaining = String(
    row.remaining_parked ?? row.remainingParked ?? row.deposited ?? row.shares ?? "0"
  );
  return (
    <div className="row-card">
      <div className="token-icon">H</div>
      <div className="row-main">
        <div className="row-title mono">{shortAddr(investor)}</div>
        <div className="row-sub">
          Deposited {formatLamportsAsSol(deposited, 2)} · Remaining{" "}
          {formatLamportsAsSol(remaining, 2)} SOL
        </div>
      </div>
      <div className="row-right">
        <div className="row-value">
          <SolAmount value={formatLamportsAsSol(remaining, 3)} unit="SOL" size="md" />
        </div>
      </div>
    </div>
  );
}
