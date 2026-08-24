import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { listVaultPositions, listVaultTrades } from "../lib/api/client";
import type { FlowMode, FlowState } from "../lib/flow";
import { attachTradeIds, parseVaultPositions, type VaultPositionRow } from "../lib/trade/positions";
import { sendBg } from "../lib/messaging";
import { formatLamportsAsSol, type PipelineEstimate } from "../lib/estimate";
import {
  IconActivity,
  IconCheck,
  IconClose,
  IconCreate,
  IconDown,
  IconExplore,
  IconHome,
  IconLink,
  IconPark,
  IconTrade,
  IconVault,
} from "./icons";
import { ListPager, ShimmerHero, ShimmerList, usePagedSlice } from "./Shimmer";
import { TradePanel } from "./TradePanel";

type NavId = "home" | "trade" | "activity" | "vault";
type ListTab = "vaults" | "capital" | "positions";
type KeyStatus = { has: boolean; unlocked: boolean; pubkey: string | null };
type VaultRow = Record<string, unknown>;

const PIPELINE_POLL_MS = 20_000;

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function vaultName(v: VaultRow) {
  return String(v.name ?? "Vault");
}

function vaultType(v: VaultRow) {
  return String(v.vaultType ?? v.vault_type ?? "pooled").toUpperCase();
}

