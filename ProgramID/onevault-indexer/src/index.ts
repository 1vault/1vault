import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";
import { handleProgramLog } from "./parser.js";

async function main(): Promise<void> {
  console.log("[1vault-indexer] migrating schema...");
  await migrate();

  const connection = new Connection(config.rpcUrl, "confirmed");
  const programId = new PublicKey(config.programId);

  const maxSlot = await pool.query(
    `SELECT COALESCE(MAX(slot), 0)::bigint AS s FROM transactions`
  );
  let lastSlot = Math.max(config.startSlot, Number(maxSlot.rows[0].s));
  console.log(`[1vault-indexer] polling ${config.rpcUrl} for program ${programId.toBase58()} from slot ${lastSlot}`);

  for (;;) {
    try {
      const sigs = await connection.getSignaturesForAddress(programId, { limit: 25 });
      for (const sig of sigs.reverse()) {
        if (sig.slot <= lastSlot) continue;
        await new Promise((r) => setTimeout(r, 350));
        const tx = await connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        if (!tx?.meta?.logMessages) continue;
        for (const line of tx.meta.logMessages) {
          if (line.includes("Program data:")) {
            await handleProgramLog(
              sig.signature,
              sig.slot,
              tx.blockTime ?? null,
              line
            );
          }
        }
        lastSlot = Math.max(lastSlot, sig.slot);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("403")) {
        console.error(
          "[1vault-indexer] RPC 403 — ganti RPC_URL ke Helius Devnet JSON-RPC"
        );
        await new Promise((r) => setTimeout(r, Math.max(config.pollIntervalMs, 30000)));
        continue;
      }
      console.error("[1vault-indexer] poll error:", msg);
    }
    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
