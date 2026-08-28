import { useCallback, useEffect, useState } from "react";
import { getTokenResearch, listVaultPositions, listVaultTrades } from "../lib/api/client";
import type { FlowMode } from "../lib/flow";
import { formatLamportsAsSol, type ParkBreakdown } from "../lib/estimate";
import {
  attachTradeIds,
  parseVaultPositions,
  type VaultPositionRow,
} from "../lib/trade/positions";
import { IconBolt, IconChevronDown, IconSolana, IconTrade } from "./icons";
import { SolAmount } from "./SolAmount";
import {
  ListPager,
  ShimmerList,
  ShimmerResearch,
  usePagedSlice,
} from "./Shimmer";

type FlowOpts = {
  positionId?: number;
  tradeId?: number;
  inputMint?: string;
  exitPercent?: number;
};

type Props = {
  activeVault: string | null;
  vaultId?: number;
  vaultName?: string;
  vaultTypeLabel?: string;
  vaultStatus?: string;
  vaultClosed?: boolean;
  parkBreakdown?: ParkBreakdown | null;
  busy: boolean;
  flowRunning: boolean;
  onRunFlow: (mode: FlowMode, opts?: FlowOpts) => void;
};

const GMGN_SOL_URL = "https://gmgn.ai/sol";

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function mintTicker(mint: string): string {
  if (!mint) return "TOKEN";
  return mint.slice(0, 6).toUpperCase();
}

function mintHue(mint: string): number {
  let h = 0;
  for (let i = 0; i < mint.length; i++) h = (h * 31 + mint.charCodeAt(i)) >>> 0;
  return h % 360;
}

function pnlPercent(entryValue: string, currentValue: string): number | null {
  try {
    const entry = BigInt(entryValue || "0");
    if (entry <= 0n) return null;
    const current = BigInt(currentValue || entryValue || "0");
    return Number(((current - entry) * 10000n) / entry) / 100;
  } catch {
    return null;
  }
}

