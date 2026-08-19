import type { NodeUpdate, ProtocolInfo, RetailSettings, SimMode, WalletPreview, WorkflowNodeId } from "../shared/events";

async function readSse(
  res: Response,
  onEvent: (event: string, data: unknown) => void
): Promise<void> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let event = "message";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    for (const line of parts) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const raw = line.slice(5).trim();
        try {
          onEvent(event, JSON.parse(raw));
        } catch {
          onEvent(event, raw);
        }
        event = "message";
      }
    }
  }
}

export async function fetchProtocol(): Promise<ProtocolInfo> {
  const res = await fetch("/api/protocol");
  if (!res.ok) throw new Error("protocol fetch failed");
  return res.json();
}

export async function previewWallet(opts: {
  secret?: string;
  useCli?: boolean;
}): Promise<WalletPreview & { cli?: boolean }> {
  const res = await fetch("/api/wallet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts.useCli ? { useCli: true } : { secret: opts.secret }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "wallet preview failed");
  return json;
}

export async function runWorkflow(
  body: {
    degenSecret?: string;
    retailSecret?: string;
    degenUseCli?: boolean;
    retailUseCli?: boolean;
    extraRetails?: Array<{ secret?: string; useCli?: boolean }>;
    settings?: RetailSettings;
    mode: SimMode;
    vaultId?: number;
  },
  onNode: (u: NodeUpdate) => void,
  onMeta: (event: string, data: unknown) => void
): Promise<void> {
  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `run failed ${res.status}`);
  }
  await readSse(res, (event, data) => {
    if (event === "node") onNode(data as NodeUpdate);
    else onMeta(event, data);
  });
}

export const SETUP_NODES: WorkflowNodeId[] = ["license", "vault", "settings", "deposit"];
export const TRADE_NODES: WorkflowNodeId[] = [
  "ata",
  "request",
  "execute",
  "openPos",
  "mirror",
  "mark",
  "closePos",
  "withdraw",
  "toWallet",
  "accrue",
  "claim",
  "platform",
  "degenFee",
];
export const WALLET_OUT_NODES: WorkflowNodeId[] = ["toWallet", "platform"];
export const CLOSE_NODES: WorkflowNodeId[] = ["license", "vault", "deposit"];
export const DEPOSIT_NODES: WorkflowNodeId[] = ["settings", "deposit"];
