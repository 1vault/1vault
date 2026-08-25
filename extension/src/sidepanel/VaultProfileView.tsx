import { useEffect, useMemo, useState } from "react";
import {
  getVault,
  getVaultHoldings,
  getVaultProfile,
  getWalletStats,
  type VaultHoldingRow,
  type VaultProfile,
} from "../lib/api/client";
import { normalizeRole } from "../lib/indexer/client";
import { sendBg } from "../lib/messaging";
import type { ParkBreakdown } from "../lib/estimate";
import { formatLamportsAsSol } from "../lib/estimate";
import { HeroHead } from "./InfoTip";
import { ParkBreakdown as ParkBreakdownView } from "./ParkBreakdown";
import { ShimmerList } from "./Shimmer";
import { SolAmount } from "./SolAmount";

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
  const [loading, setLoading] = useState(!seed);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [profResult, vaultRaw, parkBd, holdingsData] = await Promise.all([
          getVaultProfile(vaultPubkey).catch(() => null),
          getVault(vaultPubkey).catch(() => ({}) as Record<string, unknown>),
          sendBg<ParkBreakdown>({ type: "PARK_BREAKDOWN", vault: vaultPubkey }).catch(() => null),
          getVaultHoldings(vaultPubkey).catch(() => ({ items: [] as VaultHoldingRow[] })),
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
            estimatedFollowerCapital:
              (vault.estimatedFollowerCapital ?? vault.estimated_follower_capital ?? null) as
                | string
                | number
                | null,
          });
        } else if (!seed) {
          setError("Vault not found");
        }

        setBreakdown(parkBd);
        setHoldings(holdingsData.items ?? []);
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

  const { strategistRows, investorRows } = useMemo(() => {
    const strat: VaultHoldingRow[] = [];
    const inv: VaultHoldingRow[] = [];
    for (const h of holdings) {
      if (normalizeRole(String(h.role ?? "")) === "strategies") strat.push(h);
      else inv.push(h);
    }
    return { strategistRows: strat, investorRows: inv };
  }, [holdings]);

  const typeLabel = profile?.vaultTypeLabel ?? profile?.vaultType ?? "pooled";

  return (
    <section className="vault-profile">
      <button type="button" className="btn btn-ghost profile-back" onClick={onBack}>
        ← Back
      </button>

      {loading ? (
        <ShimmerList count={5} />
      ) : error ? (
        <div className="err">{error}</div>
      ) : profile ? (
        <>
          <section className="hero">
            <div className="vault-detail-header">
              {avatar ? (
                <img className="vault-detail-avatar" src={avatar} alt="" width={36} height={36} />
              ) : (
                <div className="token-icon">1V</div>
              )}
              <div className="vault-detail-title-block">
                <HeroHead
                  title={String(profile.name ?? "Vault")}
                  info={`${typeLabel} vault · ${fmtPct(profile.returnPct)} return`}
                />
                <div className="vault-detail-chips">
                  <span className="chip">{String(typeLabel).toUpperCase()}</span>
                  {vaultStatus ? (
                    <span
                      className={`chip${vaultStatus !== "Active" ? " chip-warn" : ""}`}
                    >
                      {vaultStatus.toUpperCase()}
                    </span>
                  ) : null}
                  {verified && handle ? (
                    <span className="chip">✓ @{handle.replace(/^@/, "")}</span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="vault-summary-nav" style={{ marginTop: 10 }}>
              <SolAmount
                value={formatLamportsAsSol(String(profile.nav ?? "0"), 3)}
                unit="SOL NAV"
                size="display"
              />
            </div>

            <div className="vault-summary-stats vault-summary-stats--3" style={{ marginTop: 10 }}>
              <div className="vault-stat">
                <span className="vault-stat-label">Return</span>
                <span className="vault-stat-value">{fmtPct(profile.returnPct)}</span>
              </div>
              <div className="vault-stat">
                <span className="vault-stat-label">Win rate</span>
                <span className="vault-stat-value">
                  {winRate != null ? `${(winRate * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
              <div className="vault-stat">
                <span className="vault-stat-label">Followers</span>
                <span className="vault-stat-value">{profile.activeFollowers ?? 0}</span>
              </div>
            </div>

            <div className="vault-summary-stats" style={{ marginTop: 8 }}>
              <div className="vault-stat">
                <span className="vault-stat-label">Est. follower capital</span>
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

            {profile.strategist ? (
              <div className="row-card" style={{ marginTop: 10 }}>
                <div className="token-icon">DG</div>
                <div className="row-main">
                  <div className="row-title">Strategist</div>
                  <div className="row-sub mono">{shortAddr(String(profile.strategist))}</div>
                </div>
              </div>
            ) : null}
          </section>

          {breakdown ? (
            <div className="list">
              <ParkBreakdownView breakdown={breakdown} />
            </div>
          ) : null}

          <div className="section-label">Holdings</div>
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

          {showPark ? (
            <div className="hero-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy}
                onClick={() => onPark?.(vaultPubkey)}
              >
                Park SOL
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function HoldingRow({ row }: { row: VaultHoldingRow }) {
  const investor = String(row.investor ?? "");
  const parked = String(
    row.remaining_parked ?? row.remainingParked ?? row.deposited ?? row.shares ?? "0"
  );
  return (
    <div className="row-card">
      <div className="token-icon">H</div>
      <div className="row-main">
        <div className="row-title mono">{shortAddr(investor)}</div>
        <div className="row-sub">Parked</div>
      </div>
      <div className="row-right">
        <div className="row-value">
          <SolAmount value={formatLamportsAsSol(parked, 3)} unit="SOL" size="md" />
        </div>
      </div>
    </div>
  );
}
