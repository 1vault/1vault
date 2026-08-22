const CLUSTER = (import.meta.env.VITE_CLUSTER ?? "devnet") as string;

function qs(params?: Record<string, string>): string {
  const p = new URLSearchParams({ cluster: CLUSTER, ...params });
  return `?${p}`;
}

export type LicensePreview = {
  accounts: Record<string, string>;
  strategistRegistered: boolean;
  licenseActive: boolean;
};

export function formatLicenseTokens(raw?: string): string {
  const n = Number(raw ?? "1000000");
  if (!Number.isFinite(n)) return "1,000,000";
  return `${n.toLocaleString("en-US")} 1VL`;
}

export async function fetchLicensePreview(opts: {
  strategist: string;
  rpcUrl: string;
}): Promise<LicensePreview> {
  const res = await fetch(`/v1/tx/resolve-accounts${qs()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ strategist: opts.strategist }),
  });
  const json = (await res.json()) as {
    success?: boolean;
    data?: Record<string, string>;
  };
  const accounts = json.success && json.data ? json.data : {};

  const strategistRegistered = await accountExists(opts.rpcUrl, accounts.strategistAccount);
  const licenseActive = await accountExists(opts.rpcUrl, accounts.license);

  return { accounts, strategistRegistered, licenseActive };
}

async function accountExists(rpcUrl: string, pubkey?: string): Promise<boolean> {
  if (!pubkey) return false;
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [pubkey, { encoding: "base64", commitment: "confirmed" }],
      }),
    });
    const json = (await res.json()) as { result?: { value?: unknown } | null };
    return json.result?.value != null;
  } catch {
    return false;
  }
}
