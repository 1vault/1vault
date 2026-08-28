const NON_TRADEABLE_STATUS = /^(closed|closing|paused)$/i;

/** True when vault is wind-down complete (on-chain status Closed / code 3). */
export function isVaultClosed(
  status?: string | null,
  statusCode?: number | null
): boolean {
  if (statusCode === 3) return true;
  return String(status ?? "").toLowerCase() === "closed";
}

/** Normalize vault status from API/indexer/on-chain annotate rows. */
export function vaultStatusFields(row: Record<string, unknown>): {
  status: string;
  statusCode: number | undefined;
} {
  const status = String(row.vaultStatus ?? row.vault_status ?? row.status ?? "").trim();
  const rawCode = Number(row.vaultStatusCode ?? row.vault_status_code ?? NaN);
  return {
    status,
    statusCode: Number.isFinite(rawCode) ? rawCode : undefined,
  };
}

/** Vault accepts new trades (Active / open only — not Paused, Closing, or Closed). */
export function isVaultTradeable(
  status?: string | null,
  statusCode?: number | null
): boolean {
  if (isVaultClosed(status, statusCode)) return false;
  const s = String(status ?? "").trim();
  if (s && NON_TRADEABLE_STATUS.test(s)) return false;
  if (statusCode != null && Number.isFinite(statusCode)) return statusCode === 0;
  // Light MY_VAULTS skips RPC annotate; indexer rows often omit status (defaults active).
  if (!s) return true;
  return /^active$/i.test(s);
}

/** Row-level helper for MY_VAULTS / GMGN vault lists. */
export function isVaultRowTradeable(row: Record<string, unknown>): boolean {
  const { status, statusCode } = vaultStatusFields(row);
  return isVaultTradeable(status, statusCode);
}

/** Legacy on-chain layout — hidden from vault lists. */
export function isVaultLegacy(row: Record<string, unknown>): boolean {
  if (row.layoutCompatible === false) return true;
  return String(row.closeBlockedReason ?? "").toLowerCase() === "legacy";
}

/** Closed or legacy vaults are omitted from Home / picker lists. */
export function isVaultListHidden(row: Record<string, unknown>): boolean {
  if (isVaultLegacy(row)) return true;
  const { status, statusCode } = vaultStatusFields(row);
  return isVaultClosed(status, statusCode);
}

export function filterVisibleVaults<T extends Record<string, unknown>>(vaults: T[]): T[] {
  return vaults.filter((v) => !isVaultListHidden(v));
}

/** Keep current selection when visible; otherwise first visible vault. */
export function pickDefaultActiveVault(
  vaults: Array<Record<string, unknown>>,
  current: string | null | undefined
): string | null {
  const visible = filterVisibleVaults(vaults);
  if (visible.length === 0) return null;
  const pk = String(current ?? "");
  if (pk && visible.some((v) => String(v.pubkey ?? "") === pk)) return pk;
  return String(visible[0]?.pubkey ?? "") || null;
}

/** Vaults that still block $1VAULT release (not Closed on-chain — includes legacy). */
export function countOpenVaults(vaults: Array<Record<string, unknown>>): number {
  return vaults.filter((v) => {
    const { status, statusCode } = vaultStatusFields(v);
    return !isVaultClosed(status, statusCode);
  }).length;
}
