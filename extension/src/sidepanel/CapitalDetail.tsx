import { useEffect, useMemo, useState } from "react";
import type { PipelineEstimate } from "../lib/estimate";
import { formatLamportsAsSol } from "../lib/estimate";
import {
  listWithdrawalsByVault,
  normalizeRole,
  type DepositIntent,
  type WithdrawalRow,
} from "../lib/indexer/client";
import { ShimmerList } from "./Shimmer";
import { SolAmount } from "./SolAmount";

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function formatWhen(raw: string | number | null | undefined) {
  if (raw == null || raw === "") return "—";
  try {
    const d =
      typeof raw === "number"
        ? new Date(raw > 1e12 ? raw : raw * 1000)
        : new Date(raw);
    if (Number.isNaN(d.getTime())) return String(raw);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(raw);
  }
}

function asBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  return 0n;
}

type CapitalActivity = {
  id: string;
  kind: "in" | "out";
  title: string;
  sub: string;
  lamports: string;
  at: number;
  status?: string;
};

function depositToActivity(d: DepositIntent, i: number): CapitalActivity {
  const role = normalizeRole(d.role) === "strategies" ? "Strategist" : "Investor";
  const status = String(d.status ?? "—");
  const when = d.created_at ?? d.updated_at;
  return {
    id: `in-${d.id ?? d.signature ?? i}`,
    kind: "in",
    title: `Park in · ${role}`,
    sub: `${shortAddr(String(d.investor ?? ""))} · ${status} · ${formatWhen(when as string)}`,
    lamports: String(d.amount ?? "0"),
    at: when ? new Date(String(when)).getTime() || 0 : 0,
    status,
  };
}

function withdrawalToActivity(w: WithdrawalRow, i: number): CapitalActivity {
  const net = w.net_amount ?? w.gross_amount ?? "0";
  const when = w.block_time ?? w.created_at;
  const at =
    typeof when === "number"
      ? when > 1e12
        ? when
        : when * 1000
      : when
        ? new Date(String(when)).getTime() || 0
        : 0;
  return {
    id: `out-${w.id ?? w.signature ?? i}`,
    kind: "out",
    title: "Withdraw out",
    sub: `${shortAddr(String(w.investor ?? ""))} · ${formatWhen(when)}`,
    lamports: String(net),
    at,
  };
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
  pipelineLoading,
}: CapitalDetailProps) {
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);

  useEffect(() => {
    if (!activeVault) {
      setWithdrawals([]);
      return;
    }
    let cancelled = false;
    setWithdrawalsLoading(true);
    void listWithdrawalsByVault(activeVault)
      .then((rows) => {
        if (!cancelled) setWithdrawals(rows);
      })
      .catch(() => {
        if (!cancelled) setWithdrawals([]);
      })
      .finally(() => {
        if (!cancelled) setWithdrawalsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeVault]);

  const activities = useMemo(() => {
    const deposits = pipeline?.deposits ?? [];
    const items: CapitalActivity[] = [
      ...deposits.map(depositToActivity),
      ...withdrawals.map(withdrawalToActivity),
    ];
    items.sort((a, b) => b.at - a.at);
    return items;
  }, [pipeline?.deposits, withdrawals]);

  const totals = useMemo(() => {
    let inn = 0n;
    let out = 0n;
    for (const a of activities) {
      const n = asBigInt(a.lamports);
      if (a.kind === "in") inn += n;
      else out += n;
    }
    return { inn, out };
  }, [activities]);

  if (pipelineLoading && !pipeline) {
    return <ShimmerList count={4} />;
  }
  if (!activeVault || !pipeline) {
    return <div className="empty-hint">Select a vault to see capital in / out.</div>;
  }

  const loading = withdrawalsLoading && activities.length === 0;

  return (
    <>
      <div className="capital-flow-summary">
        <div className="capital-flow-pill in">
          <span className="capital-flow-label">In</span>
          <SolAmount value={formatLamportsAsSol(totals.inn.toString(), 3)} unit="SOL" size="sm" />
        </div>
        <div className="capital-flow-pill out">
          <span className="capital-flow-label">Out</span>
          <SolAmount value={formatLamportsAsSol(totals.out.toString(), 3)} unit="SOL" size="sm" />
        </div>
      </div>

      <div className="section-label">Activity</div>

      {loading ? <ShimmerList count={3} /> : null}

      {!loading && activities.length === 0 ? (
        <div className="empty-hint">
          No park / withdraw activity yet for this vault. Park SOL to see it here.
        </div>
      ) : null}

      {activities.map((a) => (
        <div key={a.id} className={`row-card capital-activity ${a.kind}`}>
          <div className={`token-icon capital-dir ${a.kind}`}>{a.kind === "in" ? "↓" : "↑"}</div>
          <div className="row-main">
            <div className="row-title">{a.title}</div>
            <div className="row-sub mono">{a.sub}</div>
          </div>
          <div className="row-right">
            <div className={`row-value capital-amt ${a.kind}`}>
              {a.kind === "in" ? "+" : "−"}
              <SolAmount value={formatLamportsAsSol(a.lamports, 3)} unit="SOL" size="md" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
