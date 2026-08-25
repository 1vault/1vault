import { useEffect, useState } from "react";
import type { PipelineEstimate, ParkBreakdown as ParkBreakdownType } from "../lib/estimate";
import { formatLamportsAsSol } from "../lib/estimate";
import { sendBg } from "../lib/messaging";
import { normalizeRole } from "../lib/indexer/client";
import { ParkBreakdown } from "./ParkBreakdown";
import { ShimmerList } from "./Shimmer";
import { SolAmount } from "./SolAmount";

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

type CapitalDetailProps = {
  pipeline: PipelineEstimate | null;
  activeVault: string | null;
  walletPubkey: string | null;
  pipelineLoading: boolean;
};

export function CapitalDetail({
  pipeline,
  activeVault,
  walletPubkey,
  pipelineLoading,
}: CapitalDetailProps) {
  const [breakdown, setBreakdown] = useState<ParkBreakdownType | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  useEffect(() => {
    if (!activeVault || !pipeline) {
      setBreakdown(null);
      return;
    }
    let cancelled = false;
    setBreakdownLoading(true);
    void sendBg<ParkBreakdownType>({
      type: "PARK_BREAKDOWN",
      vault: activeVault,
      walletPubkey: walletPubkey ?? undefined,
    })
      .then((b) => {
        if (!cancelled) setBreakdown(b);
      })
      .catch(() => {
        if (!cancelled) setBreakdown(null);
      })
      .finally(() => {
        if (!cancelled) setBreakdownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeVault, pipeline, walletPubkey]);

  if (pipelineLoading && !pipeline) {
    return <ShimmerList count={3} />;
  }
  if (!pipeline) {
    return <div className="empty-hint">Select a vault to load capital pipeline.</div>;
  }

  return (
    <>
      <div className="row-card">
        <div className="token-icon">IN</div>
        <div className="row-main">
          <div className="row-title">Incoming intents</div>
          <div className="row-sub">{pipeline.incoming.count} pending + submitted</div>
        </div>
        <div className="row-right">
          <div className="row-value">
            <SolAmount
              value={formatLamportsAsSol(
                (
                  BigInt(pipeline.incoming.pendingLamports) +
                  BigInt(pipeline.incoming.submittedLamports)
                ).toString(),
                3
              )}
              unit="SOL"
              size="md"
            />
          </div>
        </div>
      </div>
      <div className="row-card">
        <div className="token-icon">MD</div>
        <div className="row-main">
          <div className="row-title">Mandates</div>
          <div className="row-sub">
            {pipeline.mandated.count} retail · TP {pipeline.mandated.avgTakeProfitBps ?? "—"} / SL{" "}
            {pipeline.mandated.avgStopLossBps ?? "—"} bps
          </div>
        </div>
        <div className="row-right">
          <div className="row-value">
            <SolAmount
              value={formatLamportsAsSol(pipeline.mandated.lamports, 3)}
              unit="SOL"
              size="md"
            />
          </div>
        </div>
      </div>
      <div className="row-card">
        <div className="token-icon">BP</div>
        <div className="row-main">
          <div className="row-title">Buying power</div>
          <div className="row-sub">Assets + incoming</div>
        </div>
        <div className="row-right">
          <div className="row-value">
            <SolAmount
              value={formatLamportsAsSol(pipeline.projected.buyingPower, 3)}
              unit="SOL"
              size="md"
            />
          </div>
        </div>
      </div>

      <ParkBreakdown breakdown={breakdown} loading={breakdownLoading} />

      {(pipeline.deposits.length > 0 || pipeline.mandates.length > 0) && (
        <>
          <div className="section-label">Detail</div>
          {pipeline.deposits.map((d, i) => (
            <div key={`dep-${d.id ?? i}`} className="row-card">
              <div className="token-icon">D</div>
              <div className="row-main">
                <div className="row-title">
                  Deposit · {normalizeRole(d.role) === "strategies" ? "Strategist" : "Investor"}
                </div>
                <div className="row-sub mono">
                  {shortAddr(String(d.investor ?? ""))} · {String(d.status ?? "—")}
                </div>
              </div>
              <div className="row-right">
                <div className="row-value">
                  <SolAmount
                    value={formatLamportsAsSol(String(d.amount ?? "0"), 3)}
                    unit="SOL"
                    size="md"
                  />
                </div>
              </div>
            </div>
          ))}
          {pipeline.mandates.map((m, i) => (
            <div key={`man-${m.investor ?? i}`} className="row-card">
              <div className="token-icon">M</div>
              <div className="row-main">
                <div className="row-title">
                  Mandate · {normalizeRole(m.role) === "strategies" ? "Strategist" : "Investor"}
                </div>
                <div className="row-sub mono">
                  {shortAddr(String(m.investor ?? ""))} · TP {m.take_profit_bps ?? "—"} / SL{" "}
                  {m.stop_loss_bps ?? "—"}
                </div>
              </div>
              <div className="row-right">
                <div className="row-value">
                  <SolAmount
                    value={formatLamportsAsSol(String(m.park_amount ?? "0"), 3)}
                    unit="SOL"
                    size="md"
                  />
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
