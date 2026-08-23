import { apiUrl, readJson } from "./http";

export type WithdrawTarget = {
  vault: string;
  shares: number;
  strategist?: string;
  vaultTokenAccount?: string;
  vaultId?: number;
};

/** Per-vault redeem status for retail wallet (on-chain source of truth). */
export type WithdrawHolding = {
  vault: string;
  vaultId?: number;
  name?: string;
  onChainShares: number;
  redeemableShares: number;
  estLamports?: number;
  blockedReason?: string;
  strategist?: string;
  vaultTokenAccount?: string;
};

function shareMintPda(
  PublicKey: typeof import("@solana/web3.js").PublicKey,
  vault: string,
  programId: string
): string {
  const [pda] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("share_mint"), new PublicKey(vault).toBuffer()],
    new PublicKey(programId)
  );
  return pda.toBase58();
}

/** Read investor share balance from on-chain share mint ATA (source of truth). */
export async function fetchOnChainShares(
  rpcUrl: string,
  vault: string,
  investor: string,
  programId: string
): Promise<number> {
  const { Connection, PublicKey } = await import("@solana/web3.js");
  const { getAssociatedTokenAddressSync } = await import("@solana/spl-token");
  const mint = shareMintPda(PublicKey, vault, programId);
  const conn = new Connection(rpcUrl, "confirmed");
  const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(investor));
  const bal = await conn.getTokenAccountBalance(ata, "confirmed").catch(() => null);
  const n = Number(bal?.value?.amount ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

async function fetchVaultRow(
  vault: string,
  cluster: string
): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(apiUrl(`/v1/vaults/${vault}?cluster=${encodeURIComponent(cluster)}`));
    const json = await readJson<{ data?: Record<string, unknown> }>(res);
    return (json.data?.vault ?? json.data ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Cap withdraw shares by vault wSOL liquidity (matches original simulator). */
export async function capSharesByLiquidity(
  rpcUrl: string,
  vault: string,
  shares: number,
  cluster: string,
  row?: Record<string, unknown>
): Promise<number> {
  if (shares <= 0) return 0;
  try {
    const v = row ?? (await fetchVaultRow(vault, cluster));
    const totalShares = Number(v.totalShares ?? v.total_shares ?? 0);
    const totalAssets = Number(v.totalAssets ?? v.total_assets ?? 0);
    const posVal = Number(v.positionValue ?? v.position_value ?? 0);
    const nav = totalAssets + posVal;
    const vtaStr = String(v.vaultTokenAccount ?? v.vault_token_account ?? "");
    if (!totalShares || !nav || !vtaStr) return shares;

    const { Connection, PublicKey } = await import("@solana/web3.js");
    const { getAccount } = await import("@solana/spl-token");
    const conn = new Connection(rpcUrl, "confirmed");
    const vta = await getAccount(conn, new PublicKey(vtaStr), "confirmed");
    const vaultLiq = Number(vta.amount);
    const maxByLiq = Math.floor((vaultLiq * totalShares) / nav);
    if (maxByLiq <= 0) return 0;
    return Math.min(shares, maxByLiq);
  } catch {
    return shares;
  }
}

function estLamportsFromShares(
  shares: number,
  row: Record<string, unknown>
): number | undefined {
  const totalShares = Number(row.totalShares ?? row.total_shares ?? 0);
  const totalAssets = Number(row.totalAssets ?? row.total_assets ?? 0);
  const posVal = Number(row.positionValue ?? row.position_value ?? 0);
  const nav = totalAssets + posVal;
  if (!totalShares || !nav || shares <= 0) return undefined;
  return Math.floor((shares * nav) / totalShares);
}

/** All vaults where wallet holds on-chain shares — redeemable + blocked (no liquid wSOL). */
export async function fetchWithdrawHoldings(opts: {
  rpcUrl: string;
  cluster: string;
  investor: string;
  programId: string;
}): Promise<WithdrawHolding[]> {
  const vaults = new Set<string>();
  try {
    const res = await fetch(
      apiUrl(`/v1/investors/${opts.investor}?cluster=${encodeURIComponent(opts.cluster)}`)
    );
    const json = await readJson<{
      data?: { holdings?: Array<Record<string, unknown>> };
    }>(res);
    for (const h of json.data?.holdings ?? []) {
      const v = String(h.vault ?? "");
      if (v) vaults.add(v);
    }
  } catch {
    /* indexer optional */
  }

  const out: WithdrawHolding[] = [];
  for (const vault of vaults) {
    const onChain = await fetchOnChainShares(
      opts.rpcUrl,
      vault,
      opts.investor,
      opts.programId
    );
    if (onChain <= 0) continue;

    const row = await fetchVaultRow(vault, opts.cluster);
    const redeemable = await capSharesByLiquidity(
      opts.rpcUrl,
      vault,
      onChain,
      opts.cluster,
      row
    );
    const vaultId = Number(row.vaultId ?? row.vault_id ?? 0);
    const name = String(row.name ?? row.vault_name ?? "").trim() || undefined;
    const strategist = String(row.strategist ?? "").trim() || undefined;
    const vta = String(row.vaultTokenAccount ?? row.vault_token_account ?? "").trim() || undefined;

    let blockedReason: string | undefined;
    if (redeemable <= 0) {
      blockedReason = "no liquid wSOL (funds may be in open position)";
    } else if (redeemable < onChain) {
      blockedReason = `only ${formatShares(redeemable)} of ${formatShares(onChain)} shares liquid now`;
    }

    out.push({
      vault,
      vaultId: vaultId > 0 ? vaultId : undefined,
      name,
      onChainShares: onChain,
      redeemableShares: redeemable,
      estLamports: estLamportsFromShares(redeemable > 0 ? redeemable : onChain, row),
      blockedReason,
      strategist,
      vaultTokenAccount: vta,
    });
  }

  out.sort((a, b) => (a.vaultId ?? 0) - (b.vaultId ?? 0));
  return out;
}

function formatShares(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(3)} SOL-eq`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(3)}M units`;
  return String(n);
}

export function formatLamports(lamports?: number): string {
  if (lamports == null || !Number.isFinite(lamports)) return "—";
  return `${(lamports / 1_000_000_000).toFixed(4)} SOL`;
}

/** Vaults that can be redeemed right now. */
export async function fetchWithdrawTargets(opts: {
  rpcUrl: string;
  cluster: string;
  investor: string;
  programId: string;
  vaultFilter?: string;
}): Promise<WithdrawTarget[]> {
  const holdings = await fetchWithdrawHoldings(opts);
  const filtered = opts.vaultFilter
    ? holdings.filter((h) => h.vault === opts.vaultFilter)
    : holdings;

  return filtered
    .filter((h) => h.redeemableShares > 0)
    .map((h) => ({
      vault: h.vault,
      shares: h.redeemableShares,
      strategist: h.strategist,
      vaultTokenAccount: h.vaultTokenAccount,
      vaultId: h.vaultId,
    }));
}

export async function fetchWithdrawShares(opts: {
  rpcUrl: string;
  cluster: string;
  vault: string;
  investor: string;
  strategist?: string;
  vaultId?: number;
}): Promise<number> {
  const proto = await fetch(apiUrl(`/v1/protocol?cluster=${encodeURIComponent(opts.cluster)}`));
  const pj = await readJson<{ data?: { programId?: string } }>(proto);
  if (!pj.data?.programId) return 0;

  const onChain = await fetchOnChainShares(
    opts.rpcUrl,
    opts.vault,
    opts.investor,
    pj.data.programId
  );
  if (onChain <= 0) return 0;
  return capSharesByLiquidity(opts.rpcUrl, opts.vault, onChain, opts.cluster);
}
