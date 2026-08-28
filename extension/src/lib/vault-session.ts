/** Sidepanel + background share annotated vault rows via session storage. */
export const VAULT_SNAPSHOT_KEY = "vaultListSnapshot";
export const VAULT_SNAPSHOT_AT_KEY = "vaultListSnapshotAt";
/** Reuse snapshot while sidepanel / MY_VAULTS refresh is in flight. */
export const VAULT_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

export function isVaultSnapshotFresh(at: unknown): boolean {
  const ts = Number(at);
  return Number.isFinite(ts) && Date.now() - ts < VAULT_SNAPSHOT_TTL_MS;
}

export function parseVaultSnapshot(stored: Record<string, unknown>): {
  rows: Array<Record<string, unknown>>;
  at: number | undefined;
  fresh: boolean;
} {
  const rows = Array.isArray(stored[VAULT_SNAPSHOT_KEY])
    ? (stored[VAULT_SNAPSHOT_KEY] as Array<Record<string, unknown>>)
    : [];
  const at = Number(stored[VAULT_SNAPSHOT_AT_KEY]);
  return {
    rows,
    at: Number.isFinite(at) ? at : undefined,
    fresh: isVaultSnapshotFresh(at),
  };
}

/** Background / sidepanel only — content scripts must use SESSION_GET/SET or MY_VAULTS. */
export async function readVaultSnapshot(): Promise<ReturnType<typeof parseVaultSnapshot>> {
  const stored = await chrome.storage.session.get([VAULT_SNAPSHOT_KEY, VAULT_SNAPSHOT_AT_KEY]);
  return parseVaultSnapshot(stored);
}

/** Background / sidepanel only — content scripts must use SESSION_GET/SET or MY_VAULTS. */
export async function writeVaultSnapshot(rows: Array<Record<string, unknown>>): Promise<void> {
  await chrome.storage.session.set({
    [VAULT_SNAPSHOT_KEY]: rows,
    [VAULT_SNAPSHOT_AT_KEY]: Date.now(),
  });
}
