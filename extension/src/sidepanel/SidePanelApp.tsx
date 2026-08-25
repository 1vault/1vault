import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listVaultPositions, listVaultTrades } from "../lib/api/client";
import type { FlowMode, FlowState } from "../lib/flow";
import { attachTradeIds, parseVaultPositions, type VaultPositionRow } from "../lib/trade/positions";
import { sendBg } from "../lib/messaging";
import { formatLamportsAsSol, type ParkBreakdown, type PipelineEstimate } from "../lib/estimate";
import { solToLamports } from "../lib/signing";
import { runParkGuest } from "../lib/investor-tx";
import { getUnlockedKeypair } from "../lib/keyring";
import {
  type AuthSession,
  type AuthUser,
  displayXName,
  loadStoredSession,
  logoutAuth,
  refreshAuthSession,
  roleLabelForWallet,
  startTwitterLogin,
} from "../lib/auth";
import {
  IconActivity,
  IconCheck,
  IconClose,
  IconCreate,
  IconDiscover,
  IconDown,
  IconHome,
  IconLink,
  IconMarket,
  IconPark,
  IconTrade,
  IconVault,
  IconX,
} from "./icons";
import { HeroHead } from "./InfoTip";
import { ListPager, ShimmerHero, ShimmerList, usePagedSlice } from "./Shimmer";
import { SolAmount } from "./SolAmount";
import { TradePanel } from "./TradePanel";
import { VaultSummary, VaultSummaryShimmer } from "./VaultSummary";
import { BindWalletModal } from "./BindWalletModal";
import { CapitalDetail } from "./CapitalDetail";
import { CreateVaultWizard, type CreateVaultResult } from "./CreateVaultWizard";
import { DiscoverPanel } from "./DiscoverPanel";
import { HoldingsTab } from "./HoldingsTab";
import { HistoryPanel, historyEntryFromMode, type TxHistoryItem } from "./HistoryPanel";
import { ProcessingBanner, completedLabel } from "./ProcessingBanner";
import { ParkPage } from "./ParkPage";
import { SettingsPanel } from "./SettingsPanel";
import { VaultProfileView } from "./VaultProfileView";

type NavId = "home" | "discover" | "trade" | "activity" | "vault" | "settings";
type ListTab = "vaults" | "capital" | "positions" | "holdings";
type KeyStatus = { has: boolean; unlocked: boolean; pubkey: string | null };
type VaultRow = Record<string, unknown>;

const PIPELINE_POLL_MS = 20_000;

