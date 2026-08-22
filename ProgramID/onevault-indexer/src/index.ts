import { PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";
import { handleProgramLog } from "./parser.js";
import {
  createRpcConnection,
  formatFetchError,
  redactRpcUrl,
  withRpcRetry,
} from "./rpc.js";
import { touchHeartbeat } from "./heartbeat.js";

async function main(): Promise<void> {
  console.log("[1vault-indexer] migrating schema...");
  await migrate();

  const connection = createRpcConnection();
  const programId = new PublicKey(config.programId);

  const maxSlot = await pool.query(
    `SELECT COALESCE(MAX(slot), 0)::bigint AS s FROM transactions`
  );
  let lastSlot = Math.max(config.startSlot, Number(maxSlot.rows[0].s));
  console.log(
    `[1vault-indexer] polling ${redactRpcUrl(config.rpcUrl)} for program ${programId.toBase58()} from slot ${lastSlot}`
  );

  await touchHeartbeat("poller");

  for (;;) {
    try {
      await touchHeartbeat("poller");
      const sigs = await withRpcRetry("getSignaturesForAddress", () =>
        connection.getSignaturesForAddress(programId, { limit: 25 })
      );

      for (const sig of sigs.reverse()) {
        if (sig.slot <= lastSlot) continue;
        await sleep(350);
        const tx = await withRpcRetry(`getTransaction ${sig.signature.slice(0, 8)}…`, () =>
          connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          })
        );
        if (!tx?.meta?.logMessages) {
          lastSlot = Math.max(lastSlot, sig.slot);
          continue;
        }
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
      const msg = formatFetchError(err);
      if (/403/.test(msg)) {
        console.error(
          "[1vault-indexer] RPC 403 — set RPC_URL to a valid Helius Devnet JSON-RPC endpoint in .env"
        );
        await sleep(Math.max(config.pollIntervalMs, 30_000));
        continue;
      }
      console.error("[1vault-indexer] poll error:", msg);
      await sleep(Math.max(config.pollIntervalMs, 5_000));
      continue;
    }
    await sleep(config.pollIntervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch(async (err) => {
  console.error(formatFetchError(err));
  await pool.end();
  process.exit(1);
});
