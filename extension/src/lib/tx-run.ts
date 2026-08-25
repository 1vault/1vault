import { prepUnlockLicense, submitSignedTx } from "./api/client";
import { signPreparedEOA } from "./signing";
import type { Keypair } from "@solana/web3.js";

type PreparedTx = {
  transaction?: string;
  signerDetails?: Array<{ pubkey: string; userMustSign?: boolean }>;
  prepared?: {
    transaction?: string;
    signerDetails?: Array<{ pubkey: string; userMustSign?: boolean }>;
  };
};

function extractPrepared(p: PreparedTx): {
  transaction: string;
  signerDetails: Array<{ pubkey: string; userMustSign?: boolean }>;
} {
  const tx = p.transaction ?? p.prepared?.transaction;
  const details = p.signerDetails ?? p.prepared?.signerDetails ?? [];
  if (!tx) throw new Error("No transaction in prepared response");
  return { transaction: tx, signerDetails: details };
}

export async function runPreparedTx(prepared: PreparedTx, keypair: Keypair): Promise<string> {
  const { transaction, signerDetails } = extractPrepared(prepared);
  const keyByPub = new Map([[keypair.publicKey.toBase58(), keypair]]);
  const signed = signPreparedEOA(transaction, signerDetails, keyByPub);
  const result = await submitSignedTx(signed);
  const sig = String(
    (result as { signature?: string }).signature ??
      (result as { data?: { signature?: string } }).data?.signature ??
      ""
  );
  return sig;
}

export async function runUnlockLicense(strategist: string, keypair: Keypair): Promise<string> {
  const prepared = await prepUnlockLicense(strategist);
  return runPreparedTx(prepared, keypair);
}
