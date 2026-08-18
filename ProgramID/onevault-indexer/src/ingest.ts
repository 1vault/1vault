import { Connection } from "@solana/web3.js";
import { handleProgramLog } from "./parser.js";

export async function ingestSignature(
  connection: Connection,
  signature: string
): Promise<number> {
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });
  if (!tx?.meta?.logMessages) return 0;
  let n = 0;
  for (const line of tx.meta.logMessages) {
    if (!line.includes("Program data:")) continue;
    await handleProgramLog(
      signature,
      tx.slot,
      tx.blockTime ?? null,
      line
    );
    n += 1;
  }
  return n;
}
