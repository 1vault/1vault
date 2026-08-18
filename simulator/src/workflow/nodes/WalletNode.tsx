import { Handle, Position } from "@xyflow/react";
import { shortAddr, statusLabel, useWorkflow } from "../context";
import { NodeIcon } from "../icons";

export default function WalletNode({ data }: { data: { role: "degen" | "retail" } }) {
  const ctx = useWorkflow();
  const slot = data.role === "degen" ? ctx.degen : ctx.retail;
  const view = ctx.views[data.role];
  const set = data.role === "degen" ? ctx.setDegen : ctx.setRetail;
  const importer = data.role === "degen" ? ctx.importDegen : ctx.importRetail;
  const loaded = Boolean(slot.pubkey);
  const title = data.role === "degen" ? "Degen wallet" : "Retail wallet";
  const hint =
    data.role === "degen"
      ? "Strategist — paste your Devnet private key on this node"
      : "Investor — paste your key, follow settings, then join the vault";

  return (
    <div className={`nv nv-wallet status-${view.status} ${loaded ? "is-ready" : ""}`}>
      <Handle type="source" position={Position.Right} id="out" />
      <div className="nv-stripe" />
      <div className="nv-head">
        <div className="nv-id">
          <NodeIcon name={data.role} />
          <div>
            <div className="nv-kicker">{data.role}</div>
            <div className="nv-title">{title}</div>
          </div>
        </div>
        <span className={`pill pill-${loaded && view.status === "idle" ? "ready" : view.status}`}>
          {statusLabel(loaded && view.status === "idle" ? "ready" : loaded ? view.status : "idle")}
        </span>
      </div>
      <p className="nv-hint">{hint}</p>
      {!loaded ? (
        <div className="nv-form nopan nodrag nowheel">
          <label className="nv-label">Paste private key</label>
          <textarea
            className="nv-secret"
            placeholder="[12,34,…] JSON  ·  or base58 secret"
            value={slot.secret}
            disabled={ctx.running}
            onChange={(e) => set({ secret: e.target.value, useCli: false, error: undefined })}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <div className="nv-actions">
            <button
              type="button"
              className="btn btn-sm"
              disabled={ctx.running || !slot.secret.trim()}
              onClick={() => void importer("secret")}
            >
              Import key
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={ctx.running}
              onClick={() => void importer("cli")}
            >
              Use CLI key
            </button>
          </div>
        </div>
      ) : (
        <div className="nv-data">
          <Row label="pubkey" value={shortAddr(slot.pubkey)} copy={slot.pubkey} />
          <Row label="SOL" value={slot.sol ?? "—"} />
          {view.detail ? <p className="nv-detail">{view.detail}</p> : null}
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={ctx.running}
            onClick={() =>
              set({ secret: "", useCli: false, pubkey: undefined, sol: undefined, error: undefined })
            }
          >
            Clear
          </button>
        </div>
      )}
      {slot.error ? <p className="nv-error">{slot.error}</p> : null}
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
