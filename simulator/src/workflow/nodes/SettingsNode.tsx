import { Handle, Position } from "@xyflow/react";
import { statusLabel, useWorkflow } from "../context";
import { NodeIcon } from "../icons";

export default function SettingsNode() {
  const ctx = useWorkflow();
  const s = ctx.settings;
  const view = ctx.views.settings;
  const retailReady = ctx.retails.some((r) => r.pubkey);

  return (
    <div className={`nv nv-settings status-${view.status}`}>
      <Handle type="target" position={Position.Left} id="in" />
      <Handle type="source" position={Position.Right} id="out" />
      <div className="nv-card">
      <div className="nv-stripe" />
      <div className="nv-head">
        <div className="nv-id">
          <NodeIcon name="settings" />
          <div>
            <div className="nv-kicker">retail setup</div>
            <div className="nv-title">Follow settings</div>
          </div>
        </div>
        <span className={`pill pill-${view.status}`}>{statusLabel(view.status)}</span>
      </div>
      <div className="nv-body">
        <p className="nv-hint">
          {ctx.activeVault
            ? `Vault #${ctx.activeVault.vaultId} · Deposit $0 · Withdraw $0.50`
            : "Create a vault first, then Deposit / Withdraw"}
        </p>
        <div className="nv-form nopan nodrag nowheel">
          <label className="nv-check">
            <input
              type="checkbox"
              checked={s.autoFollow}
              disabled={ctx.running}
              onChange={(e) => ctx.setSettings({ autoFollow: e.target.checked })}
            />
            Auto-follow ON
          </label>
          <label className="nv-field">
            Copy size
            <select
              value={s.copyBps}
              disabled={ctx.running}
              onChange={(e) => ctx.setSettings({ copyBps: Number(e.target.value) })}
            >
              <option value={2500}>25%</option>
              <option value={5000}>50%</option>
              <option value={7500}>75%</option>
              <option value={10000}>100%</option>
            </select>
          </label>
          <label className="nv-field">
            Max position
            <select
              value={s.maxPositionBps}
              disabled={ctx.running}
              onChange={(e) => ctx.setSettings({ maxPositionBps: Number(e.target.value) })}
            >
              <option value={2500}>25%</option>
              <option value={5000}>50%</option>
              <option value={8000}>80%</option>
            </select>
          </label>
          <label className="nv-check">
            <input
              type="checkbox"
              checked={s.followTpSl}
              disabled={ctx.running}
              onChange={(e) => ctx.setSettings({ followTpSl: e.target.checked })}
            />
            Follow TP / SL
          </label>
          <label className="nv-field">
            Retail park
            <input
              type="number"
              min={0.05}
              max={2}
              step={0.01}
              value={s.parkSol}
              disabled={ctx.running}
              onChange={(e) => ctx.setSettings({ parkSol: Number(e.target.value) || 0.1 })}
            />
          </label>
        </div>
      </div>
      <div className="nv-foot nopan nodrag">
        <div className="nv-actions">
          <button
            type="button"
            className="btn btn-sm"
            title="Park SOL from degen + every loaded retail wallet into this vault — no deposit fee"
            disabled={ctx.running || !ctx.degen.pubkey || !retailReady || !ctx.activeVault}
            onClick={() => ctx.start("deposit")}
          >
            {ctx.runningMode === "deposit" ? "Depositing…" : "Deposit"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            title="Redeem vault SOL to the first retail wallet as native SOL — flat $0.50"
            disabled={ctx.running || !ctx.degen.pubkey || !retailReady || !ctx.activeVault}
            onClick={() => ctx.start("withdraw-wallet")}
          >
            {ctx.runningMode === "withdraw-wallet" ? "Withdrawing…" : "Withdraw"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