function formatPnl(pct: number): string {
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
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

export function TradePanel({
  activeVault,
  vaultId,
  vaultName,
  vaultTypeLabel,
  vaultStatus,
  vaultClosed,
  parkBreakdown,
  busy,
  flowRunning,
  onRunFlow,
}: Props) {
  const [positions, setPositions] = useState<VaultPositionRow[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mint, setMint] = useState("");
  const [research, setResearch] = useState<Record<string, unknown> | null>(null);
  const [researchErr, setResearchErr] = useState<string | null>(null);
  const [researchBusy, setResearchBusy] = useState(false);
  const [page, setPage] = useState(1);

  const loadPositions = useCallback(async () => {
    if (!activeVault) {
      setPositions([]);
      setPositionsLoading(false);
      return;
    }
    setLoadErr(null);
    setPositionsLoading(true);
    setPage(1);
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
    } finally {
      setPositionsLoading(false);
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

  function buyMore(pos: VaultPositionRow) {
    const held = pos.outputMint || pos.inputMint;
    if (held) setMint(held);
    onRunFlow("open-position");
  }

  const disabled = busy || flowRunning;
  const paged = usePagedSlice(positions, page);
  const hasMint = mint.trim().length > 20;

  const myPark = parkBreakdown
    ? formatLamportsAsSol(parkBreakdown.strategist.committed, 2)
    : null;
  const totalPark = parkBreakdown
    ? formatLamportsAsSol(parkBreakdown.total.committed, 2)
    : null;

  if (!activeVault) {
    return (
      <div className="trade-panel">
        <section className="flow-card">
          <header className="flow-card-head">
            <h2 className="flow-card-title">Trade with vault</h2>
            <p className="flow-card-sub">Please select a vault first.</p>
          </header>
          <div className="flow-card-body">
            <p className="empty-hint">
              Go to Home, pick an Active vault from your list, then tap Trade again.
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (vaultClosed) {
    return (
      <div className="trade-panel">
        <section className="flow-card">
          <header className="flow-card-head">
            <h2 className="flow-card-title">Trade with vault</h2>
            <p className="flow-card-sub">This vault is Closed.</p>
          </header>
          <div className="flow-card-body">
            <p className="empty-hint">
              {vaultName ? `${vaultName} · ` : ""}
              {shortAddr(activeVault)} is closed — trading and new positions are disabled. Select an
              Active vault on Home to trade again.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="trade-panel">
      <section className="trade-vault-card">
        <div className="trade-vault-head">
          <div className="trade-vault-title-row">
            <h2 className="trade-vault-name">{vaultName || "Active vault"}</h2>
            {vaultTypeLabel ? <span className="chip">{vaultTypeLabel}</span> : null}
            {vaultStatus ? <span className="chip muted-chip">{vaultStatus}</span> : null}
          </div>
          <p className="trade-vault-addr mono" title={activeVault}>
            {shortAddr(activeVault)}
            {vaultId != null ? ` · #${vaultId}` : ""}
          </p>
        </div>

        {(myPark != null || totalPark != null) && (
          <div className="trade-vault-stats">
            <div className="trade-vault-stat">
              <span className="trade-vault-stat-label">My Park</span>
              <span className="trade-vault-stat-value">
                <SolAmount value={myPark ?? "—"} unit="SOL" size="sm" />
              </span>
            </div>
            <div className="trade-vault-stat">
              <span className="trade-vault-stat-label">Total Park</span>
              <span className="trade-vault-stat-value">
                <SolAmount value={totalPark ?? "—"} unit="SOL" size="sm" />
              </span>
            </div>
            <div className="trade-vault-stat">
              <span className="trade-vault-stat-label">Open</span>
              <span className="trade-vault-stat-value">{positions.length}</span>
            </div>
          </div>
        )}

        <div className="trade-gmgn-guide">
          <h3>Open a token on GMGN</h3>
          <ol>
            <li>
              Open{" "}
              <a href={GMGN_SOL_URL} target="_blank" rel="noreferrer">
                gmgn.ai
              </a>{" "}
              and open the Solana token you want to trade.
            </li>
            <li>
              On the token page, tap the <strong>1vaults · Trade</strong> pill to send the mint
              back here.
            </li>
            <li>Review research below, then open or exit the position with this vault.</li>
          </ol>
          <a className="btn btn-primary btn-block" href={GMGN_SOL_URL} target="_blank" rel="noreferrer">
            Open GMGN
          </a>
        </div>
      </section>

      <section className="dd-card">
        <div className="dd-head">
          <h2>Due diligence</h2>
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
        <div className="hero-actions">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={researchBusy || !mint.trim()}
            onClick={() => void onResearch()}
          >
            {researchBusy ? "Loading…" : "Run research"}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={disabled || !hasMint}
            title={hasMint ? "Open position with this mint" : "Paste a mint from GMGN first"}
            onClick={() => onRunFlow("open-position")}
          >
            <IconTrade width={16} height={16} /> Open position
          </button>
        </div>
        {researchErr && <div className="err">{researchErr}</div>}
        {researchBusy && <ShimmerResearch />}
        {research && !researchBusy && (
          <div className="dd-result">
            <strong>{pickResearchSummary(research)}</strong>
            <pre className="mono dd-json">
              {JSON.stringify(research, null, 2).slice(0, 1200)}
              {JSON.stringify(research).length > 1200 ? "…" : ""}
            </pre>
          </div>
        )}
      </section>

      <section className="holdings-card">
        <div className="holdings-head">
          <h2>Holdings</h2>
          <button type="button" className="holdings-filter" disabled title="Open positions">
            Active
            <IconChevronDown width={12} height={12} />
          </button>
        </div>
        <div className="holdings-cols" aria-hidden>
          <span>Token</span>
          <span>Remaining</span>
          <span>Buy</span>
          <span>Sell</span>
        </div>
        {loadErr && <div className="err">{loadErr}</div>}
        {positionsLoading ? (
          <ShimmerList count={3} />
        ) : (
          <>
            <div className="holdings-list">
              {positions.length === 0 && !loadErr && (
                <div className="empty-hint">No open holdings — open a token on GMGN first.</div>
              )}
              {paged.slice.map((pos) => {
                const heldMint = pos.outputMint || pos.inputMint;
                const ticker = mintTicker(heldMint);
                const remaining = pos.currentValue || pos.entryValue;
                const pnl = pnlPercent(pos.entryValue, remaining);
                const hue = mintHue(heldMint);
                return (
                  <div key={pos.positionId} className="holding-row">
                    <div className="holding-token">
                      <div
                        className="holding-avatar"
                        style={{
                          background: `linear-gradient(145deg, hsl(${hue} 55% 38%), hsl(${(hue + 40) % 360} 60% 52%))`,
                        }}
                        title={heldMint}
                      >
                        {ticker.slice(0, 2)}
                      </div>
                      <span className="holding-ticker" title={heldMint}>
                        {ticker}
                      </span>
                    </div>
                    <div className="holding-remaining">
                      <SolAmount value={formatLamportsAsSol(remaining, 3)} size="sm" />
                      {pnl != null && (
                        <span className={`holding-pnl${pnl < 0 ? " down" : pnl > 0 ? " up" : ""}`}>
                          {formatPnl(pnl)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="holding-action holding-buy"
                      disabled={disabled}
                      onClick={() => buyMore(pos)}
                      title="Buy more"
                    >
                      <IconBolt width={11} height={11} className="holding-bolt buy" />
                      <span>Amt</span>
                      <IconSolana width={10} />
                    </button>
                    <button
                      type="button"
                      className="holding-action holding-sell"
                      disabled={disabled}
                      onClick={() => exitPosition(pos)}
                      title="Sell position"
                    >
                      <IconBolt width={11} height={11} className="holding-bolt sell" />
                      <span>Sell</span>
                    </button>
                  </div>
                );
              })}
            </div>
            <ListPager
              page={paged.page}
              totalPages={paged.totalPages}
              total={paged.total}
              pageSize={paged.pageSize}
              onPage={setPage}
            />
          </>
        )}
      </section>
    </div>
  );
}
