const INDEXER_API = process.env.INDEXER_API ?? "http://127.0.0.1:3001";

/** Push a confirmed signature into the 1Vault indexer (Supabase). */
export async function indexTx(signature: string): Promise<void> {
  try {
    const res = await fetch(`${INDEXER_API}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signature }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[indexer] ingest failed ${res.status} ${body.slice(0, 200)}`);
      return;
    }
    const json = (await res.json()) as { events?: number };
    console.log(`[indexer] ${signature} events=${json.events ?? 0}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[indexer] offline (${msg}); start: npm run api in onevault-indexer`);
  }
}
