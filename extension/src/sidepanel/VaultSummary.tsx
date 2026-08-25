import { formatLamportsAsSol, type ParkBreakdown, type PipelineEstimate } from "../lib/estimate";
import { SolAmount } from "./SolAmount";

type PipelineBar = {
  c: number;
  i: number;
  m: number;
  incoming: bigint;
};

type VaultSummaryProps = {
  typeLabel?: string;
  pipeline: PipelineEstimate | null;
  parkBreakdown: ParkBreakdown | null;
  bar: PipelineBar | null;
};

export function VaultSummary({
  typeLabel,
  pipeline,
  parkBreakdown,
  bar,
}: VaultSummaryProps) {
  const walletBal =
    parkBreakdown?.walletAvailable != null
      ? formatLamportsAsSol(parkBreakdown.walletAvailable, 1)
      : "—";
  const myPark = parkBreakdown
    ? formatLamportsAsSol(parkBreakdown.strategist.committed, 0)
    : "—";
  const investorPark = parkBreakdown
    ? formatLamportsAsSol(parkBreakdown.investor.committed, 0)
    : "—";
  const totalPark = parkBreakdown
    ? formatLamportsAsSol(parkBreakdown.total.committed, 0)
    : "—";

  return (
    <div className="vault-summary">
      <div className="vault-summary-head">
        <span className="vault-summary-name">Wallet Balance</span>
        {typeLabel ? <span className="chip">{typeLabel}</span> : null}
      </div>

      <div className="vault-summary-nav">
        <SolAmount value={walletBal} unit="SOL" size="display" />
      </div>

      <div className="vault-summary-park-panel">
        <div className="vault-summary-stats vault-summary-stats--3">
          <div className="vault-stat">
            <span className="vault-stat-label">My Park</span>
            <span className="vault-stat-value">
              <SolAmount value={myPark} unit="SOL" size="sm" />
            </span>
          </div>
          <div className="vault-stat">
            <span className="vault-stat-label">Investor Park</span>
            <span className="vault-stat-value">
              <SolAmount value={investorPark} unit="SOL" size="sm" />
            </span>
          </div>
          <div className="vault-stat">
            <span className="vault-stat-label">Total Park</span>
            <span className="vault-stat-value">
              <SolAmount value={totalPark} unit="SOL" size="sm" />
            </span>
          </div>
        </div>
      </div>

      {bar ? (
        <div className="vault-pipeline">
          <div className="stack-bar" title="Committed / incoming / mandated">
            <span style={{ width: `${bar.c}%`, background: "var(--accent)" }} />
            <span style={{ width: `${bar.i}%`, background: "var(--accent-bright)" }} />
            <span style={{ width: `${bar.m}%`, background: "rgba(255,255,255,0.22)" }} />
          </div>
          <div className="legend legend-compact">
            <span>
              <i style={{ background: "var(--accent)" }} />
              Committed
            </span>
            <span>
              <i style={{ background: "var(--accent-bright)" }} />
              Incoming
            </span>
            <span>
              <i style={{ background: "rgba(255,255,255,0.22)" }} />
              Mandated
            </span>
          </div>
        </div>
      ) : pipeline ? (
        <div className="vault-pipeline vault-pipeline--empty" aria-hidden />
      ) : null}
    </div>
  );
}

export function VaultSummaryShimmer() {
  return (
    <div className="vault-summary" aria-hidden>
      <div className="vault-summary-head">
        <span className="shimmer shimmer-line shimmer-line-sm" style={{ width: "40%" }} />
        <span className="shimmer shimmer-line shimmer-line-xs" style={{ width: 52, borderRadius: 999 }} />
      </div>
      <span className="shimmer shimmer-line shimmer-nav" />
      <div className="vault-summary-park-panel">
        <div className="vault-summary-stats vault-summary-stats--3">
          <span className="shimmer vault-stat-shimmer" />
          <span className="shimmer vault-stat-shimmer" />
          <span className="shimmer vault-stat-shimmer" />
        </div>
      </div>
      <span className="shimmer shimmer-bar" />
      <span className="shimmer shimmer-line shimmer-line-xs" style={{ width: "55%", margin: "0 auto" }} />
    </div>
  );
}
