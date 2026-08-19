import { INDEXER_API } from "./env";

export type DepositRole = "degen" | "retail";

async function ledgerFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${INDEXER_API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ledger ${path} failed (${res.status}) ${body.slice(0, 180)}`);
  }
  return res;
}

/** Must succeed before any on-chain deposit. */
export async function recordDepositIntent(row: {
  vault: string;
  investor: string;
  role: DepositRole;
  amount: string;
  takeProfitBps?: number;
  stopLossBps?: number;
}): Promise<number> {
  const res = await ledgerFetch("/api/ledger/deposits", {
    method: "POST",
    body: JSON.stringify(row),
  });
  const json = (await res.json()) as { id: number };
  if (!json.id) throw new Error("Ledger did not return a deposit intent id");
  return json.id;
}

export async function submitDepositIntent(id: number, signature: string): Promise<void> {
  await ledgerFetch(`/api/ledger/deposits/${id}/submit`, {
    method: "POST",
    body: JSON.stringify({ signature }),
  });
}

export async function failDepositIntent(id: number, error: string): Promise<void> {
  await ledgerFetch(`/api/ledger/deposits/${id}/fail`, {
    method: "POST",
    body: JSON.stringify({ error }),
  }).catch(() => undefined);
}

export async function recordInvestorMandate(row: {
  vault: string;
  investor: string;
  role: DepositRole;
  parkAmount: string;
  takeProfitBps?: number;
  stopLossBps?: number;
  autoFollow?: boolean;
}): Promise<void> {
  await ledgerFetch("/api/ledger/mandates", {
    method: "POST",
    body: JSON.stringify(row),
  });
}
