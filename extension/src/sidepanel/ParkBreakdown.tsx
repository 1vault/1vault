import { formatLamportsAsSol, type ParkBreakdown } from "../lib/estimate";
import { SolAmount } from "./SolAmount";

type ParkBreakdownProps = {
  breakdown: ParkBreakdown | null;
  loading?: boolean;
};

function BreakdownRow({
  icon,
  title,
  sub,
  lamports,
  highlight,
}: {
  icon: string;
  title: string;
  sub: string;
  lamports: string;
  highlight?: boolean;
}) {
  return (
    <div className={`row-card${highlight ? " active" : ""}`}>
      <div className="token-icon">{icon}</div>
      <div className="row-main">
        <div className="row-title">{title}</div>
        <div className="row-sub">{sub}</div>
      </div>
      <div className="row-right">
        <div className="row-value">
          <SolAmount value={formatLamportsAsSol(lamports, 3)} unit="SOL" size="md" />
        </div>
      </div>
    </div>
  );
}

export function ParkBreakdown({ breakdown, loading }: ParkBreakdownProps) {
  if (loading && !breakdown) {
    return <div className="empty-hint">Loading park breakdown…</div>;
  }
  if (!breakdown) return null;

  return (
    <>
      <div className="section-label">Park breakdown</div>
      <BreakdownRow
        icon="DG"
        title="Strategist park"
        sub="Committed in vault"
        lamports={breakdown.strategist.committed}
      />
      <BreakdownRow
        icon="RT"
        title="Investor park"
        sub="Committed in vault"
        lamports={breakdown.investor.committed}
      />
      <BreakdownRow
        icon="Σ"
        title="Total park"
        sub="Strategist + investor committed"
        lamports={breakdown.total.committed}
        highlight
      />
      {breakdown.walletAvailable != null ? (
        <BreakdownRow
          icon="◎"
          title="Wallet available"
          sub="Strategist SOL outside vault"
          lamports={breakdown.walletAvailable}
        />
      ) : null}
      {(BigInt(breakdown.strategist.incoming) > 0n ||
        BigInt(breakdown.investor.incoming) > 0n ||
        BigInt(breakdown.investor.mandated) > 0n) && (
        <div className="empty-hint" style={{ marginTop: 4 }}>
          Incoming: strategist{" "}
          {formatLamportsAsSol(breakdown.strategist.incoming, 2)} · investor{" "}
          {formatLamportsAsSol(breakdown.investor.incoming, 2)}
          {BigInt(breakdown.investor.mandated) > 0n
            ? ` · mandated ${formatLamportsAsSol(breakdown.investor.mandated, 2)}`
            : ""}
        </div>
      )}
    </>
  );
}