function shortAddr(pk: string) {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function vaultAddrShort(pk: string) {
  if (pk.length < 12) return pk;
  return `${pk.slice(0, 3)}.........${pk.slice(-4)}`;
}

function vaultName(v: VaultRow) {
  return String(v.name ?? "Vault");
}

function vaultType(v: VaultRow) {
  return String(v.vaultType ?? v.vault_type ?? "pooled").toUpperCase();
}

function closeVaultBlockedMessage(selected: VaultRow | null): string {
  const reason = String(selected?.closeBlockedReason ?? "");
  const st = String(selected?.vaultStatus ?? "unknown");
  if (st === "Closed" || reason === "closed") return "Vault is already Closed.";
  if (reason === "open_positions") {
    const n = Number(selected?.openPositions ?? 0);
    return n > 0
      ? `Vault still has ${n} open position(s). Exit them on Trade first, then Close.`
      : "Vault still has open positions or pending trades. Exit them on Trade first, then Close.";
  }
  if (reason === "legacy") {
    return "Cannot close this vault (legacy layout or missing account). Create a new vault.";
  }
  return "Cannot close this vault right now.";
}

function friendlyFlowError(raw: string): string {
  if (/VaultHasOpenPositions|0x177f|error number: 6015|open_positions|still has open activity/i.test(raw)) {
    return "Vault still has open positions. Exit them on Trade first, then Close.";
  }
  if (/ConstraintSeeds|0x7d6|error code: 2006|incompatible on-chain layout/i.test(raw)) {
    return "This vault uses an old on-chain layout. Create a new vault and park there — legacy vaults cannot withdraw/close.";
  }
  return raw;
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
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [bindModalOpen, setBindModalOpen] = useState(false);
  const [walletSol, setWalletSol] = useState<string | null>(null);
  const [parkBreakdown, setParkBreakdown] = useState<ParkBreakdown | null>(null);
  const [parkBreakdownLoading, setParkBreakdownLoading] = useState(false);
  const [txHistory, setTxHistory] = useState<TxHistoryItem[]>([]);
  const [detailVault, setDetailVault] = useState<string | null>(null);
  const [holdingsTick, setHoldingsTick] = useState(0);
  const [parkScreen, setParkScreen] = useState<{
    vault: string | null;
    role: "strategist" | "investor";
    vaultLabel?: string;
  } | null>(null);
  const [createScreenOpen, setCreateScreenOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const authUser = authSession?.user;
  const roleLabel = useMemo(
    () => roleLabelForWallet(authUser, status?.pubkey ?? null),
    [authUser, status?.pubkey]
  );

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
    void (async () => {
      const stored = await loadStoredSession();
      if (!stored) return;
      try {
        const session = await refreshAuthSession(stored.refreshToken);
        setAuthSession(session);
      } catch {
        await logoutAuth(stored.refreshToken);
        setAuthSession(null);
      }
    })();
  }, []);

  useEffect(() => {
    if (!status?.unlocked || !status.pubkey) {
      setWalletSol(null);
      return;
    }
    void sendBg<{ lamports: string }>({ type: "WALLET_BALANCE", pubkey: status.pubkey })
      .then((b) => setWalletSol(formatLamportsAsSol(b.lamports, 2)))
      .catch(() => setWalletSol(null));
  }, [status?.unlocked, status?.pubkey, holdingsTick]);

  const refreshWalletSol = useCallback(async () => {
    if (!status?.pubkey) return;
    try {
      const b = await sendBg<{ lamports: string }>({
        type: "WALLET_BALANCE",
        pubkey: status.pubkey,
      });
      setWalletSol(formatLamportsAsSol(b.lamports, 2));
    } catch {
      /* keep previous */
    }
  }, [status?.pubkey]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!accountMenuRef.current?.contains(e.target as Node)) setAccountMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [accountMenuOpen]);

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
    if (!activeVault || !status?.unlocked || !pipeline) {
      setParkBreakdown(null);
      return;
    }
    let cancelled = false;
    setParkBreakdownLoading(true);
    void sendBg<ParkBreakdown>({
      type: "PARK_BREAKDOWN",
      vault: activeVault,
      walletPubkey: status.pubkey ?? undefined,
    })
      .then((b) => {
        if (!cancelled) setParkBreakdown(b);
      })
      .catch(() => {
        if (!cancelled) setParkBreakdown(null);
      })
      .finally(() => {
        if (!cancelled) setParkBreakdownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeVault, status?.unlocked, status?.pubkey, pipeline]);

  useEffect(() => {
    if (!activeVault || !status?.unlocked) return;
    const id = window.setInterval(() => void refreshPipeline(), PIPELINE_POLL_MS);
    return () => window.clearInterval(id);
  }, [activeVault, status?.unlocked, refreshPipeline]);

  useEffect(() => {
    void chrome.storage.session.get("txHistory").then((stored) => {
      if (Array.isArray(stored.txHistory)) {
        setTxHistory(stored.txHistory as TxHistoryItem[]);
      }
    });
  }, []);

  const appendHistory = useCallback((mode: FlowMode | undefined, events: FlowState["events"]) => {
    const lastTx = [...events].reverse().find((e) => e.tx)?.tx;
    const entry: TxHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...historyEntryFromMode(mode, lastTx),
    };
    setTxHistory((prev) => {
      const next = [entry, ...prev].slice(0, 30);
      void chrome.storage.session.set({ txHistory: next });
      return next;
    });
  }, []);

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
          setHoldingsTick((n) => n + 1);
          void refreshWalletSol();
          appendHistory(s.mode, s.events);
          setToast(completedLabel(s.mode));
          window.setTimeout(() => setToast(null), 3000);
        }
        if (s.status === "failed" && s.error) {
          setError(friendlyFlowError(s.error));
          setHoldingsTick((n) => n + 1);
        }
      });
    }, 600);
    return () => window.clearInterval(id);
  }, [
    flowState?.status,
    pollFlowState,
    loadVaults,
    refreshPipeline,
    appendHistory,
    refreshWalletSol,
  ]);

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
  const selectedLayoutOk = selected?.layoutCompatible !== false;
  const canPark = Boolean(selected?.canPark);
  const canClose = Boolean(selected?.canClose);

  const flowRunning = flowState?.status === "running";

  async function startFlow(
    mode: FlowMode,
    opts?: {
      vaultType?: "pooled" | "sliced";
      vaultName?: string;
      parkSol?: number;
      positionId?: number;
      tradeId?: number;
      inputMint?: string;
      exitPercent?: number;
      shares?: number | string;
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
        vaultName: opts?.vaultName,
        parkSol: opts?.parkSol ?? 0.1,
        positionId: opts?.positionId,
        tradeId: opts?.tradeId,
        inputMint: opts?.inputMint,
        exitPercent: opts?.exitPercent,
        shares: opts?.shares,
      });
      await pollFlowState();
    } catch (e) {
      setError(friendlyFlowError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function onUnlockLicense() {
    if (!status?.pubkey || flowRunning) return;
    setBusy(true);
    setError(null);
    try {
      await sendBg({ type: "UNLOCK_LICENSE", strategist: status.pubkey });
      setTxHistory((prev) => {
        const next = [
          { id: `${Date.now()}-unlock`, label: "1VL unlocked", at: new Date().toISOString() },
          ...prev,
        ].slice(0, 30);
        void chrome.storage.session.set({ txHistory: next });
        return next;
      });
      setToast("1VL licence unlocked");
      window.setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onInvestorPark(vaultPubkey: string, parkSol: number) {
    if (!status?.pubkey || flowRunning) return;
    setBusy(true);
    setError(null);
    try {
      const kp = getUnlockedKeypair();
      if (!kp) throw new Error("keyring locked");
      await runParkGuest({
        investor: status.pubkey,
        vault: vaultPubkey,
        lamports: solToLamports(parkSol),
        keypair: kp,
      });
      setActiveVault(vaultPubkey);
      setToast("SOL parked");
      window.setTimeout(() => setToast(null), 3000);
      setTxHistory((prev) => {
        const next = [
          {
            id: `${Date.now()}-park`,
            ...historyEntryFromMode("deposit"),
          },
          ...prev,
        ].slice(0, 30);
        void chrome.storage.session.set({ txHistory: next });
        return next;
      });
      void refreshPipeline();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onParkConfirm(sol: number) {
    if (!parkScreen) return;
    const { vault, role } = parkScreen;
    if (role === "strategist") {
      void startFlow("deposit", { parkSol: sol }).then(() => setParkScreen(null));
    } else if (vault) {
      void onInvestorPark(vault, sol).then(() => setParkScreen(null));
    }
  }

  function onCreateVault(result: CreateVaultResult) {
    setCreateScreenOpen(false);
    void startFlow("create-vault", {
      vaultName: result.vaultName,
      vaultType: result.vaultType,
      parkSol: result.parkSol,
    });
  }

  const overlayOpen = Boolean(detailVault || parkScreen || createScreenOpen);

  async function onInvestorWithdraw(vault: string, shares: string) {
    if (!status?.pubkey) throw new Error("Unlock wallet first");
    if (flowRunning) throw new Error("A flow is already running");
    setBusy(true);
    setError(null);
    try {
      await sendBg({
        type: "RUN_FLOW",
        mode: "withdraw",
        vault,
        shares,
      });
      await pollFlowState();
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const msg = friendlyFlowError(raw);
      setError(msg);
      throw e instanceof Error ? e : new Error(msg);
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

  async function onConnectX() {
    setAuthBusy(true);
    setError(null);
    try {
      const session = await startTwitterLogin();
      setAuthSession(session);
      setOk("Signed in with X");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  }

  async function onLogout() {
    setAccountMenuOpen(false);
    setAuthBusy(true);
    setError(null);
    try {
      if (authSession?.refreshToken) await logoutAuth(authSession.refreshToken);
      await sendBg({ type: "LOGOUT_ALL" });
      setAuthSession(null);
      setVaults([]);
      setPipeline(null);
      setActiveVault(null);
      setFlowState(null);
      setSecret("");
      setPassword("");
      await refreshStatus();
      setOk("Logged out");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthBusy(false);
    }
  }

  /* ——— Locked / empty keyring ——— */
  if (!status?.has || !status.unlocked) {
    return (
      <div className="sp sp-app">
        <div className="sp-scroll">
          <TopBar
            authUser={authUser}
            roleLabel={roleLabel}
            walletAddr={status?.pubkey ? shortAddr(status.pubkey) : undefined}
            menuOpen={accountMenuOpen}
            menuRef={accountMenuRef}
            onToggleMenu={() => setAccountMenuOpen((v) => !v)}
            onLogout={() => void onLogout()}
            onLock={status?.has && status.unlocked ? () => void onLock() : undefined}
            walletSol={walletSol}
            onOpenSettings={() => setNav("settings")}
            onVerifyWallet={() => setBindModalOpen(true)}
          />

          <section className="hero">
            <HeroHead
              title={status?.has ? "Unlock to ride" : "Import degen key"}
              info="Same vault. Degen signs. Vault pays. Secret stays encrypted on this device — never sent to the backend."
            />

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
        </div>
        <BottomNav nav="home" onNav={setNav} />
      </div>
    );
  }

  return (
    <div className="sp sp-app">
      <div className="sp-scroll">
        <TopBar
          authUser={authUser}
          roleLabel={roleLabel}
          walletAddr={status.pubkey ? shortAddr(status.pubkey) : undefined}
          menuOpen={accountMenuOpen}
          menuRef={accountMenuRef}
          onToggleMenu={() => setAccountMenuOpen((v) => !v)}
          onLogout={() => void onLogout()}
          onLock={() => void onLock()}
          walletSol={walletSol}
          onOpenSettings={() => setNav("settings")}
          onVerifyWallet={() => setBindModalOpen(true)}
        />

        {flowRunning ? (
          <ProcessingBanner
            mode={flowState?.mode}
            onCancel={() => void sendBg({ type: "FLOW_CANCEL" }).then(() => pollFlowState())}
          />
        ) : null}

        {detailVault ? (
          <VaultProfileView
            vaultPubkey={detailVault}
            viewerPubkey={status.pubkey}
            seed={(() => {
              const row = vaults.find((v) => String(v.pubkey) === detailVault);
              if (!row) return undefined;
              return {
                name: vaultName(row),
                nav: (row.nav ?? row.total_assets ?? "0") as string | number,
                vaultType: vaultType(row),
                vaultStatus: typeof row.vaultStatus === "string" ? row.vaultStatus : null,
                strategist: status.pubkey,
              };
            })()}
            onBack={() => setDetailVault(null)}
            onPark={(vault) =>
              setParkScreen({
                vault,
                role: "investor",
                vaultLabel: shortAddr(vault),
              })
            }
            busy={busy || flowRunning}
          />
        ) : null}

        {!overlayOpen && nav === "home" && (
          <div className="home-panels">
            {vaultsLoading && !hasVaults ? (
              <ShimmerHero />
            ) : (
              <section className="hero">
                {!hasVaults ? (
                  <HeroHead
                    title="No vault yet"
                    info="Lock 1,000,000 1VL, create a pooled vault, then park SOL. Retail rides with you — close pays by share weight."
                  />
                ) : pipelineLoading && !pipeline ? (
                  <VaultSummaryShimmer />
                ) : (
                  <VaultSummary
                    typeLabel={selected ? vaultType(selected) : undefined}
                    pipeline={pipeline}
                    parkBreakdown={parkBreakdown}
                    bar={bar}
                  />
                )}

                <VaultQuickActions
                  busy={busy}
                  flowRunning={flowRunning}
                  activeVault={activeVault}
                  layoutOk={selectedLayoutOk}
                  canPark={canPark}
                  canClose={canClose}
                  closeHint={closeVaultBlockedMessage(selected)}
                  onCreate={() => {
                    setDetailVault(null);
                    setParkScreen(null);
                    setCreateScreenOpen(true);
                  }}
                  onPark={() => {
                    if (!canPark) {
                      const st = String(selected?.vaultStatus ?? "unknown");
                      setError(
                        `Cannot park — vault is ${st} (need Active). Create a new vault or select an Active one.`
                      );
                      return;
                    }
                    setDetailVault(null);
                    setCreateScreenOpen(false);
                    setParkScreen({
                      vault: activeVault,
                      role: "strategist",
                      vaultLabel: selected
                        ? `${vaultName(selected)} · ${shortAddr(String(selected.pubkey ?? activeVault ?? ""))}`
                        : activeVault
                          ? shortAddr(activeVault)
                          : undefined,
                    });
                  }}
                  onTrade={() => void startFlow("open-position")}
                  onClose={() => {
                    if (!canClose) {
                      setError(closeVaultBlockedMessage(selected));
                      return;
                    }
                    void startFlow("close-vault");
                  }}
                  loading={hasVaults && (pipelineLoading || parkBreakdownLoading) && !pipeline}
                />

                {activeVault ? (
                  <div className="vault-summary-address">
                    <span className="vault-summary-address-label">Vault Address</span>
                    <span className="vault-summary-address-value mono">
                      {vaultAddrShort(activeVault)}
                    </span>
                  </div>
                ) : null}
              </section>
            )}

            {showBanner && bar && bar.incoming > 0n && (
              <div className="banner">
                <button type="button" className="banner-x" onClick={() => setShowBanner(false)}>
                  ×
                </button>
                <div className="banner-kicker">Capital in motion</div>
                <strong>
                  +<SolAmount value={formatLamportsAsSol(bar.incoming.toString(), 3)} unit="SOL incoming" size="sm" />
                </strong>
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
                    ["holdings", "Holdings"],
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
                        const status = typeof v.vaultStatus === "string" ? v.vaultStatus : "";
                        const isClosed = status.toLowerCase() === "closed";
                        const isLegacy = v.layoutCompatible === false;
                        return (
                          <div
                            key={pk}
                            role="button"
                            tabIndex={0}
                            className={`row-card row-card--selectable${active ? " active" : ""}`}
                            onClick={() => setActiveVault(pk)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setActiveVault(pk);
                              }
                            }}
                          >
                            <div className="token-icon">
                              1V
                              {isClosed ? (
                                <span className="badge-dot badge-closed" title="Closed">
                                  <IconX />
                                </span>
                              ) : isLegacy ? (
                                <span className="badge-dot badge-legacy" title="Legacy account">
                                  !
                                </span>
                              ) : (
                                <span className="badge-dot" title="Active">
                                  <IconCheck />
                                </span>
                              )}
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
                                <SolAmount
                                  value={formatLamportsAsSol(String(v.nav ?? v.total_assets ?? "0"), 2)}
                                  unit="SOL NAV"
                                  size="md"
                                />
                              </div>
                              <button
                                type="button"
                                className="vault-row-detail"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveVault(pk);
                                  setDetailVault(pk);
                                }}
                              >
                                Detail
                              </button>
                            </div>
                          </div>
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
                <CapitalDetail
                  pipeline={pipeline}
                  activeVault={activeVault}
                  walletPubkey={status.pubkey}
                  pipelineLoading={pipelineLoading}
                />
              </div>
            )}

            {listTab === "holdings" && (
              <HoldingsTab
                investorPubkey={status.pubkey}
                busy={busy || flowRunning}
                refreshKey={holdingsTick}
                onWithdraw={(vault, shares) => onInvestorWithdraw(vault, shares)}
              />
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
                              <SolAmount
                                value={formatLamportsAsSol(p.currentValue || p.entryValue, 3)}
                                unit="SOL"
                                size="md"
                              />
                            </div>
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

        {!overlayOpen && nav === "discover" && (
          <DiscoverPanel
            busy={busy || flowRunning}
            onOpenVault={(vault) => {
              setActiveVault(vault);
              setDetailVault(vault);
            }}
          />
        )}

        {!overlayOpen && nav === "trade" && (
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

        {!overlayOpen && nav === "activity" && <HistoryPanel items={txHistory} />}

        {!overlayOpen && nav === "vault" && (
          <section className="flow-page">
            <div className="flow-card">
              <header className="flow-card-head">
                <h2 className="flow-card-title">Vault tools</h2>
                <p className="flow-card-sub">
                  Claim fees, close vault, or unlock your 1VL licence.
                  {activeVault ? (
                    <>
                      {" "}
                      Active · <span className="mono">{shortAddr(activeVault)}</span>
                    </>
                  ) : (
                    " Select a vault on Home first."
                  )}
                </p>
              </header>

              <div className="flow-card-body vault-tools-list">
                <button
                  type="button"
                  className="vault-tool-row"
                  disabled={busy || flowRunning || !activeVault}
                  onClick={() => void startFlow("claim-fees")}
                >
                  <div className="vault-tool-copy">
                    <span className="vault-tool-title">Claim fees</span>
                    <span className="vault-tool-sub">Collect performance fees to wallet</span>
                  </div>
                  <span className="vault-tool-cta">Claim</span>
                </button>

                <button
                  type="button"
                  className="vault-tool-row"
                  disabled={busy || flowRunning || !activeVault || !canClose}
                  onClick={() => {
                    if (!canClose) {
                      setError(closeVaultBlockedMessage(selected));
                      return;
                    }
                    void startFlow("close-vault");
                  }}
                >
                  <div className="vault-tool-copy">
                    <span className="vault-tool-title">Close vault</span>
                    <span className="vault-tool-sub">Wind down and settle by share weight</span>
                  </div>
                  <span className="vault-tool-cta">Close</span>
                </button>

                <button
                  type="button"
                  className="vault-tool-row"
                  disabled={busy || flowRunning || !status?.pubkey}
                  onClick={() => void onUnlockLicense()}
                >
                  <div className="vault-tool-copy">
                    <span className="vault-tool-title">Unlock 1VL</span>
                    <span className="vault-tool-sub">Release locked licence tokens</span>
                  </div>
                  <span className="vault-tool-cta">Unlock</span>
                </button>
              </div>
            </div>
          </section>
        )}

        {!overlayOpen && nav === "settings" && (
          <SettingsPanel
            session={authSession}
            walletPubkey={status.pubkey}
            walletSol={walletSol}
            backendOk={backendOk}
            onVerifyWallet={() => setBindModalOpen(true)}
            onLock={() => void onLock()}
            onLogout={() => void onLogout()}
          />
        )}

        {createScreenOpen ? (
          <CreateVaultWizard
            authUser={authUser}
            walletPubkey={status.pubkey}
            walletBound={Boolean(
              authUser?.wallets?.some((w) => w.pubkey === status.pubkey)
            )}
            busy={busy || flowRunning}
            onClose={() => setCreateScreenOpen(false)}
            onConnectX={() => void onConnectX()}
            onVerifyWallet={() => {
              setCreateScreenOpen(false);
              setBindModalOpen(true);
            }}
            onCreate={onCreateVault}
          />
        ) : null}

        {parkScreen ? (
          <ParkPage
            title={parkScreen.role === "strategist" ? "Park SOL" : "Park into vault"}
            vaultLabel={parkScreen.vaultLabel}
            vaultPubkey={parkScreen.vault}
            walletPubkey={status.pubkey}
            walletSol={walletSol}
            busy={busy || flowRunning}
            refreshKey={holdingsTick}
            onBack={() => setParkScreen(null)}
            onPark={(sol) => void onParkConfirm(sol)}
            onWithdraw={(vault, shares) => onInvestorWithdraw(vault, shares)}
          />
        ) : null}

        {bindModalOpen && authSession && status.pubkey ? (
          <BindWalletModal
            session={authSession}
            pubkey={status.pubkey}
            onClose={() => setBindModalOpen(false)}
            onBound={(s) => setAuthSession(s)}
          />
        ) : null}

        {error && <div className="err">{error}</div>}
        {toast && <div className="ok">{toast}</div>}
      </div>

      <BottomNav
        nav={nav}
        onNav={(n) => {
          setDetailVault(null);
          setParkScreen(null);
          setCreateScreenOpen(false);
          setNav(n);
        }}
      />
    </div>
  );
}

function VaultQuickActions({
  busy,
  flowRunning,
  activeVault,
  loading,
  layoutOk,
  canPark,
  canClose,
  closeHint,
  onCreate,
  onPark,
  onTrade,
  onClose,
}: {
  busy: boolean;
  flowRunning: boolean;
  activeVault: string | null;
  loading?: boolean;
  layoutOk?: boolean;
  canPark?: boolean;
  canClose?: boolean;
  closeHint?: string;
  onCreate: () => void;
  onPark: () => void;
  onTrade: () => void;
  onClose: () => void;
}) {
  const locked = busy || flowRunning || loading;
  const needsVault = !activeVault;
  const closeBlocked = needsVault || canClose === false;
  const parkBlocked = needsVault || canPark === false;

  return (
    <div className="quick hero-quick">
      <button
        type="button"
        className="quick-item"
        data-action="create"
        disabled={locked}
        onClick={onCreate}
      >
        <div className="quick-icon">
          <IconCreate width={18} height={18} />
        </div>
        <span className="quick-meta">
          <strong>Create</strong>
        </span>
      </button>
      <button
        type="button"
        className="quick-item"
        data-action="park"
        disabled={locked || parkBlocked}
        title={canPark === false ? "Vault must be Active to park SOL" : undefined}
        onClick={onPark}
      >
        <div className="quick-icon">
          <IconPark width={18} height={18} />
        </div>
        <span className="quick-meta">
          <strong>Park</strong>
        </span>
      </button>
      <button
        type="button"
        className="quick-item"
        data-action="trade"
        disabled={locked || needsVault}
        onClick={onTrade}
      >
        <div className="quick-icon">
          <IconTrade width={18} height={18} />
        </div>
        <span className="quick-meta">
          <strong>Trade</strong>
        </span>
      </button>
      <button
        type="button"
        className="quick-item"
        data-action="close"
        disabled={locked || closeBlocked}
        title={canClose === false ? closeHint ?? "Cannot close vault" : undefined}
        onClick={onClose}
      >
        <div className="quick-icon">
          <IconClose width={18} height={18} />
        </div>
        <span className="quick-meta">
          <strong>Close</strong>
        </span>
      </button>
    </div>
  );
}

function TopBar({
  authUser,
  roleLabel,
  walletAddr,
  walletSol,
  menuOpen,
  menuRef,
  onToggleMenu,
  onLogout,
  onLock,
  onOpenSettings,
  onVerifyWallet,
}: {
  authUser?: AuthUser;
  roleLabel: string | null;
  walletAddr?: string;
  walletSol?: string | null;
  menuOpen?: boolean;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  onToggleMenu?: () => void;
  onLogout?: () => void;
  onLock?: () => void;
  onOpenSettings?: () => void;
  onVerifyWallet?: () => void;
}) {
  const signedIn = Boolean(authUser);
  const statusLine = signedIn
    ? roleLabel ?? (walletAddr ? "Strategist" : "Wallet not linked")
    : walletAddr ?? "Import wallet key";

  return (
    <div className="sp-top">
      <div className="sp-account-wrap" ref={menuRef}>
        <button type="button" className="sp-account" onClick={onToggleMenu}>
          {authUser?.avatarUrl ? (
            <img className="sp-avatar sp-avatar-img" src={authUser.avatarUrl} alt="" />
          ) : (
            <div className="sp-avatar" />
          )}
          <div className="sp-account-meta">
            <div className="sp-account-label">{displayXName(authUser)}</div>
            <div className="sp-account-addr">
              {signedIn ? (
                <span className={`sp-role${roleLabel ? "" : " muted"}`}>{statusLine}</span>
              ) : (
                statusLine
              )}
            </div>
          </div>
        </button>
        {menuOpen && signedIn && (
          <div className="sp-account-menu">
            {walletAddr && (
              <div className="sp-account-menu-wallet mono">
                {walletAddr}
                {walletSol ? <span className="sp-wallet-sol"> · {walletSol} SOL</span> : null}
              </div>
            )}
            {onOpenSettings && (
              <button type="button" className="sp-account-menu-item" onClick={onOpenSettings}>
                Settings
              </button>
            )}
            {onVerifyWallet && (
              <button type="button" className="sp-account-menu-item" onClick={onVerifyWallet}>
                Verify wallet
              </button>
            )}
            {onLock && (
              <button type="button" className="sp-account-menu-item" onClick={onLock}>
                Lock wallet
              </button>
            )}
            <button type="button" className="sp-account-menu-item danger" onClick={onLogout}>
              Logout
            </button>
          </div>
        )}
      </div>
      <div className="sp-top-actions">
        <button type="button" className="icon-btn" title="1vaults" aria-label="1vaults">
          <IconLink />
        </button>
      </div>
    </div>
  );
}

function BottomNav({ nav, onNav }: { nav: NavId; onNav: (n: NavId) => void }) {
  const items: Array<{ id: NavId; label: string; icon: ReactNode }> = [
    { id: "home", label: "Home", icon: <IconHome /> },
    { id: "discover", label: "Discover", icon: <IconDiscover /> },
    { id: "trade", label: "Trade", icon: <IconMarket /> },
    { id: "activity", label: "History", icon: <IconActivity /> },
    { id: "vault", label: "Vault", icon: <IconVault /> },
  ];
  return (
    <nav className="sp-nav">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`nav-item${nav === it.id ? " active" : ""}`}
          data-nav={it.id}
          aria-current={nav === it.id ? "page" : undefined}
          onClick={() => onNav(it.id)}
        >
          <span className="nav-icon">{it.icon}</span>
          <span className="nav-label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
