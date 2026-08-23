import { useCallback, useEffect, useState } from "react";
import { getTokenResearch, listVaultPositions, listVaultTrades } from "../lib/api/client";
import type { FlowMode } from "../lib/flow";
import { formatLamportsAsSol } from "../lib/estimate";
import {
  attachTradeIds,
  parseVaultPositions,
  type VaultPositionRow,
} from "../lib/trade/positions";
import { IconTrade } from "./icons";

type FlowOpts = {
  positionId?: number;
  tradeId?: number;
  inputMint?: string;
  exitPercent?: number;
};

type Props = {
  activeVault: string | null;
  vaultId?: number;
  busy: boolean;
  flowRunning: boolean;
  onRunFlow: (mode: FlowMode, opts?: FlowOpts) => void;
};

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function pickResearchSummary(data: Record<string, unknown>): string {
  const info = (data.info ?? data.token ?? data) as Record<string, unknown>;
  const security = (data.security ?? {}) as Record<string, unknown>;
  const name = String(info.name ?? info.symbol ?? "Token");
  const rating = String(data.rating ?? security.rating ?? security.overallRating ?? "");
  const risks = Array.isArray(security.risks) ? security.risks.length : 0;
  if (rating) return `${name} · rating ${rating}`;
  if (risks > 0) return `${name} · ${risks} security flag(s)`;
  return `${name} · research loaded`;
}

export function TradePanel({ activeVault, vaultId, busy, flowRunning, onRunFlow }: Props) {
  const [positions, setPositions] = useState<VaultPositionRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mint, setMint] = useState("");
  const [research, setResearch] = useState<Record<string, unknown> | null>(null);
  const [researchErr, setResearchErr] = useState<string | null>(null);
  const [researchBusy, setResearchBusy] = useState(false);

  const loadPositions = useCallback(async () => {
    if (!activeVault) {
      setPositions([]);
      return;
    }
    setLoadErr(null);
    try {
      const [posData, tradesData] = await Promise.all([
        listVaultPositions(activeVault),
        listVaultTrades(activeVault).catch(() => ({ items: [] })),
      ]);
      const parsed = parseVaultPositions(posData as Record<string, unknown>);
      setPositions(attachTradeIds(parsed, tradesData.items ?? []));
    } catch (e) {
      setPositions([]);
      setLoadErr(e instanceof Error ? e.message : String(e));
    }
  }, [activeVault]);

  useEffect(() => {
    void loadPositions();
  }, [loadPositions]);

  useEffect(() => {
    void chrome.storage.session.get("tradeMint").then((stored) => {
      const m = stored.tradeMint;
      if (typeof m === "string" && m.length > 20) {
        setMint(m);
        void chrome.storage.session.remove("tradeMint");
      }
    });
  }, []);

  async function onResearch() {
    const m = mint.trim();
    if (!m) return;
    setResearchBusy(true);
    setResearchErr(null);
    setResearch(null);
    try {
      const data = await getTokenResearch(m);
      setResearch(data);
    } catch (e) {
      setResearchErr(e instanceof Error ? e.message : String(e));
    } finally {
      setResearchBusy(false);
    }
  }

  function exitPosition(pos: VaultPositionRow) {
    const sellMint = pos.outputMint || pos.inputMint;
    if (!sellMint) return;
    onRunFlow("exit-position", {
      positionId: pos.positionId,
      tradeId: pos.tradeId,
      inputMint: sellMint,
      exitPercent: 100,
    });
  }

  const disabled = busy || flowRunning;

  return (
    <div className="trade-panel">
      <section className="hero">
        <h1>Trade with vault</h1>
        <p>
          Research a mint, open a devnet demo position, or exit an open book. Vault{" "}
          {activeVault ? shortAddr(activeVault) : "—"}
          {vaultId ? ` #${vaultId}` : ""}.
        </p>
        <div className="hero-actions">
          <button
            className="btn btn-primary"
            disabled={disabled || !activeVault}
            onClick={() => onRunFlow("open-position")}
          >
            <IconTrade width={16} height={16} /> Open position
          </button>
          <button className="btn btn-secondary" disabled={disabled} onClick={() => void loadPositions()}>
            Refresh
          </button>
        </div>
      </section>

      <section className="dd-card">
        <div className="dd-head">
          <h2>Due diligence</h2>
          <span className="muted">GET /v1/tokens/&#123;mint&#125;/research</span>
        </div>
        <div className="field">
          <label>Token mint</label>
          <input
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            placeholder="Paste mint from GMGN or a position"
            onKeyDown={(e) => {
              if (e.key === "Enter") void onResearch();
            }}
          />
        </div>
        <button
          className="btn btn-secondary btn-block"
          disabled={researchBusy || !mint.trim()}
          onClick={() => void onResearch()}
        >
          {researchBusy ? "Loading…" : "Run research"}
        </button>
        {researchErr && <div className="err">{researchErr}</div>}
        {research && (
          <div className="dd-result">
            <strong>{pickResearchSummary(research)}</strong>
            <pre className="mono dd-json">
              {JSON.stringify(research, null, 2).slice(0, 1200)}
              {JSON.stringify(research).length > 1200 ? "…" : ""}
            </pre>
          </div>
        )}
      </section>

      <section className="list">
        <div className="dd-head">
          <h2>Open positions</h2>
          {!activeVault && <span className="muted">Select a vault on Home</span>}
        </div>
        {loadErr && <div className="err">{loadErr}</div>}
        {activeVault && positions.length === 0 && !loadErr && (
          <div className="empty-hint">No open positions — open one first.</div>
        )}
        {positions.map((pos) => (
          <div key={pos.positionId} className="row-card">
            <div className="token-icon">#{pos.positionId}</div>
            <div className="row-main">
              <div className="row-title">Position {pos.positionId}</div>
              <div className="row-sub mono">
                sell {shortAddr(pos.outputMint || pos.inputMint)} · trade {pos.tradeId}
              </div>
            </div>
            <div className="row-right">
              <div className="row-value">{formatLamportsAsSol(pos.currentValue || pos.entryValue, 3)}</div>
              <button
                type="button"
                className="btn btn-secondary btn-exit"
                disabled={disabled}
                onClick={() => exitPosition(pos)}
              >
                Exit
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
