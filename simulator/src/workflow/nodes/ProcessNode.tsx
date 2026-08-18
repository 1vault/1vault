import { Handle, Position } from "@xyflow/react";
import { shortAddr, statusLabel, useWorkflow } from "../context";
import { NodeIcon } from "../icons";

const META: Record<string, { kicker: string; title: string; idle: string }> = {
  license: {
    kicker: "on-chain",
    title: "License",
    idle: "Register strategist + lock 1VAULT license",
  },
  vault: {
    kicker: "create",
    title: "Create vault",
    idle: "Degen creates the vault. Retail setup joins this same vault.",
  },
  deposit: {
    kicker: "this vault",
    title: "Vault",
    idle: "Retail parks SOL into the same vault the degen created",
  },
  ata: {
    kicker: "vault buy",
    title: "Prepare token",
    idle: "Create demo mint + vault ATA for the vault buy",
  },
  request: {
    kicker: "vault buy",
    title: "Request trade",
    idle: "Vault spends its own wSOL — degen only has access to sign",
  },
  execute: {
    kicker: "vault buy",
    title: "Execute trade",
    idle: "1Vault executes the buy with vault capital",
  },
  openPos: {
    kicker: "vault buy",
    title: "Enter token",
    idle: "Vault opens the token position — retail AUM inside the vault rides along",
  },
  mirror: {
    kicker: "auto",
    title: "Auto-follow",
    idle: "Retail is already in the vault — no new deposit when the vault buys",
  },
  mark: {
    kicker: "pnl",
    title: "PnL",
    idle: "Price moves · mark profit or loss on-chain",
  },
  closePos: {
    kicker: "pnl",
    title: "Realize PnL",
    idle: "Close the position · proceeds return to the vault",
  },
  withdraw: {
    kicker: "retail exit",
    title: "Retail exit",
    idle: "Exit first — degen fee is based on this exit amount",
  },
  accrue: {
    kicker: "fee",
    title: "Accrue degen fee",
    idle: "After retail exit · performance fee from that exit nominal",
  },
  claim: {
    kicker: "payout",
    title: "Pay degen",
    idle: "Then send SOL to degen + platform",
  },
};

const KEYS: Record<string, string[]> = {
  license: ["license", "register", "strategistPda"],
  vault: ["vaultId", "name", "vault"],
  deposit: ["vaultId", "amount", "shares", "vaultAssets", "vault"],
  mirror: ["copy", "allocation", "auto"],
  ata: ["mint", "vaultAta"],
  request: ["tradeId", "action", "amount", "pair", "capital"],
  execute: ["dex", "received"],
  openPos: ["positionId", "entry", "tokens", "capital"],
  mark: ["entry", "mark", "unrealized"],
  closePos: ["proceeds", "vaultAssets"],
  withdraw: ["sharesBurned", "parked", "profit", "platformFee", "degenFee", "netReceived", "exitFee"],
  accrue: ["degenAccrued", "protocolAccrued"],
  claim: ["platformDelta", "degenFeeDelta"],
};

export default function ProcessNode({
  data,
}: {
  data: { kind: string; ports?: string[] };
}) {
  const { views, activeVault } = useWorkflow();
  const view = views[data.kind as keyof typeof views] ?? { status: "idle" as const };
  const meta = META[data.kind] ?? { kicker: "node", title: data.kind, idle: "" };
  const keys = KEYS[data.kind] ?? [];
  const isTrade = ["ata", "request", "execute", "openPos"].includes(data.kind);
  const isPnl = ["mark", "closePos"].includes(data.kind);
  const isExit = data.kind === "withdraw";
  const vaultNo = view.fields?.vaultId || (activeVault ? String(activeVault.vaultId) : "");
  const title =
    data.kind === "deposit" ? (vaultNo ? `Vault #${vaultNo}` : "Vault") : meta.title;
  const idle =
    data.kind === "deposit"
      ? vaultNo
        ? `Retail parks SOL in vault #${vaultNo}`
        : meta.idle
      : meta.idle;
  const ports = data.ports ?? ["in", "out"];

  return (
    <div className={`nv nv-process status-${view.status} ${isTrade ? "is-trade" : ""} ${isPnl ? "is-pnl" : ""} ${isExit ? "is-exit" : ""}`}>
      {ports.includes("in") ? <Handle type="target" position={Position.Left} id="in" /> : null}
      {ports.includes("out") ? <Handle type="source" position={Position.Right} id="out" /> : null}
      {ports.includes("top") ? <Handle type="target" position={Position.Top} id="top" /> : null}
      {ports.includes("bottom") ? <Handle type="source" position={Position.Bottom} id="bottom" /> : null}
      <div className="nv-stripe" />
      <div className="nv-head">
        <div className="nv-id">
          <NodeIcon name={data.kind} />
          <div>
            <div className="nv-kicker">{meta.kicker}</div>
            <div className="nv-title">{title}</div>
          </div>
        </div>
        <span className={`pill pill-${view.status}`}>{statusLabel(view.status)}</span>
      </div>
      <p className="nv-hint">{view.detail || idle}</p>
      {view.fields ? (
        <div className="nv-data">
          {keys
            .filter((k) => view.fields?.[k])
            .map((k) => (
              <div className="nv-row" key={k}>
                <span>{k}</span>
                <span className="mono">{formatVal(k, view.fields![k])}</span>
              </div>
            ))}
        </div>
      ) : null}
      {view.tx ? (
        <a
          className="nv-link"
          href={`https://explorer.solana.com/tx/${view.tx}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
        >
          tx {shortAddr(view.tx)}
        </a>
      ) : null}
    </div>
  );
}

function formatVal(key: string, value: string): string {
  if (["vault", "strategistPda", "mint", "vaultAta", "dex"].includes(key) && value.length > 12) {
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }
  return value;
}
