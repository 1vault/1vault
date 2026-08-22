const INDEXER_API = process.env.INDEXER_API ?? "http://127.0.0.1:3001";

export type VaultRegisterMeta = {
  pubkey: string;
  strategist: string;
  vaultId: number;
  name: string;
  baseMint: string;
  performanceFeeBps: number;
  bookMode?: string;
  earlyExitFeeBps?: number;
};

/** Push a confirmed signature (+ optional vault metadata) into the indexer DB. */
export async function indexTx(signature: string, vault?: VaultRegisterMeta): Promise<void> {
  try {
    const res = await fetch(`${INDEXER_API}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature, vault }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[indexer] ingest failed ${res.status} ${body.slice(0, 200)}`);
      if (vault) await registerVault(vault);
      return;
    }
    const json = (await res.json()) as { events?: number };
    console.log(`[indexer] ${signature} events=${json.events ?? 0}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[indexer] offline (${msg}); start: npm run api in onevault-indexer`);
    if (vault) await registerVault(vault);
  }
}

/** Upsert vault row when indexer API is reachable but ingest is skipped. */
export async function registerVault(vault: VaultRegisterMeta): Promise<void> {
  try {
    const res = await fetch(`${INDEXER_API}/api/vaults/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...vault,
        bookMode: vault.bookMode ?? "pooled_vault",
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[indexer] register failed ${res.status} ${body.slice(0, 200)}`);
      return;
    }
    console.log(`[indexer] registered vault ${vault.pubkey}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[indexer] register offline (${msg})`);
  }
}
