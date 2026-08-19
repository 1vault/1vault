import { Handle, Position } from "@xyflow/react";
import { shortAddr, statusLabel, useWorkflow } from "../context";
import { MAX_RETAILS } from "../graph";
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
  const importer = data.role === "degen" ? ctx.importDegen : (mode: "secret" | "cli") => ctx.importRetail(mode, index);
  const title =
    data.role === "degen" ? "Degen wallet" : ctx.retails.length > 1 ? `Retail ${index + 1}` : "Retail wallet";
  const hint =
    data.role === "degen"
      ? "Strategist key · park SOL into the vault"
      : "Investor key · parks into the same vault";
  const pillStatus = loaded && view.status === "idle" ? "ready" : loaded ? view.status : "idle";
  const canAdd = data.role === "retail" && index === 0 && ctx.retails.length < MAX_RETAILS && !ctx.running;
  const canRemove = data.role === "retail" && index > 0 && !ctx.running;

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
            <label className="nv-label">Paste private key</label>
            <textarea
              className="nv-secret"
              placeholder="[12,34,…] JSON  ·  or base58 secret"
              value={slot.secret}
              disabled={ctx.running}
              onChange={(e) => set({ secret: e.target.value, useCli: false, error: undefined })}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        ) : (
          <div className="nv-data">
            <Row label="pubkey" value={shortAddr(slot.pubkey)} copy={slot.pubkey} />
            <Row label="wallet" value={`${slot.sol ?? "—"} SOL`} />
            {data.role === "degen" ? (
              <label className="nv-field nopan nodrag nowheel">
                Trade SOL
                <input
                  type="number"
                  min={0}
                  max={5}
                  step={0.01}
                  value={ctx.settings.degenParkSol}
                  disabled={ctx.running}
                  onChange={(e) => ctx.setSettings({ degenParkSol: Number(e.target.value) || 0 })}
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
            <button
              type="button"
              className="btn btn-sm"
              disabled={ctx.running || !slot.secret.trim()}
              onClick={() => void importer("secret")}
            >
              Import
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              disabled={ctx.running}
              onClick={() => void importer("cli")}
            >
              CLI
            </button>
          </div>
        ) : (
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
