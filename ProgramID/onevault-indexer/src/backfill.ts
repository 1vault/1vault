import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { migrate, pool } from "./db.js";
import { handleProgramLog } from "./parser.js";

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function getTxWithRetry(
  connection: Connection,
  signature: string,
  attempts = 6
) {
  let delay = 800;
  for (let i = 0; i < attempts; i++) {
    try {
      return await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("429") || i === attempts - 1) throw err;
      await sleep(delay);
      delay *= 2;
    }
  }
  return null;
}

async function seedKnownVault(): Promise<void> {
  await pool.query(
    `INSERT INTO vaults (pubkey, strategist, vault_id, name, base_mint, performance_fee_bps, created_at, updated_at)
     VALUES ($1,$2,1,'Demo Vault',$3,2000,NOW(),NOW())
     ON CONFLICT (pubkey) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [
      "CxUvVKea9nyv3a6EdHwaHVmjNMRXbA7X3D32LTWDmKLG",
      "9WDdee1AwqRCJ2WSr9dDAcaoCXPkfd19vR5RQdc2zcan",
      "So11111111111111111111111111111111111111112",
    ]
  );
  await pool.query(
    `INSERT INTO strategists (pubkey, vault_count, active_vault_count, updated_at)
     VALUES ($1, 1, 1, NOW())
     ON CONFLICT (pubkey) DO UPDATE SET vault_count = 1, active_vault_count = 1, updated_at = NOW()`,
    ["9WDdee1AwqRCJ2WSr9dDAcaoCXPkfd19vR5RQdc2zcan"]
  );
}

async function main(): Promise<void> {
  await migrate();
  await seedKnownVault();

  const connection = new Connection(config.rpcUrl, "confirmed");
  const programId = new PublicKey(config.programId);

  console.log(`[backfill] fetching signatures for ${programId.toBase58()}`);
  const all: { signature: string; slot: number }[] = [];
  let before: string | undefined;
  for (;;) {
    const page = await connection.getSignaturesForAddress(programId, {
      limit: 1000,
      before,
    });
    if (page.length === 0) break;
    for (const s of page) {
      all.push({ signature: s.signature, slot: s.slot });
    }
    before = page[page.length - 1].signature;
    if (page.length < 1000) break;
  }

  all.reverse();
  console.log(`[backfill] ${all.length} txs`);

  let events = 0;
  for (const [i, sig] of all.entries()) {
    if (i > 0) await sleep(400);
    const tx = await getTxWithRetry(connection, sig.signature);
    if (!tx?.meta?.logMessages) continue;
    for (const line of tx.meta.logMessages) {
      if (!line.includes("Program data:")) continue;
      await handleProgramLog(
        sig.signature,
        sig.slot,
        tx.blockTime ?? null,
        line
      );
      events += 1;
    }
  }

  const vaults = await pool.query("SELECT COUNT(*)::int AS n FROM vaults");
  const txs = await pool.query("SELECT COUNT(*)::int AS n FROM transactions");
  console.log(
    `[backfill] parsed ${events} events; vaults=${vaults.rows[0].n} txs=${txs.rows[0].n}`
  );
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await seedKnownVault();
  } catch {}
  await pool.end();
  process.exit(1);
});
