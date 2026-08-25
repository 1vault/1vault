import { getVault, prepParkGuest, prepWithdraw, submitSignedTx } from "./api/client";
import { signPreparedEOA } from "./signing";
import type { Keypair } from "@solana/web3.js";
import { runPreparedTx } from "./tx-run";

function vaultTokenAccountFromVault(raw: Record<string, unknown>): string {
  const vault = (raw.vault as Record<string, unknown> | undefined) ?? raw;
  return String(
    vault.vault_token_account ?? vault.vaultTokenAccount ?? vault.token_account ?? ""
  );
}

export async function runParkGuest(opts: {
  investor: string;
  vault: string;
  lamports: number;
  keypair: Keypair;
}): Promise<string> {
  const vaultRaw = await getVault(opts.vault);
  const vta = vaultTokenAccountFromVault(vaultRaw as Record<string, unknown>);
  if (!vta) throw new Error("vault token account not found");
  const strategist = String(
    ((vaultRaw.vault as Record<string, unknown>) ?? vaultRaw).strategist ?? ""
  );
  const prepared = await prepParkGuest({
    investor: opts.investor,
    vault: opts.vault,
    strategist: strategist || undefined,
    vaultTokenAccount: vta,
    lamports: opts.lamports,
    role: "investors",
  });
  const tx = prepared.prepared?.transaction ?? prepared.transaction;
  const details = prepared.prepared?.signerDetails ?? prepared.signerDetails ?? [];
  if (!tx) throw new Error("park-guest: no transaction");
  const keyByPub = new Map([[opts.keypair.publicKey.toBase58(), opts.keypair]]);
  const signed = signPreparedEOA(tx, details, keyByPub);
  const result = await submitSignedTx(signed);
  return String((result as { signature?: string }).signature ?? "");
}

export async function runWithdraw(opts: {
  investor: string;
  vault: string;
  shares: string | number;
  keypair: Keypair;
}): Promise<string> {
  const vaultRaw = await getVault(opts.vault);
  const vta = vaultTokenAccountFromVault(vaultRaw as Record<string, unknown>);
  if (!vta) throw new Error("vault token account not found");
  const strategist = String(
    ((vaultRaw.vault as Record<string, unknown>) ?? vaultRaw).strategist ?? ""
  );
  const prepared = await prepWithdraw({
    investor: opts.investor,
    vault: opts.vault,
    strategist: strategist || undefined,
    vaultTokenAccount: vta,
    shares: opts.shares,
  });
  return runPreparedTx(prepared, opts.keypair);
}
