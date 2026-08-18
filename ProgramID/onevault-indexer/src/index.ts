import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";
import { handleProgramLog } from "./parser.js";

async function main(): Promise<void> {
  console.log("[1vault-indexer] migrating schema...");
  await migrate();

  const connection = new Connection(config.rpcUrl, "confirmed");
  const programId = new PublicKey(config.programId);

  let lastSlot = config.startSlot;
  console.log(`[1vault-indexer] polling ${config.rpcUrl} for program ${programId.toBase58()}`);

  for (;;) {
    try {
      const sigs = await connection.getSignaturesForAddress(programId, { limit: 25 });
      for (const sig of sigs.reverse()) {
        if (sig.slot <= lastSlot) continue;
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
      console.error("[1vault-indexer] poll error:", err);
    }
    await new Promise((r) => setTimeout(r, config.pollIntervalMs));
  }
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
