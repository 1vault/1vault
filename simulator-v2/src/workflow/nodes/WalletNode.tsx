import { Handle, Position } from "@xyflow/react";
import { shortAddr, statusLabel, useWorkflow } from "../context";
import { MAX_RETAILS, type WalletSource } from "../graph";
import { NodeIcon } from "../icons";

export default function WalletNode({
  data,
}: {
  data: { role: "degen" | "retail"; index?: number };
}) {
  const ctx = useWorkflow();
  const index = data.role === "retail" ? data.index ?? 0 : 0;
  const slot = data.role === "degen" ? ctx.degen : ctx.retails[index] ?? ctx.retail;
  const loaded = Boolean(slot.pubkey);
  const view =
    data.role === "degen"
      ? ctx.views.degen
      : index === 0
        ? ctx.views.retail
        : { status: loaded ? ("success" as const) : ("idle" as const), detail: loaded ? "Investor wallet loaded" : undefined };
  const set =
    data.role === "degen"
      ? ctx.setDegen
      : (patch: Parameters<typeof ctx.setRetailAt>[1]) => ctx.setRetailAt(index, patch);
  const importer =
    data.role === "degen"
      ? ctx.importDegen
      : (mode: "secret" | "cli" | "wallet") => ctx.importRetail(mode, index);
  const title =
    data.role === "degen" ? "Degen wallet" : ctx.retails.length > 1 ? `Retail ${index + 1}` : "Retail wallet";
  const hint =
    data.role === "degen"
      ? "Strategist · import key or connect Phantom"
      : "Investor · import key or connect Phantom";
  const pillStatus = loaded && view.status === "idle" ? "ready" : loaded ? view.status : "idle";
  const canAdd = data.role === "retail" && index === 0 && ctx.retails.length < MAX_RETAILS && !ctx.running;
  const canRemove = data.role === "retail" && index > 0 && !ctx.running;
  const source: WalletSource = slot.source ?? "secret";
  const vaultTypeLocked = ctx.running;

  const vaultTypeField = data.role === "degen" ? (
    <label className="nv-field nopan nodrag nowheel">
      Vault type
      <select
        className="nodrag nopan nowheel"
        value={ctx.settings.vaultType}
        disabled={vaultTypeLocked}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        title={
          vaultTypeLocked
            ? "Vault type locked while a workflow is running"
            : ctx.activeVault
              ? "Used for the next Create vault (new vault id)"
              : "Pooled = one shared book · Sliced = separate slice books (10% mgmt fee demo)"
        }
        onChange={(e) =>
          ctx.setSettings({
            vaultType: e.target.value === "sliced" ? "sliced" : "pooled",
          })
        }
      >
        <option value="pooled">Pooled vault</option>
        <option value="sliced">Sliced vault</option>
      </select>
      <span className="nv-field-hint">
        {ctx.settings.vaultType === "sliced"
          ? "Capital split into slices · 10% management fee (demo)"
          : "All investors in one pool · shared P&L"}
      </span>
    </label>
  ) : null;

  return (
    <div className={`nv nv-wallet status-${view.status} ${loaded ? "is-ready" : ""}`}>
      <Handle type="source" position={Position.Right} id="out" />
      <div className="nv-card">
      <div className="nv-stripe" />
      <div className="nv-head">
        <div className="nv-id">
          <NodeIcon name={data.role} />
          <div>
            <div className="nv-kicker">{data.role}</div>
            <div className="nv-title">{title}</div>
          </div>
        </div>
        <div className="nv-head-right">
          {canAdd ? (
            <button
              type="button"
              className="btn btn-icon nopan nodrag"
              title="Add another retail wallet"
              onClick={ctx.addRetail}
            >
              +
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              className="btn btn-icon nopan nodrag"
              title="Remove this retail wallet"
              onClick={() => ctx.removeRetail(index)}
            >
              −
            </button>
          ) : null}
          <span className={`pill pill-${pillStatus}`}>{statusLabel(pillStatus)}</span>
        </div>
      </div>
      <div className="nv-body">
        <p className="nv-hint">{hint}</p>
        {!loaded ? (
          <div className="nv-form nopan nodrag nowheel">
            <div className="nv-tabs">
              <button
                type="button"
                className={`nv-tab ${source === "secret" ? "is-active" : ""}`}
                disabled={ctx.running}
                onClick={() => set({ source: "secret", error: undefined })}
              >
                Private key
              </button>
              <button
                type="button"
                className={`nv-tab ${source === "wallet" ? "is-active" : ""}`}
                disabled={ctx.running}
                onClick={() => set({ source: "wallet", secret: "", error: undefined })}
              >
                Connect wallet
              </button>
            </div>
            {source === "secret" ? (
              <>
                <label className="nv-label">Paste private key</label>
                <textarea
                  className="nv-secret"
                  placeholder="[12,34,…] JSON  ·  or base58 secret"
                  value={slot.secret}
                  disabled={ctx.running}
                  onChange={(e) => set({ secret: e.target.value, useCli: false, error: undefined })}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </>
            ) : (
              <p className="nv-hint">
                Connect Phantom or Solflare (devnet). Approve each flow step in the extension —
                no private key is stored.
              </p>
            )}
            {vaultTypeField}
          </div>
        ) : (
          <div className="nv-data nopan nodrag nowheel">
            <Row label="mode" value={slot.source === "wallet" ? "wallet" : "private key"} />
            <Row label="pubkey" value={shortAddr(slot.pubkey)} copy={slot.pubkey} />
            <Row label="wallet" value={`${slot.sol ?? "—"} SOL`} />
            {vaultTypeField}
            {data.role === "degen" ? (
              <label className="nv-field nopan nodrag nowheel">
                Park SOL
                <input
                  type="number"
                  min={0.05}
                  max={5}
                  step={0.01}
                  value={ctx.settings.degenParkSol}
                  disabled={ctx.running}
                  onChange={(e) => ctx.setSettings({ degenParkSol: Math.max(0.05, Number(e.target.value) || 0.1) })}
                />
              </label>
            ) : null}
            {view.detail ? <p className="nv-detail">{view.detail}</p> : null}
          </div>
        )}
        {slot.error ? <p className="nv-error">{slot.error}</p> : null}
      </div>
      <div className="nv-foot nopan nodrag">
        {!loaded ? (
          <div className="nv-actions">
            {source === "secret" ? (
              <button
                type="button"
                className="btn btn-sm"
                disabled={ctx.running || !slot.secret.trim()}
                onClick={() => void importer("secret")}
              >
                Import
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm"
                disabled={ctx.running}
                onClick={() => void importer("wallet")}
              >
                Connect
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={ctx.running}
            onClick={() =>
              set({
                source: slot.source ?? "secret",
                secret: "",
                useCli: false,
                pubkey: undefined,
                sol: undefined,
                error: undefined,
              })
            }
          >
            Clear
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: string }) {
  return (
    <div className="nv-row">
      <span>{label}</span>
      <button
        type="button"
        className="mono"
        title={copy}
        onClick={() => copy && navigator.clipboard.writeText(copy)}
      >
        {value}
      </button>
    </div>
  );
}
