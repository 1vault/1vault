import { useEffect, useState } from "react";
import { getInvestor } from "../lib/api/client";
import { formatLamportsAsSol } from "../lib/estimate";
import { ShimmerList } from "./Shimmer";
import { SolAmount } from "./SolAmount";

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

type HoldingRow = Record<string, unknown>;

export function HoldingsTab({
  investorPubkey,
  onWithdraw,
  busy,
}: {
  investorPubkey: string | null;
  onWithdraw?: (vault: string, shares: string) => void;
  busy?: boolean;
}) {
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!investorPubkey) {
      setHoldings([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getInvestor(investorPubkey)
      .then((data) => {
        if (!cancelled) setHoldings(data.holdings ?? []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setHoldings([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [investorPubkey]);

  if (!investorPubkey) {
    return <div className="empty-hint">Unlock wallet to view holdings.</div>;
  }
  if (loading) return <ShimmerList count={3} />;
  if (error) return <div className="err">{error}</div>;
  if (holdings.length === 0) {
    return <div className="empty-hint">No vault holdings yet — park SOL from Discover.</div>;
  }

  return (
    <div className="list">
      {holdings.map((h, i) => {
        const vault = String(h.vault ?? "");
        const parked = String(h.remaining_parked ?? h.remainingParked ?? h.shares ?? "0");
        const shares = String(h.shares ?? "0");
        return (
          <div key={`${vault}-${i}`} className="row-card">
            <div className="token-icon">H</div>
            <div className="row-main">
              <div className="row-title">Vault</div>
              <div className="row-sub mono">{shortAddr(vault)}</div>
            </div>
            <div className="row-right">
              <div className="row-value">
                <SolAmount value={formatLamportsAsSol(parked, 3)} unit="SOL" size="md" />
              </div>
              {onWithdraw && BigInt(shares) > 0n ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 6, fontSize: "var(--fs-xs)" }}
                  disabled={busy}
                  onClick={() => onWithdraw(vault, shares)}
                >
                  Withdraw
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
