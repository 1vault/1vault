import { formatLamportsAsSol, type PipelineEstimate } from "../lib/estimate";
import { SolAmount } from "./SolAmount";

type PipelineBar = {
  c: number;
  i: number;
  m: number;
  incoming: bigint;
};

type VaultSummaryProps = {
  name: string;
  typeLabel?: string;
  pipeline: PipelineEstimate | null;
  bar: PipelineBar | null;
};

export function VaultSummary({ name, typeLabel, pipeline, bar }: VaultSummaryProps) {
  const nav = pipeline ? formatLamportsAsSol(pipeline.nav, 3) : "—";
  const buyingPower = pipeline ? formatLamportsAsSol(pipeline.projected.buyingPower, 3) : "—";
  const incoming = bar ? formatLamportsAsSol(bar.incoming.toString(), 3) : "0";

  return (
    <div className="vault-summary">
      <div className="vault-summary-head">
        <span className="vault-summary-name">{name}</span>
        {typeLabel ? <span className="chip">{typeLabel}</span> : null}
      </div>

      <div className="vault-summary-nav">
        <SolAmount value={nav} unit="SOL NAV" size="display" />
      </div>

      <div className="vault-summary-stats">
        <div className="vault-stat">
          <span className="vault-stat-label">Buying power</span>
          <span className="vault-stat-value">
            <SolAmount value={buyingPower} unit="SOL" size="sm" />
          </span>
        </div>
        <div className="vault-stat">
          <span className="vault-stat-label">Incoming</span>
          <span className="vault-stat-value">
            <SolAmount value={incoming} unit="SOL" size="sm" />
          </span>
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
      ) : null}
    </div>
  );
}

export function VaultSummaryShimmer() {
  return (
    <div className="vault-summary" aria-hidden>
      <div className="vault-summary-head">
        <span className="shimmer shimmer-line shimmer-line-sm" style={{ width: "32%" }} />
        <span className="shimmer shimmer-line shimmer-line-xs" style={{ width: 52, borderRadius: 999 }} />
      </div>
      <span className="shimmer shimmer-line shimmer-nav" />
      <div className="vault-summary-stats">
        <span className="shimmer vault-stat-shimmer" />
        <span className="shimmer vault-stat-shimmer" />
      </div>
      <span className="shimmer shimmer-bar" />
    </div>
  );
}