export function SidePanelApp() {
  const [nav, setNav] = useState<NavId>("home");
  const [listTab, setListTab] = useState<ListTab>("vaults");
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [secret, setSecret] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [backendOk, setBackendOk] = useState<boolean | null>(null);
  const [vaults, setVaults] = useState<VaultRow[]>([]);
  const [activeVault, setActiveVault] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<PipelineEstimate | null>(null);
  const [showBanner, setShowBanner] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [flowState, setFlowState] = useState<FlowState | null>(null);
  const [positions, setPositions] = useState<VaultPositionRow[]>([]);
  const [vaultsLoading, setVaultsLoading] = useState(false);
  const [pipelineLoading, setPipelineLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [vaultPage, setVaultPage] = useState(1);
  const [positionPage, setPositionPage] = useState(1);

  const refreshStatus = useCallback(async () => {
    const s = await sendBg<KeyStatus>({ type: "KEYRING_STATUS" });
    setStatus(s);
    return s;
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const h = await sendBg<{ backend: Record<string, unknown> }>({ type: "HEALTH" });
      setBackendOk(!h.backend?.error);
    } catch {
      setBackendOk(false);
    }
  }, []);

  const loadVaults = useCallback(async () => {
    setVaultsLoading(true);
    try {
      const data = await sendBg<{
        pubkey: string;
        vaults: VaultRow[];
      }>({ type: "MY_VAULTS" });
      setVaults(data.vaults);
      setVaultPage(1);
      if (!activeVault && data.vaults[0]?.pubkey) {
        setActiveVault(String(data.vaults[0].pubkey));
      }
      return data;
    } finally {
      setVaultsLoading(false);
    }
  }, [activeVault]);

  const refreshPipeline = useCallback(async () => {
    if (!activeVault) return;
    setPipelineLoading(true);
    try {
      const p = await sendBg<PipelineEstimate>({ type: "PIPELINE", vault: activeVault });
      setPipeline(p);
    } catch {
      setPipeline(null);
    } finally {
      setPipelineLoading(false);
    }
  }, [activeVault]);

  const pollFlowState = useCallback(async () => {
    const s = await sendBg<FlowState>({ type: "FLOW_STATE" });
    setFlowState(s);
    return s;
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshStatus();
      await loadHealth();
      const stored = await chrome.storage.session.get(["activeVault", "openTradeTab"]);
      if (typeof stored.activeVault === "string") setActiveVault(stored.activeVault);
      if (stored.openTradeTab) {
        setNav("trade");
        await chrome.storage.session.remove("openTradeTab");
      }
    })();
  }, [refreshStatus, loadHealth]);

  useEffect(() => {
    if (status?.unlocked) {
      void loadVaults().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
  }, [status?.unlocked, loadVaults]);

  useEffect(() => {
    if (!activeVault || !status?.unlocked) {
      setPipeline(null);
      return;
    }
    void chrome.storage.session.set({ activeVault });
    void refreshPipeline();
  }, [activeVault, status?.unlocked, refreshPipeline]);

  useEffect(() => {
    if (!activeVault || !status?.unlocked) return;
    const id = window.setInterval(() => void refreshPipeline(), PIPELINE_POLL_MS);
    return () => window.clearInterval(id);
  }, [activeVault, status?.unlocked, refreshPipeline]);

  useEffect(() => {
    if (!status?.unlocked) return;
    void pollFlowState();
  }, [status?.unlocked, pollFlowState]);

  useEffect(() => {
    if (flowState?.status !== "running") return;
    const id = window.setInterval(() => {
      void pollFlowState().then((s) => {
        if (s.status === "completed") {
          void loadVaults();
          if (s.result?.vault) setActiveVault(s.result.vault);
          void refreshPipeline();
          setToast(`${s.mode?.replace("-", " ")} complete`);
          window.setTimeout(() => setToast(null), 3000);
        }
        if (s.status === "failed" && s.error) {
          setError(s.error);
        }
      });
    }, 600);
    return () => window.clearInterval(id);
  }, [flowState?.status, pollFlowState, loadVaults, refreshPipeline]);

  useEffect(() => {
    if (listTab !== "positions" || !activeVault) return;
    let cancelled = false;
    setPositionsLoading(true);
    setPositionPage(1);
    void Promise.all([
      listVaultPositions(activeVault),
      listVaultTrades(activeVault).catch(() => ({ items: [] })),
    ])
      .then(([posData, tradesData]) => {
        if (cancelled) return;
        const parsed = parseVaultPositions(posData as Record<string, unknown>);
        setPositions(attachTradeIds(parsed, tradesData.items ?? []));
      })
      .catch(() => {
        if (!cancelled) setPositions([]);
      })
      .finally(() => {
        if (!cancelled) setPositionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listTab, activeVault]);

  useEffect(() => {
    setVaultPage(1);
  }, [listTab]);

  const pagedVaults = usePagedSlice(vaults, vaultPage);
  const pagedPositions = usePagedSlice(positions, positionPage);

  const bar = useMemo(() => {
    if (!pipeline) return null;
    const committed = BigInt(pipeline.nav);
    const incoming =
      BigInt(pipeline.incoming.pendingLamports) + BigInt(pipeline.incoming.submittedLamports);
    const mandated = BigInt(pipeline.mandated.lamports);
    const total = committed + incoming + mandated;
    if (total === 0n) return { c: 0, i: 0, m: 0, incoming, mandated, committed };
    return {
      c: Number((committed * 100n) / total),
      i: Number((incoming * 100n) / total),
      m: Number((mandated * 100n) / total),
      incoming,
      mandated,
      committed,
    };
  }, [pipeline]);

  const selected = vaults.find((v) => String(v.pubkey) === activeVault) ?? null;
  const hasVaults = vaults.length > 0;

  const flowRunning = flowState?.status === "running";

  async function startFlow(
    mode: FlowMode,
    opts?: {
      vaultType?: "pooled" | "sliced";
      positionId?: number;
      tradeId?: number;
      inputMint?: string;
      exitPercent?: number;
    }
  ) {
    if (flowRunning) return;
    setBusy(true);
    setError(null);
    try {
      const vaultId = selected
        ? Number(selected.vaultId ?? selected.vault_id ?? 0) || undefined
        : undefined;
      await sendBg({
        type: "RUN_FLOW",
        mode,
        vault: activeVault ?? undefined,
        vaultId,
        vaultType: opts?.vaultType,
        parkSol: 0.1,
        positionId: opts?.positionId,
        tradeId: opts?.tradeId,
        inputMint: opts?.inputMint,
        exitPercent: opts?.exitPercent,
      });
      await pollFlowState();
      setNav("activity");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await sendBg({ type: "KEYRING_IMPORT", secret, password });
      setSecret("");
      setPassword("");
      setOk("Keyring ready");
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onUnlock() {
    setBusy(true);
    setError(null);
    try {
      await sendBg({ type: "KEYRING_UNLOCK", password });
      setPassword("");
      await refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLock() {
    await sendBg({ type: "KEYRING_LOCK" });
    setVaults([]);
    setPipeline(null);
    await refreshStatus();
  }

  /* ——— Locked / empty keyring ——— */
  if (!status?.has || !status.unlocked) {
    return (
      <div className="sp">
        <div className="sp-scroll">
          <TopBar
            label={status?.has ? "Locked wallet" : "New degen wallet"}
            addr={status?.pubkey ? shortAddr(status.pubkey) : "Import key"}
            backendOk={backendOk}
          />

          <section className="hero">
            <h1>{status?.has ? "Unlock to ride" : "Import degen key"}</h1>
            <p>
              Same vault. Degen signs. Vault pays. Secret stays encrypted on this device — never sent
              to the backend.
            </p>

            {!status?.has && (
              <div className="field">
                <label>Secret key</label>
                <textarea
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="JSON / base58 / hex"
                />
              </div>
            )}

            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={status?.has ? "Unlock password" : "Min 8 characters"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void (status?.has ? onUnlock() : onImport());
                }}
              />
            </div>

            <div className="hero-actions">
              {status?.has ? (
                <button
                  className="btn btn-primary"
                  disabled={busy || !password}
                  onClick={() => void onUnlock()}
                >
                  Unlock
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={busy || !secret || password.length < 8}
                  onClick={() => void onImport()}
                >
                  Create keyring
                </button>
              )}
            </div>
            {error && <div className="err">{error}</div>}
            {ok && <div className="ok">{ok}</div>}
          </section>

          <div className="quick" aria-hidden>
            <button type="button" className="quick-item" data-action="create" disabled>
              <div className="quick-icon">
                <IconCreate width={20} height={20} />
              </div>
              <span className="quick-meta">
                <strong>Create</strong>
                <em>New vault</em>
              </span>
            </button>
            <button type="button" className="quick-item" data-action="park" disabled>
              <div className="quick-icon">
                <IconPark width={20} height={20} />
              </div>
              <span className="quick-meta">
                <strong>Park</strong>
                <em>Add SOL</em>
              </span>
            </button>
            <button type="button" className="quick-item" data-action="trade" disabled>
              <div className="quick-icon">
                <IconTrade width={20} height={20} />
              </div>
              <span className="quick-meta">
                <strong>Trade</strong>
                <em>Open book</em>
              </span>
            </button>
            <button type="button" className="quick-item" data-action="close" disabled>
              <div className="quick-icon">
                <IconClose width={20} height={20} />
              </div>
              <span className="quick-meta">
                <strong>Close</strong>
                <em>Wind down</em>
              </span>
            </button>
          </div>
        </div>
        <BottomNav nav="home" onNav={setNav} />
      </div>
    );
  }

  return (
    <div className="sp">
      <div className="sp-scroll">
        <TopBar
          label="Degen account"
          addr={status.pubkey ? shortAddr(status.pubkey) : "—"}
          backendOk={backendOk}
          onLock={() => void onLock()}
        />

        {nav === "home" && (
          <div className="home-panels">
            {vaultsLoading && !hasVaults ? (
              <ShimmerHero />
            ) : (
            <section className="hero">
              {!hasVaults ? (
                <>
                  <h1>No vault yet</h1>
                  <p>
                    Lock 1,000,000 1VL, create a pooled vault, then park SOL. Retail rides with you —
                    close pays by share weight.
                  </p>
                  <div className="hero-actions">
                    <button
                      className="btn btn-primary"
                      disabled={busy || flowRunning}
                      onClick={() => void startFlow("create-vault")}
                    >
                      <IconDown /> Create vault
                    </button>
                    <button className="btn btn-secondary" onClick={() => setNav("trade")}>
                      <IconTrade width={16} height={16} /> Trade
                    </button>
                  </div>
                </>
              ) : pipelineLoading && !pipeline ? (
                <>
                  <div className="muted">
                    {selected ? vaultName(selected) : "Active vault"}{" "}
                    {selected && <span className="chip">{vaultType(selected)}</span>}
                  </div>
                  <div className="hero-nav shimmer-inline">
                    <span className="shimmer shimmer-line shimmer-nav" aria-hidden />
                    <span>SOL NAV</span>
                  </div>
                  <div className="shimmer shimmer-line shimmer-line-md" style={{ width: "72%" }} />
                  <div className="shimmer shimmer-bar" />
                  <div className="hero-actions">
                    <button className="btn btn-primary" disabled>
                      <IconDown /> Park SOL
                    </button>
                    <button className="btn btn-secondary" disabled>
                      <IconTrade width={16} height={16} /> Open position
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="muted">
                    {selected ? vaultName(selected) : "Active vault"}{" "}
                    {selected && <span className="chip">{vaultType(selected)}</span>}
                  </div>
                  <div className="hero-nav">
                    {pipeline ? formatLamportsAsSol(pipeline.nav, 3) : "—"}
                    <span>SOL NAV</span>
                  </div>
                  <p>
                    Buying power{" "}
                    {pipeline ? formatLamportsAsSol(pipeline.projected.buyingPower, 3) : "—"} SOL ·
                    incoming{" "}
                    {bar ? formatLamportsAsSol(bar.incoming.toString(), 3) : "0"} SOL
                  </p>
                  {bar && (
                    <>
                      <div className="stack-bar" title="committed / incoming / mandated">
                        <span style={{ width: `${bar.c}%`, background: "var(--accent)" }} />
                        <span style={{ width: `${bar.i}%`, background: "var(--accent-bright)" }} />
                        <span style={{ width: `${bar.m}%`, background: "#666" }} />
                      </div>
                      <div className="legend">
                        <span>
                          <i style={{ background: "var(--accent)" }} />
                          Committed
                        </span>
                        <span>
                          <i style={{ background: "var(--accent-bright)" }} />
                          Incoming
                        </span>
                        <span>
                          <i style={{ background: "#666" }} />
                          Mandated
                        </span>
                      </div>
                    </>
                  )}
                  <div className="hero-actions">
                    <button
                      className="btn btn-primary"
                      disabled={busy || flowRunning || !activeVault}
                      onClick={() => void startFlow("deposit")}
                    >
                      <IconDown /> Park SOL
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={busy || flowRunning || !activeVault}
                      onClick={() => void startFlow("open-position")}
                    >
                      <IconTrade width={16} height={16} /> Open position
                    </button>
                  </div>
                </>
              )}
            </section>
            )}

            <div className="quick">
              <button
                type="button"
                className="quick-item"
                data-action="create"
                disabled={busy || flowRunning}
                onClick={() => void startFlow("create-vault")}
              >
                <div className="quick-icon">
                  <IconCreate width={20} height={20} />
                </div>
                <span className="quick-meta">
                  <strong>Create</strong>
                  <em>New vault</em>
                </span>
              </button>
              <button
                type="button"
                className="quick-item"
                data-action="park"
                disabled={busy || flowRunning || !activeVault}
                onClick={() => void startFlow("deposit")}
              >
                <div className="quick-icon">
                  <IconPark width={20} height={20} />
                </div>
                <span className="quick-meta">
                  <strong>Park</strong>
                  <em>Add SOL</em>
                </span>
              </button>
              <button
                type="button"
                className="quick-item"
                data-action="trade"
                disabled={busy || flowRunning || !activeVault}
                onClick={() => void startFlow("open-position")}
              >
                <div className="quick-icon">
                  <IconTrade width={20} height={20} />
                </div>
                <span className="quick-meta">
                  <strong>Trade</strong>
                  <em>Open book</em>
                </span>
              </button>
              <button
                type="button"
                className="quick-item"
                data-action="close"
                disabled={busy || flowRunning || !activeVault}
                onClick={() => void startFlow("close-vault")}
              >
                <div className="quick-icon">
                  <IconClose width={20} height={20} />
                </div>
                <span className="quick-meta">
                  <strong>Close</strong>
                  <em>Wind down</em>
                </span>
              </button>
            </div>

            {showBanner && bar && bar.incoming > 0n && (
              <div className="banner">
                <button type="button" className="banner-x" onClick={() => setShowBanner(false)}>
                  ×
                </button>
                <div className="banner-kicker">Capital in motion</div>
                <strong>+{formatLamportsAsSol(bar.incoming.toString(), 3)} SOL incoming</strong>
                <p>
                  Retail parked or mandated funds waiting to confirm. Projected NAV{" "}
                  {pipeline ? formatLamportsAsSol(pipeline.projected.nav, 3) : "—"} SOL.
                </p>
              </div>
            )}

            <div className="seg">
              <div className="seg-track">
                {(
                  [
                    ["vaults", "Vaults"],
                    ["capital", "Capital"],
                    ["positions", "Positions"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`seg-btn${listTab === id ? " active" : ""}`}
                    onClick={() => setListTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {listTab === "vaults" && (
              <>
                {vaultsLoading ? (
                  <ShimmerList count={3} className="vault-grid" />
                ) : (
                  <>
                    <div className="list vault-grid">
                      {vaults.length === 0 && (
                        <div className="empty-hint">No vaults indexed yet for this degen.</div>
                      )}
                      {pagedVaults.slice.map((v) => {
                        const pk = String(v.pubkey ?? "");
                        const active = pk === activeVault;
                        return (
                          <button
                            key={pk}
                            type="button"
                            className={`row-card${active ? " active" : ""}`}
                            onClick={() => setActiveVault(pk)}
                          >
                            <div className="token-icon">
                              1V
                              <span className="badge-dot">
                                <IconCheck />
                              </span>
                            </div>
                            <div className="row-main">
                              <div className="row-title">
                                {vaultName(v)}
                                <span className="chip">{vaultType(v)}</span>
                              </div>
                              <div className="row-sub mono">{shortAddr(pk)}</div>
                            </div>
                            <div className="row-right">
                              <div className="row-value">
                                {formatLamportsAsSol(String(v.nav ?? v.total_assets ?? "0"), 2)}
                              </div>
                              <div className="row-meta">SOL NAV</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <ListPager
                      page={pagedVaults.page}
                      totalPages={pagedVaults.totalPages}
                      total={pagedVaults.total}
                      pageSize={pagedVaults.pageSize}
                      onPage={setVaultPage}
                    />
                  </>
                )}
              </>
            )}

            {listTab === "capital" && (
              <div className="list">
                {pipelineLoading && !pipeline ? (
                  <ShimmerList count={3} />
                ) : !pipeline ? (
                  <div className="empty-hint">Select a vault to load capital pipeline.</div>
                ) : (
                  <>
                    <div className="row-card">
                      <div className="token-icon">IN</div>
                      <div className="row-main">
                        <div className="row-title">Incoming intents</div>
                        <div className="row-sub">
                          {pipeline.incoming.count} pending + submitted
                        </div>
                      </div>
                      <div className="row-right">
                        <div className="row-value">
                          {formatLamportsAsSol(
                            (
                              BigInt(pipeline.incoming.pendingLamports) +
                              BigInt(pipeline.incoming.submittedLamports)
                            ).toString(),
                            3
                          )}
                        </div>
                        <div className="row-meta">SOL</div>
                      </div>
                    </div>
                    <div className="row-card">
                      <div className="token-icon">MD</div>
                      <div className="row-main">
                        <div className="row-title">Mandates</div>
                        <div className="row-sub">
                          {pipeline.mandated.count} retail · TP{" "}
                          {pipeline.mandated.avgTakeProfitBps ?? "—"} / SL{" "}
                          {pipeline.mandated.avgStopLossBps ?? "—"} bps
                        </div>
                      </div>
                      <div className="row-right">
                        <div className="row-value">
                          {formatLamportsAsSol(pipeline.mandated.lamports, 3)}
                        </div>
                        <div className="row-meta">SOL</div>
                      </div>
                    </div>
                    <div className="row-card">
                      <div className="token-icon">BP</div>
                      <div className="row-main">
                        <div className="row-title">Buying power</div>
                        <div className="row-sub">Assets + incoming</div>
                      </div>
                      <div className="row-right">
                        <div className="row-value">
                          {formatLamportsAsSol(pipeline.projected.buyingPower, 3)}
                        </div>
                        <div className="row-meta">SOL</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {listTab === "positions" && (
              <>
                {!activeVault ? (
                  <div className="empty-hint">Select a vault to load open positions.</div>
                ) : positionsLoading ? (
                  <ShimmerList count={3} />
                ) : (
                  <>
                    <div className="list">
                      {positions.length === 0 && (
                        <div className="empty-hint">No open positions on this vault.</div>
                      )}
                      {pagedPositions.slice.map((p) => (
                        <div key={p.positionId} className="row-card">
                          <div className="token-icon">POS</div>
                          <div className="row-main">
                            <div className="row-title">Position #{p.positionId}</div>
                            <div className="row-sub mono">
                              {shortAddr(p.outputMint || p.inputMint)}
                            </div>
                          </div>
                          <div className="row-right">
                            <div className="row-value">
                              {formatLamportsAsSol(p.currentValue || p.entryValue, 3)}
                            </div>
                            <div className="row-meta">SOL value</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <ListPager
                      page={pagedPositions.page}
                      totalPages={pagedPositions.totalPages}
                      total={pagedPositions.total}
                      pageSize={pagedPositions.pageSize}
                      onPage={setPositionPage}
                    />
                  </>
                )}
              </>
            )}
          </div>
        )}

        {nav === "trade" && (
          <TradePanel
            activeVault={activeVault}
            vaultId={
              selected ? Number(selected.vaultId ?? selected.vault_id ?? 0) || undefined : undefined
            }
            busy={busy}
            flowRunning={flowRunning}
            onRunFlow={(mode, opts) => void startFlow(mode, opts)}
          />
        )}

        {nav === "activity" && (
          <section className="activity">
            <h1>Activity</h1>
            {flowState?.status === "running" && (
              <p className="muted">Running {flowState.mode?.replace("-", " ")}…</p>
            )}
            {flowState?.status === "failed" && flowState.error && (
              <div className="err">{flowState.error}</div>
            )}
            {flowState?.status === "completed" && (
              <div className="ok">Last flow completed</div>
            )}
            <div className="flow-log">
              {(flowState?.events ?? []).length === 0 && (
                <div className="empty-hint">No flow steps yet — run Create vault or Park SOL.</div>
              )}
              {[...(flowState?.events ?? [])].reverse().map((ev, i) => (
                <div key={`${ev.at}-${i}`} className={`flow-row ${ev.status}`}>
                  <div className="flow-step">{ev.step}</div>
                  <div className="flow-detail">{ev.detail ?? ev.status}</div>
                  {ev.tx && <div className="flow-tx mono">{ev.tx.slice(0, 16)}…</div>}
                </div>
              ))}
            </div>
            <button
              className="btn btn-secondary btn-block"
              disabled={busy}
              onClick={() => void loadVaults().then(() => refreshPipeline())}
            >
              Refresh vaults
            </button>
          </section>
        )}

        {nav === "vault" && (
          <section className="hero">
            <h1>Vault tools</h1>
            <p>Licence lock, claim fees, initiate close, unlock 1VL — Fees & Close flows.</p>
            <div className="hero-actions">
              <button
                className="btn btn-primary"
                disabled={busy || flowRunning || !activeVault}
                onClick={() => void startFlow("claim-fees")}
              >
                Claim fees
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy || flowRunning || !activeVault}
                onClick={() => void startFlow("close-vault")}
              >
                Close vault
              </button>
            </div>
          </section>
        )}

        {error && <div className="err">{error}</div>}
        {toast && <div className="ok">{toast}</div>}
      </div>

      <BottomNav nav={nav} onNav={setNav} />
    </div>
  );
}

function TopBar({
  label,
  addr,
  backendOk,
  onLock,
}: {
  label: string;
  addr: string;
  backendOk: boolean | null;
  onLock?: () => void;
}) {
  return (
    <div className="sp-top">
      <button type="button" className="sp-account">
        <div className="sp-avatar" />
        <div className="sp-account-meta">
          <div className="sp-account-label">{label}</div>
          <div className="sp-account-addr">{addr}</div>
        </div>
      </button>
      <div className="sp-top-actions">
        <button type="button" className="icon-btn" title="1Vault" aria-label="1Vault">
          <IconLink />
        </button>
        <button
          type="button"
          className={`pill${backendOk === false ? " bad" : backendOk ? "" : " warn"}`}
          onClick={onLock}
          title={onLock ? "Lock keyring" : undefined}
        >
          <span className="dot" />
          {backendOk === false ? "Offline" : "Devnet"}
        </button>
      </div>
    </div>
  );
}

function BottomNav({ nav, onNav }: { nav: NavId; onNav: (n: NavId) => void }) {
  const items: Array<{ id: NavId; label: string; icon: ReactNode }> = [
    { id: "home", label: "Home", icon: <IconHome /> },
    { id: "trade", label: "Trade", icon: <IconExplore /> },
    { id: "activity", label: "Activity", icon: <IconActivity /> },
    { id: "vault", label: "Vault", icon: <IconVault /> },
  ];
  return (
    <nav className="sp-nav">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`nav-item${nav === it.id ? " active" : ""}`}
          onClick={() => onNav(it.id)}
        >
          {it.icon}
          <span className="nav-label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
