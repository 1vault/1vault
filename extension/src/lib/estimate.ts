/**
 * Capital pipeline estimate — committed / incoming / mandated / projected.
 * Math mirrors ProgramID/onevault-program/sdk/pda.ts (NAV = assets + position_value).
 */
import {
  listDepositsByVault,
  listMandatesByVault,
  normalizeRole,
  type DepositIntent,
  type InvestorMandate,
} from "./indexer/client";
import { getVault } from "./api";

export function calculateNav(totalAssets: bigint, positionValue: bigint): bigint {
  return totalAssets + positionValue;
}

export function calculateSharePrice(
  nav: bigint,
  totalShares: bigint,
  sharePriceScale = 1_000_000n
): bigint {
  if (totalShares === 0n) return sharePriceScale;
  return (nav * sharePriceScale) / totalShares;
}

export function depositSharesForAmount(
  depositAmount: bigint,
  totalShares: bigint,
  nav: bigint
): bigint {
  if (totalShares === 0n) return depositAmount;
  if (nav === 0n) return 0n;
  return (depositAmount * totalShares) / nav;
}

function asBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  if (v && typeof v === "object" && "toString" in v) {
    const s = String((v as { toString(): string }).toString());
    if (/^\d+$/.test(s)) return BigInt(s);
  }
  return 0n;
}

function pickVaultFields(raw: Record<string, unknown>): {
  totalAssets: bigint;
  positionValue: bigint;
  totalShares: bigint;
  strategistShares: bigint;
} {
  const vault =
    (raw.vault as Record<string, unknown> | undefined) ??
    (raw.data as Record<string, unknown> | undefined) ??
    raw;
  const totalAssets = asBigInt(
    vault.total_assets ?? vault.totalAssets ?? vault.nav ?? 0
  );
  const positionValue = asBigInt(vault.position_value ?? vault.positionValue ?? 0);
  const totalShares = asBigInt(vault.total_shares ?? vault.totalShares ?? 0);
  // Prefer explicit strategist holding if present; else 0 (caller can refine via holdings).
  const strategistShares = asBigInt(
    vault.strategist_shares ?? vault.strategistShares ?? 0
  );
  return { totalAssets, positionValue, totalShares, strategistShares };
}

export type PipelineEstimate = {
  vault: string;
  nav: string;
  totalAssets: string;
  positionValue: string;
  totalShares: string;
  sharePrice: string;
  incoming: {
    pendingLamports: string;
    submittedLamports: string;
    count: number;
  };
  mandated: {
    lamports: string;
    count: number;
    avgTakeProfitBps: number | null;
    avgStopLossBps: number | null;
  };
  projected: {
    nav: string;
    buyingPower: string;
    newShares: string;
    strategistOwnershipBpsAfter: number | null;
  };
  deposits: DepositIntent[];
  mandates: InvestorMandate[];
};

function sumAmounts(
  rows: Array<{ amount?: string | number; park_amount?: string | number; status?: string }>,
  field: "amount" | "park_amount",
  statusFilter?: (s: string) => boolean
): { sum: bigint; count: number } {
  let sum = 0n;
  let count = 0;
  for (const r of rows) {
    if (statusFilter && !statusFilter(String(r.status ?? ""))) continue;
    const raw = field === "amount" ? r.amount : r.park_amount;
    const n = asBigInt(raw);
    if (n > 0n) {
      sum += n;
      count += 1;
    }
  }
  return { sum, count };
}

export async function estimatePipeline(vaultPubkey: string): Promise<PipelineEstimate> {
  const [vaultResult, depositsResult, mandatesResult] = await Promise.allSettled([
    getVault(vaultPubkey),
    listDepositsByVault(vaultPubkey),
    listMandatesByVault(vaultPubkey),
  ]);

  if (vaultResult.status === "rejected") {
    throw vaultResult.reason;
  }
  const vaultRaw = vaultResult.value;
  const deposits = depositsResult.status === "fulfilled" ? depositsResult.value : [];
  const mandates = mandatesResult.status === "fulfilled" ? mandatesResult.value : [];

  const fields = pickVaultFields(vaultRaw as Record<string, unknown>);
  const nav = calculateNav(fields.totalAssets, fields.positionValue);
  const sharePrice = calculateSharePrice(nav, fields.totalShares);

  const pending = sumAmounts(deposits, "amount", (s) => s === "pending");
  const submitted = sumAmounts(deposits, "amount", (s) => s === "submitted");
  const incomingSum = pending.sum + submitted.sum;

  const mandated = sumAmounts(mandates, "park_amount");
  const tpVals = mandates
    .map((m) => m.take_profit_bps)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const slVals = mandates
    .map((m) => m.stop_loss_bps)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const avg = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  const projectedNav = nav + incomingSum;
  const buyingPower = fields.totalAssets + incomingSum;
  const newShares = depositSharesForAmount(incomingSum, fields.totalShares, nav);
  const totalSharesAfter = fields.totalShares + newShares;
  let strategistOwnershipBpsAfter: number | null = null;
  if (totalSharesAfter > 0n && fields.strategistShares > 0n) {
    strategistOwnershipBpsAfter = Number(
      (fields.strategistShares * 10_000n) / totalSharesAfter
    );
  }

  // Touch normalizeRole so role mix is available for future per-role breakdowns.
  void deposits.map((d) => normalizeRole(d.role));

  return {
    vault: vaultPubkey,
    nav: nav.toString(),
    totalAssets: fields.totalAssets.toString(),
    positionValue: fields.positionValue.toString(),
    totalShares: fields.totalShares.toString(),
    sharePrice: sharePrice.toString(),
    incoming: {
      pendingLamports: pending.sum.toString(),
      submittedLamports: submitted.sum.toString(),
      count: pending.count + submitted.count,
    },
    mandated: {
      lamports: mandated.sum.toString(),
      count: mandated.count,
      avgTakeProfitBps: avg(tpVals),
      avgStopLossBps: avg(slVals),
    },
    projected: {
      nav: projectedNav.toString(),
      buyingPower: buyingPower.toString(),
      newShares: newShares.toString(),
      strategistOwnershipBpsAfter,
    },
    deposits,
    mandates,
  };
}

export function formatLamportsAsSol(lamports: string | bigint, digits = 4): string {
  const n = typeof lamports === "bigint" ? lamports : BigInt(lamports || "0");
  const whole = n / 1_000_000_000n;
  const frac = n % 1_000_000_000n;
  const fracStr = frac.toString().padStart(9, "0").slice(0, digits);
  return `${whole}.${fracStr}`;
}
