import { Handle, Position } from "@xyflow/react";
import { shortAddr, statusLabel, useWorkflow } from "../context";
import { formatLamports } from "../../shares";
import { NodeIcon } from "../icons";

function HoldingRow({
  vaultId,
  name,
  vault,
  redeemableShares,
  estLamports,
  blockedReason,
}: {
  vaultId?: number;
  name?: string;
  vault: string;
  redeemableShares: number;
  estLamports?: number;
  blockedReason?: string;
}) {
  const redeemable = redeemableShares > 0;
  const label = vaultId ? `Vault #${vaultId}` : shortAddr(vault);
  const title = name ? `${label} · ${name}` : label;
  return (
    <li className={`withdraw-row ${redeemable ? "is-ready" : "is-blocked"}`}>
      <div className="withdraw-row-main">
        <span className="withdraw-row-title">{title}</span>
        <span className="withdraw-row-amt">{formatLamports(estLamports)}</span>
      </div>
      <div className="withdraw-row-sub mono">
        {redeemable ? (
          <span className="pill pill-ready">ready to withdraw</span>
        ) : (
          <span className="pill pill-warn">blocked</span>
        )}
        <span title={vault}>{shortAddr(vault)}</span>
      </div>
      {blockedReason ? <div className="withdraw-row-note">{blockedReason}</div> : null}
    </li>
  );
}

export default function SettingsNode() {
  const ctx = useWorkflow();
  const s = ctx.settings;
  const view = ctx.views.settings;
  const retailReady = ctx.retails.some((r) => r.pubkey);
  const holdings = ctx.withdrawHoldings;
  const redeemable = holdings.filter((h) => h.redeemableShares > 0);
  const blocked = holdings.filter((h) => h.onChainShares > 0 && h.redeemableShares <= 0);

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
            ? `Vault #${ctx.activeVault.vaultId} · Set park amount. Withdraw redeems all vaults with shares.`
            : "Create a vault first, then set park amount + TP / SL"}
        </p>

        {retailReady ? (
          <div className="withdraw-panel nopan nodrag nowheel">
            <div className="withdraw-panel-head">
              <span>Unwithdrawn vaults</span>
              <button
                type="button"
                className="btn-link"
                disabled={ctx.running || ctx.withdrawHoldingsLoading}
                onClick={() => void ctx.refreshWithdrawHoldings()}
              >
                {ctx.withdrawHoldingsLoading ? "…" : "Refresh"}
              </button>
            </div>
            {ctx.withdrawHoldingsLoading && holdings.length === 0 ? (
              <p className="withdraw-empty">Loading on-chain shares…</p>
            ) : holdings.length === 0 ? (
              <p className="withdraw-empty">No vault shares for this retail wallet.</p>
            ) : (
              <>
                {redeemable.length > 0 ? (
                  <>
                    <p className="withdraw-section-label">
                      Ready ({redeemable.length}) — akan di-redeem saat Withdraw
                    </p>
                    <ul className="withdraw-list">
                      {redeemable.map((h) => (
                        <HoldingRow key={h.vault} {...h} />
                      ))}
                    </ul>
                  </>
                ) : null}
                {blocked.length > 0 ? (
                  <>
                    <p className="withdraw-section-label">
                      Masih punya shares, belum bisa withdraw ({blocked.length})
                    </p>
                    <ul className="withdraw-list">
                      {blocked.map((h) => (
                        <HoldingRow
                          key={h.vault}
                          vault={h.vault}
                          vaultId={h.vaultId}
                          name={h.name}
                          redeemableShares={0}
                          estLamports={h.estLamports}
                          blockedReason={h.blockedReason}
                        />
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </div>
        ) : null}

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
            title={
              redeemable.length > 0
                ? `Redeem ${redeemable.length} vault(s) to native SOL`
                : "No redeemable vault shares"
            }
            disabled={ctx.running || !retailReady || redeemable.length === 0}
            onClick={() => ctx.start("withdraw-wallet")}
          >
            {ctx.runningMode === "withdraw-wallet"
              ? "Withdrawing…"
              : redeemable.length > 1
                ? `Withdraw all (${redeemable.length})`
                : "Withdraw"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
