/**
 * Capital pipeline estimate — committed / incoming / mandated / projected.
 * Math mirrors ProgramID/onevault-program/sdk/pda.ts (NAV = assets + position_value).
 */
import {
  listDepositsByVault,
  listMandatesByVault,
  normalizeRole,
  type ApiRole,
  type DepositIntent,
  type InvestorMandate,
} from "./indexer/client";
import { getVault, getVaultHoldings } from "./api";

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
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return 0n;
    if (v > 0 && v < 1000 && !Number.isInteger(v)) return BigInt(Math.floor(v * 1e9));
    return BigInt(Math.trunc(v));
  }
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (/^\d+$/.test(s)) return BigInt(s);
    if (/^\d*\.\d+$/.test(s) || /^\d+\.\d*$/.test(s)) {
      const n = Number(s);
      if (!Number.isFinite(n) || n <= 0) return 0n;
      return BigInt(Math.floor(n * 1e9 + 1e-9));
    }
  }
  if (v && typeof v === "object" && "toString" in v) {
    const s = String((v as { toString(): string }).toString()).trim();
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

export type RoleParkSlice = {
  committed: string;
  incoming: string;
  mandated: string;
};

export type ParkBreakdown = {
  strategist: RoleParkSlice;
  investor: RoleParkSlice;
  total: RoleParkSlice & { projected: string };
  walletAvailable: string | null;
  strategistPubkey: string | null;
};

function sumDepositsByRole(
  deposits: DepositIntent[],
  role: ApiRole,
  statusFilter?: (s: string) => boolean
): bigint {
  let sum = 0n;
  for (const d of deposits) {
    if (normalizeRole(d.role) !== role) continue;
    if (statusFilter && !statusFilter(String(d.status ?? ""))) continue;
    sum += asBigInt(d.amount);
  }
  return sum;
}

function sumMandatesByRole(mandates: InvestorMandate[], role: ApiRole): bigint {
  let sum = 0n;
  for (const m of mandates) {
    if (normalizeRole(m.role) !== role) continue;
    sum += asBigInt(m.park_amount);
  }
  return sum;
}

function sumHoldingsByRole(
  items: Array<Record<string, unknown>>,
  role: ApiRole
): bigint {
  let sum = 0n;
  for (const row of items) {
    const r = normalizeRole(String(row.role ?? ""));
    if (r !== role) continue;
    sum += asBigInt(row.remaining_parked ?? row.remainingParked ?? 0);
  }
  return sum;
}

export async function estimateParkBreakdown(
  vaultPubkey: string,
  pipeline?: PipelineEstimate | null,
  walletPubkey?: string | null,
  walletBalanceLamports?: string | null
): Promise<ParkBreakdown> {
  const [pipelineResult, holdingsResult] = await Promise.allSettled([
    pipeline ? Promise.resolve(pipeline) : estimatePipeline(vaultPubkey),
    getVaultHoldings(vaultPubkey),
  ]);

  const pipe =
    pipelineResult.status === "fulfilled"
      ? pipelineResult.value
      : await estimatePipeline(vaultPubkey).catch(() => null);

  const holdings =
    holdingsResult.status === "fulfilled"
      ? (holdingsResult.value.items ?? [])
      : [];

  const deposits = pipe?.deposits ?? [];
  const mandates = pipe?.mandates ?? [];

  const incomingFilter = (s: string) => s === "pending" || s === "submitted";

  const strategistCommitted = sumHoldingsByRole(holdings, "strategies");
  const investorCommitted = sumHoldingsByRole(holdings, "investors");
  const strategistIncoming = sumDepositsByRole(deposits, "strategies", incomingFilter);
  const investorIncoming = sumDepositsByRole(deposits, "investors", incomingFilter);
  const strategistMandated = sumMandatesByRole(mandates, "strategies");
  const investorMandated = sumMandatesByRole(mandates, "investors");

  const totalCommitted = strategistCommitted + investorCommitted;
  const totalIncoming = strategistIncoming + investorIncoming;
  const totalMandated = strategistMandated + investorMandated;
  const projected = pipe?.projected.nav ?? totalCommitted.toString();

  let strategistPubkey: string | null = null;
  try {
    const vaultRaw = await getVault(vaultPubkey);
    const vault =
      (vaultRaw.vault as Record<string, unknown> | undefined) ??
      (vaultRaw as Record<string, unknown>);
    strategistPubkey = String(vault.strategist ?? vault.strategist_pubkey ?? "") || null;
    if (strategistPubkey && strategistPubkey.length < 32) strategistPubkey = null;
  } catch {
    strategistPubkey = null;
  }

  return {
    strategist: {
      committed: strategistCommitted.toString(),
      incoming: strategistIncoming.toString(),
      mandated: strategistMandated.toString(),
    },
    investor: {
      committed: investorCommitted.toString(),
      incoming: investorIncoming.toString(),
      mandated: investorMandated.toString(),
    },
    total: {
      committed: totalCommitted.toString(),
      incoming: totalIncoming.toString(),
      mandated: totalMandated.toString(),
      projected,
    },
    walletAvailable: walletBalanceLamports ?? null,
    strategistPubkey,
  };
}
