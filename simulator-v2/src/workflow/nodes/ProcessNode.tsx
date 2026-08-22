import { Handle, Position } from "@xyflow/react";
import { shortAddr, statusLabel, useWorkflow } from "../context";
import { formatLicenseTokens } from "../../license";
import { NodeIcon } from "../icons";

const META: Record<string, { kicker: string; title: string; idle: string }> = {
  license: {
    kicker: "on-chain",
    title: "1vault Licence",
    idle: "1M 1VL locks into the vault on Create vault",
  },
  vault: {
    kicker: "create",
    title: "Create vault",
    idle: "Locks 1M 1VL in this vault. Close vault returns each wallet their remaining SOL (by what they parked), then 1VL to degen.",
  },
  deposit: {
    kicker: "this vault",
    title: "Vault",
    idle: "Degen + retail park SOL here (ledger, then chain) before the trade",
  },
  ata: {
    kicker: "vault buy",
    title: "Prepare token",
    idle: "Create the demo mint and vault ATA",
  },
  request: {
    kicker: "vault buy",
    title: "Request trade",
    idle: "Vault spends its own wSOL",
  },
  execute: {
    kicker: "vault buy",
    title: "Execute trade",
    idle: "Buy with vault capital · auto-follow lights here",
  },
  openPos: {
    kicker: "vault buy",
    title: "Enter token",
    idle: "Position opens · vault AUM rides along",
  },
  mirror: {
    kicker: "auto",
    title: "Auto-follow",
    idle: "Retail AUM follows the vault buy",
  },
  mark: {
    kicker: "pnl",
    title: "PnL",
    idle: "Mark profit or loss on-chain",
  },
  closePos: {
    kicker: "pnl",
    title: "Realize PnL",
    idle: "Degen close · every retail book closes with it",
  },
  withdraw: {
    kicker: "locked",
    title: "Stay in vault",
    idle: "Remaining AUM stays locked after fees",
  },
  toWallet: {
    kicker: "wallet out",
    title: "Withdraw to wallet",
    idle: "Native SOL out · free withdraw",
  },
  accrue: {
    kicker: "fee",
    title: "Cut vault fees",
    idle: "Take degen performance fee from vault SOL",
  },
  claim: {
    kicker: "payout",
    title: "Pay fee wallets",
    idle: "Pay degen pool wallet",
  },
};

const KEYS: Record<string, string[]> = {
  license: [
    "strategistAccount",
    "license",
    "licenseVault",
    "licenseMint",
    "strategistLicenseAta",
    "locked",
    "returned",
  ],
  vault: ["vaultId", "name", "licenseLocked", "payouts", "status"],
  deposit: ["vaultId", "shares"],
  ata: ["mint", "vaultAta"],
  request: ["tradeId", "action", "amount", "pair", "capital"],
  execute: ["dex", "received", "execution"],
  openPos: ["positionId", "entry", "tokens", "capital"],
  mirror: ["followers", "tp", "sl", "auto"],
  mark: ["entry", "mark", "unrealized"],
  closePos: ["proceeds", "vaultAssets"],
  withdraw: ["shares", "parked", "vaultAssets", "exitFee"],
  toWallet: ["gross", "netReceived", "unwrapped", "mint", "exitFee"],
  accrue: ["degenAccrued"],
  claim: ["degenFeeDelta", "degenWallet"],
};

