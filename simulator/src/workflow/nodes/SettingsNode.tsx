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
            <div className="nv-kicker">retail mandate</div>
            <div className="nv-title">Park + TP / SL</div>
          </div>
        </div>
        <span className={`pill pill-${view.status}`}>{statusLabel(view.status)}</span>
      </div>
      <div className="nv-body">
        <p className="nv-hint">
          {ctx.activeVault
            ? `Vault #${ctx.activeVault.vaultId} · Set how much to park. Degen executes. Close hits everyone.`
            : "Create a vault first, then set park amount + TP / SL"}
        </p>
        <div className="nv-form nopan nodrag nowheel">
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
          <label className="nv-field">
            Take profit
            <select
              value={s.takeProfitBps}
              disabled={ctx.running}
              onChange={(e) => ctx.setSettings({ takeProfitBps: Number(e.target.value) })}
            >
              <option value={1000}>10%</option>
              <option value={2000}>20%</option>
              <option value={3000}>30%</option>
              <option value={5000}>50%</option>
            </select>
          </label>
          <label className="nv-field">
            Stop loss
            <select
              value={s.stopLossBps}
              disabled={ctx.running}
              onChange={(e) => ctx.setSettings({ stopLossBps: Number(e.target.value) })}
            >
              <option value={300}>3%</option>
              <option value={500}>5%</option>
              <option value={1000}>10%</option>
              <option value={2000}>20%</option>
            </select>
          </label>
          <label className="nv-check">
            <input
              type="checkbox"
              checked={s.autoFollow}
              disabled={ctx.running}
              onChange={(e) => ctx.setSettings({ autoFollow: e.target.checked })}
            />
            Ride degen close
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