export default function ProcessNode({
  data,
}: {
  data: { kind: string; ports?: string[] };
}) {
  const ctx = useWorkflow();
  const { views, activeVault, running, start, degen, protocol } = ctx;
  const view = views[data.kind as keyof typeof views] ?? { status: "idle" as const };
  const meta = META[data.kind] ?? { kicker: "node", title: data.kind, idle: "" };
  const keys = KEYS[data.kind] ?? [];
  const isTrade = ["ata", "request", "execute", "openPos"].includes(data.kind);
  const isPnl = ["mark", "closePos"].includes(data.kind);
  const isExit = data.kind === "withdraw" || data.kind === "toWallet";
  const showBook = data.kind === "deposit" || data.kind === "vault";
  const showLicense = data.kind === "license";
  const vaultNo = view.fields?.vaultId || (activeVault ? String(activeVault.vaultId) : "");
  const vaultKind =
    view.fields?.vaultTypeLabel ||
    view.fields?.vaultType ||
    activeVault?.vaultType ||
    "pooled";
  const title =
    data.kind === "deposit" ? (vaultNo ? `Vault #${vaultNo}` : "Vault") : meta.title;
  const idle =
    data.kind === "deposit"
      ? vaultNo
        ? `Vault #${vaultNo} · ${vaultKind} book`
        : meta.idle
      : meta.idle;
  const ports = data.ports ?? ["in", "out"];
  const hasFoot = data.kind === "vault";

  return (
    <div className={`nv nv-process status-${view.status} ${isTrade ? "is-trade" : ""} ${isPnl ? "is-pnl" : ""} ${isExit ? "is-exit" : ""}`}>
      {ports.includes("in") ? <Handle type="target" position={Position.Left} id="in" /> : null}
      {ports.includes("out") ? <Handle type="source" position={Position.Right} id="out" /> : null}
      {ports.includes("top") ? <Handle type="target" position={Position.Top} id="top" /> : null}
      {ports.includes("bottom") ? <Handle type="source" position={Position.Bottom} id="bottom" /> : null}
      <div className="nv-card">
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
      <div className="nv-body">
        <p className="nv-hint">{view.detail || idle}</p>
        {showLicense ? <LicenseBook viewStatus={view.status} fields={view.fields} /> : null}
        {showBook ? <VaultBook onChain={view.fields?.vaultAssets} /> : null}
        {!showLicense && view.fields ? (
          <div className="nv-data">
            {keys
              .filter((k) => view.fields?.[k])
              .slice(0, showBook ? 2 : 3)
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
            href={`https://explorer.solana.com/tx/${view.tx}${protocol?.cluster === "mainnet-beta" ? "" : "?cluster=devnet"}`}
            target="_blank"
            rel="noreferrer"
          >
            tx {shortAddr(view.tx)}
          </a>
        ) : null}
      </div>
      {hasFoot ? (
        <div className="nv-foot nopan nodrag">
          <button
            type="button"
            className="btn btn-sm"
            title="Degen only — each wallet gets back their remaining SOL from what they parked (not split evenly), then 1VL returns to degen"
            disabled={running || !degen.pubkey || !ctx.retails.some((r) => r.pubkey) || !activeVault}
            onClick={() => start("close-vault")}
          >
            Close vault
          </button>
        </div>
      ) : null}
      </div>
    </div>
  );
}

function LicenseBook({
  viewStatus,
  fields,
}: {
  viewStatus: string;
  fields?: Record<string, string>;
}) {
  const { protocol, degen, licensePreview, licensePreviewLoading, activeVault, views } = useWorkflow();
  const lockAmt = formatLicenseTokens(protocol?.licenseLockTokens);
  const mint = fields?.licenseMint || licensePreview?.accounts.licenseMint || protocol?.licenseMint;
  const licensePda = fields?.license || licensePreview?.accounts.license;
  const strategistPda = fields?.strategistAccount || licensePreview?.accounts.strategistAccount;
  const inVault =
    Boolean(activeVault) ||
    viewStatus === "success" ||
    Boolean(views.vault.fields?.vaultId);
  const status = licensePreviewLoading
    ? "checking…"
    : !degen.pubkey
      ? "connect degen wallet"
      : inVault
        ? `locked · vault #${activeVault?.vaultId ?? views.vault.fields?.vaultId ?? "?"}`
        : licensePreview?.licenseActive
          ? "active · ready for vault"
          : licensePreview?.strategistRegistered
            ? "registered · lock on Create vault"
            : "pending · Create vault registers + locks";

  const explorerQ = protocol?.cluster === "mainnet-beta" ? "" : "?cluster=devnet";

  return (
    <div className="nv-book">
      <div className="nv-row">
        <span>token</span>
        <span className="mono">{protocol?.licenseName ?? "1vault Licence"}</span>
      </div>
      <div className="nv-row">
        <span>lock</span>
        <span className="mono">{lockAmt}</span>
      </div>
      <div className="nv-row">
        <span>mint</span>
        {mint ? (
          <a
            className="mono"
            href={`https://explorer.solana.com/address/${mint}${explorerQ}`}
            target="_blank"
            rel="noreferrer"
          >
            {shortAddr(mint)}
          </a>
        ) : (
          <span className="mono">—</span>
        )}
      </div>
      <div className="nv-row nv-row-total">
        <span>status</span>
        <span className="mono">{status}</span>
      </div>
      {strategistPda ? (
        <div className="nv-row">
          <span>strategist</span>
          <span className="mono" title={strategistPda}>
            {shortAddr(strategistPda)}
          </span>
        </div>
      ) : null}
      {licensePda ? (
        <div className="nv-row">
          <span>licence</span>
          <span className="mono" title={licensePda}>
            {shortAddr(licensePda)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function VaultBook({ onChain }: { onChain?: string }) {
  const { settings, retails, degen, views, protocol, activeVault } = useWorkflow();
  const loaded = retails.filter((r) => r.pubkey).length;
  const degenAmt = degen.pubkey ? Number(settings.degenParkSol) || 0 : 0;
  const retailEach = Number(settings.parkSol) || 0;
  const retailAmt = retailEach * loaded;
  const estimate = degenAmt + retailAmt;
  const licenseLocked =
    views.vault.fields?.licenseLocked ||
    (activeVault && protocol ? formatLicenseTokens(protocol.licenseLockTokens) : "—");
  return (
    <div className="nv-book">
      <div className="nv-row">
        <span>licence</span>
        <span className="mono">{licenseLocked}</span>
      </div>
      <div className="nv-row">
        <span>degen</span>
        <span className="mono">{fmtSol(degenAmt)}</span>
      </div>
      <div className="nv-row">
        <span>retail{loaded > 1 ? ` ×${loaded}` : ""}</span>
        <span className="mono">{fmtSol(retailAmt)}</span>
      </div>
      <div className="nv-row nv-row-total">
        <span>into market</span>
        <span className="mono">{fmtSol(estimate)}</span>
      </div>
      <div className="nv-row">
        <span>vault AUM</span>
        <span className="mono">{onChain ? `${onChain} SOL` : "—"}</span>
      </div>
    </div>
  );
}

function fmtSol(n: number): string {
  return `${n.toFixed(3)} SOL`;
}

function formatVal(key: string, value: string): string {
  if (["vault", "strategistPda", "strategistAccount", "license", "licenseVault", "licenseMint", "mint", "vaultAta", "dex", "wallet"].includes(key) && value.length > 12) {
    if (value === "11111111111111111111111111111111") return "native SOL";
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }
  return value;
}
