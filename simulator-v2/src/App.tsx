import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CLOSE_NODES, DEPOSIT_NODES, fetchProtocol, previewWallet, runWorkflow, SETUP_NODES, TRADE_NODES, WALLET_OUT_NODES } from "./api";
import type { NodeUpdate, ProtocolInfo, SimMode, AuthUser } from "../shared/events";
import WorkflowCanvas from "./workflow/WorkflowCanvas";
import { WorkflowContext, type WorkflowCtx } from "./workflow/context";
import { initialViews, defaultRetailSettings, emptyWallet, MAX_RETAILS, type WalletSlot } from "./workflow/graph";
import { fetchWithdrawHoldings } from "./shares";
import { fetchLicensePreview, type LicensePreview } from "./license";
import {
  bindWallet,
  fetchAuthMe,
  formatXHandle,
  loadStoredSession,
  logoutAuth,
  saveSession,
  startTwitterLogin,
} from "./auth";
import logo from "./assets/1vault-logo.png";

const CLUSTER = import.meta.env.VITE_CLUSTER ?? "devnet";
const RPC_URL = import.meta.env.VITE_SOLANA_RPC ?? "https://api.devnet.solana.com";

const LOG_MIN = 72;
const LOG_MAX = 420;

export default function App() {
  const [protocol, setProtocol] = useState<ProtocolInfo>();
  const [views, setViews] = useState(initialViews);
  const [degen, setDegenState] = useState<WalletSlot>(() => emptyWallet());
  const [retails, setRetails] = useState<WalletSlot[]>([emptyWallet()]);
  const [settings, setSettings] = useState(defaultRetailSettings);
  const [activeVault, setActiveVault] = useState<
    {
      vaultId: number;
      vault: string;
      vaultTokenAccount?: string;
      vaultType?: "pooled" | "sliced";
    } | undefined
  >(() => {
    try {
      const raw = sessionStorage.getItem("1v-vault");
      return raw
        ? (JSON.parse(raw) as {
            vaultId: number;
            vault: string;
            vaultTokenAccount?: string;
            vaultType?: "pooled" | "sliced";
          })
        : undefined;
    } catch {
      return undefined;
    }
  });
  const [running, setRunning] = useState(false);
  const [runningMode, setRunningMode] = useState<SimMode>();
  const [log, setLog] = useState<string[]>([]);
  const [fatal, setFatal] = useState<string>();
  const [logH, setLogH] = useState(148);
  const [withdrawHoldings, setWithdrawHoldings] = useState<
    import("./shares").WithdrawHolding[]
  >([]);
  const [withdrawHoldingsLoading, setWithdrawHoldingsLoading] = useState(false);
  const [licensePreview, setLicensePreview] = useState<LicensePreview>();
  const [licensePreviewLoading, setLicensePreviewLoading] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser>();
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const authTokenRef = useRef<string | undefined>(undefined);
  const drag = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    if (activeVault) sessionStorage.setItem("1v-vault", JSON.stringify(activeVault));
    else sessionStorage.removeItem("1v-vault");
  }, [activeVault]);

  useEffect(() => {
    void fetchProtocol()
      .then(setProtocol)
      .catch((e) => setFatal(String(e)));
  }, []);

  useEffect(() => {
    const stored = loadStoredSession();
    if (!stored?.accessToken) {
      setAuthLoading(false);
      return;
    }
    authTokenRef.current = stored.accessToken;
    if (stored.user) setAuthUser(stored.user);
    void fetchAuthMe(stored.accessToken)
      .then((user) => {
        setAuthUser(user);
        saveSession({ ...stored, user });
      })
      .catch(() => {
        authTokenRef.current = undefined;
        void logoutAuth(stored.refreshToken);
        setAuthUser(undefined);
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const tryBindWallet = useCallback(
    async (role: "degen" | "retail", slot: WalletSlot) => {
      const token = authTokenRef.current;
      if (!token || !slot.pubkey) return;
      const rolePreference = role === "degen" ? "strategies" : "investors";
      const signer =
        slot.source === "wallet" || !slot.secret.trim()
          ? ({ mode: "wallet" as const, pubkey: slot.pubkey })
          : ({ mode: "secret" as const, secret: slot.secret, pubkey: slot.pubkey });
      try {
        await bindWallet({ accessToken: token, pubkey: slot.pubkey, rolePreference, signer, primary: role === "degen" });
        const user = await fetchAuthMe(token);
        setAuthUser(user);
        saveSession({ accessToken: token, refreshToken: loadStoredSession()?.refreshToken ?? "", user });
        setLog((prev) => [...prev, `AUTH      linked ${role} wallet → X ${formatXHandle(user)}`]);
      } catch (e) {
        const msg = String(e).replace(/^Error:\s*/, "");
        setLog((prev) => [...prev, `AUTH      wallet bind skipped: ${msg}`]);
      }
    },
    []
  );

  const connectX = useCallback(async () => {
    setAuthBusy(true);
    try {
      await startTwitterLogin();
    } catch (e) {
      setFatal(String(e));
      setAuthBusy(false);
    }
  }, []);

  const disconnectX = useCallback(async () => {
    const stored = loadStoredSession();
    await logoutAuth(stored?.refreshToken);
    authTokenRef.current = undefined;
    setAuthUser(undefined);
    setLog((prev) => [...prev, "AUTH      signed out"]);
  }, []);

  const refreshWithdrawHoldings = useCallback(async () => {
    const retailPk = retails[0]?.pubkey;
    if (!retailPk || !protocol?.programId) {
      setWithdrawHoldings([]);
      return;
    }
    setWithdrawHoldingsLoading(true);
    try {
      const items = await fetchWithdrawHoldings({
        rpcUrl: RPC_URL,
        cluster: CLUSTER,
        investor: retailPk,
        programId: protocol.programId,
      });
      setWithdrawHoldings(items);
    } catch {
      setWithdrawHoldings([]);
    } finally {
      setWithdrawHoldingsLoading(false);
    }
  }, [retails, protocol?.programId]);

  useEffect(() => {
    void refreshWithdrawHoldings();
  }, [refreshWithdrawHoldings]);

  const refreshLicensePreview = useCallback(async () => {
    const strategist = degen.pubkey;
    if (!strategist) {
      setLicensePreview(undefined);
      return;
    }
    setLicensePreviewLoading(true);
    try {
      const preview = await fetchLicensePreview({ strategist, rpcUrl: RPC_URL });
      setLicensePreview(preview);
    } catch {
      setLicensePreview(undefined);
    } finally {
      setLicensePreviewLoading(false);
    }
  }, [degen.pubkey]);

  useEffect(() => {
    void refreshLicensePreview();
  }, [refreshLicensePreview]);

  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, h: logH };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [logH]);

  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = drag.current.h + (drag.current.y - e.clientY);
    setLogH(Math.min(LOG_MAX, Math.max(LOG_MIN, next)));
  }, []);

  const onResizeEnd = useCallback(() => {
    drag.current = null;
  }, []);

  const patchView = useCallback((update: NodeUpdate) => {
    setViews((prev) => {
      const prior = prev[update.id];
      return {
        ...prev,
        [update.id]: {
          status: update.status,
          detail: update.detail ?? prior?.detail,
          tx: update.tx ?? prior?.tx,
          fields:
            update.fields !== undefined
              ? { ...prior?.fields, ...update.fields }
              : prior?.fields,
        },
      };
    });
    const line = [
      update.status.toUpperCase().padEnd(8),
      update.id.padEnd(10),
      update.detail ?? "",
      update.tx ? update.tx.slice(0, 8) : "",
    ]
      .join("  ")
      .trim();
    setLog((prev) => [...prev.slice(-40), line]);
  }, []);

  const importWallet = useCallback(
    async (role: "degen" | "retail", mode: "secret" | "cli" | "wallet", index = 0) => {
      const slot = role === "degen" ? degen : retails[index];
      if (!slot) return;
      const apply = (patch: Partial<typeof slot>) => {
        if (role === "degen") setDegenState((p) => ({ ...p, ...patch }));
        else setRetails((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)));
      };
      try {
        apply({ error: undefined });
        const preview = await previewWallet(
          mode === "wallet"
            ? { wallet: true }
            : mode === "cli"
              ? { useCli: true }
              : { secret: slot.secret }
        );
        apply({
          source: mode === "wallet" ? "wallet" : "secret",
          useCli: false,
          secret: mode === "wallet" ? "" : slot.secret,
          pubkey: preview.pubkey,
          sol: preview.sol,
          error: undefined,
        });
        if (role === "degen" || index === 0) {
          setViews((prev) => ({
            ...prev,
            [role]: {
              status: "ready",
              detail: mode === "wallet" ? "Wallet connected" : "Wallet loaded from private key",
              fields: { pubkey: preview.pubkey, sol: preview.sol },
            },
          }));
        }
        if (role === "retail" || index === 0) {
          setTimeout(() => void refreshWithdrawHoldings(), 0);
        }
        if (authTokenRef.current) {
          void tryBindWallet(role, {
            ...slot,
            source: mode === "wallet" ? "wallet" : "secret",
            secret: mode === "wallet" ? "" : slot.secret,
            pubkey: preview.pubkey,
          });
        }
      } catch (e) {
        apply({ error: String(e).replace(/^Error:\s*/, "") });
      }
    },
    [degen, retails, refreshWithdrawHoldings, tryBindWallet]
  );

  const start = useCallback(async (mode: SimMode) => {
    if (running) return;
    const loaded = retails.filter((r) => r.pubkey);
    if (loaded.length === 0) return;
    if (mode !== "withdraw-wallet" && !degen.pubkey) return;
    setFatal(undefined);
    setRunning(true);
    setRunningMode(mode);
    setLog((prev) => [...prev, `START     ${mode}`]);
    setViews((prev) => {
      const next = { ...prev };
      const reset =
        mode === "create-vault"
          ? [...SETUP_NODES, ...TRADE_NODES, ...WALLET_OUT_NODES]
          : mode === "withdraw-wallet"
            ? WALLET_OUT_NODES
            : mode === "close-vault"
              ? CLOSE_NODES
              : mode === "deposit"
                ? DEPOSIT_NODES
                : TRADE_NODES;
      reset.forEach((id) => {
        next[id] = { status: "idle" };
      });
      return next;
    });
    try {
      await runWorkflow(
        {
          degen: {
            source: degen.source === "wallet" ? "wallet" : "secret",
            secret: degen.source === "wallet" ? undefined : degen.secret,
            pubkey: degen.pubkey!,
          },
          retails: loaded.map((w) => ({
            source: w.source === "wallet" ? "wallet" : "secret",
            secret: w.source === "wallet" ? undefined : w.secret,
            pubkey: w.pubkey!,
          })),
          settings,
          mode,
          // create-vault must allocate a fresh id — never reuse activeVault
          vaultId:
            mode === "create-vault" || mode === "withdraw-wallet"
              ? undefined
              : activeVault?.vaultId,
          vaultPubkey:
            mode === "create-vault" || mode === "withdraw-wallet"
              ? undefined
              : activeVault?.vault,
          vaultTokenAccount:
            mode === "create-vault" || mode === "withdraw-wallet"
              ? undefined
              : activeVault?.vaultTokenAccount,
        },
        (update) => {
          patchView(update);
          if (update.id === "vault" && update.fields?.vaultId && update.fields.vault && mode !== "close-vault") {
            const vt = update.fields.vaultType;
            setActiveVault({
              vaultId: Number(update.fields.vaultId),
              vault: update.fields.vault,
              vaultTokenAccount: update.fields.vaultTokenAccount,
              vaultType:
                vt === "sliced" || vt === "pooled"
                  ? vt
                  : settings.vaultType,
            });
          }
        },
        (event, data) => {
          if (event === "withdraw-summary") {
            void refreshWithdrawHoldings();
            const d = data as {
              redeemed?: string[];
              failed?: string[];
              remaining?: unknown[];
              blocked?: unknown[];
            };
            setLog((prev) => [
              ...prev,
              `WITHDRAW  redeemed ${d.redeemed?.length ?? 0} · failed ${d.failed?.length ?? 0} · still ${d.remaining?.length ?? 0} · blocked ${d.blocked?.length ?? 0}`,
            ]);
          }
          if (event === "error") {
            const msg = (data as { message?: string }).message ?? "workflow failed";
            setFatal(msg);
            setLog((prev) => [...prev, `ERROR     ${msg}`]);
          }
          if (event === "done") {
            const d = data as {
              vaultId?: number;
              vault?: string;
              vaultTokenAccount?: string;
              vaultType?: "pooled" | "sliced";
              closed?: boolean;
            };
            if (d.closed) {
              setActiveVault(undefined);
              setLog((prev) => [...prev, `DONE      ${mode} · vault closed · licence returned`]);
            } else if (d.vaultId && d.vault) {
              setActiveVault({
                vaultId: d.vaultId,
                vault: d.vault,
                vaultTokenAccount: d.vaultTokenAccount,
                vaultType:
                  d.vaultType === "sliced" || d.vaultType === "pooled"
                    ? d.vaultType
                    : settings.vaultType,
              });
              setLog((prev) => [...prev, `DONE      ${mode}`]);
            } else {
              setLog((prev) => [...prev, `DONE      ${mode}`]);
            }
          }
        }
      );
    } catch (e) {
      const msg = String(e).replace(/^Error:\s*/, "");
      setFatal(msg);
    } finally {
      setRunning(false);
      setRunningMode(undefined);
      if (mode === "withdraw-wallet") void refreshWithdrawHoldings();
      if (mode === "create-vault" || mode === "close-vault") void refreshLicensePreview();
    }
  }, [degen, retails, settings, running, patchView, activeVault, refreshWithdrawHoldings, refreshLicensePreview]);

  const retail = retails[0] ?? emptyWallet();

  const ctx = useMemo<WorkflowCtx>(
    () => ({
      views,
      protocol,
      degen,
      retail,
      retails,
      settings,
      running,
      runningMode,
      activeVault,
      withdrawHoldings,
      withdrawHoldingsLoading,
      refreshWithdrawHoldings,
      licensePreview,
      licensePreviewLoading,
      refreshLicensePreview,
      start,
      setDegen: (patch) => setDegenState((p) => ({ ...p, ...patch })),
      setRetail: (patch) =>
        setRetails((prev) => prev.map((w, i) => (i === 0 ? { ...w, ...patch } : w))),
      setRetailAt: (index, patch) =>
        setRetails((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w))),
      addRetail: () =>
        setRetails((prev) => (prev.length >= MAX_RETAILS ? prev : [...prev, emptyWallet()])),
      removeRetail: (index) =>
        setRetails((prev) => (prev.length <= 1 || index <= 0 ? prev : prev.filter((_, i) => i !== index))),
      setSettings: (patch) => setSettings((p) => ({ ...p, ...patch })),
      importDegen: (mode) => importWallet("degen", mode),
      importRetail: (mode, index = 0) => importWallet("retail", mode, index),
    }),
    [views, protocol, degen, retail, retails, settings, running, runningMode, importWallet, activeVault, start, withdrawHoldings, withdrawHoldingsLoading, refreshWithdrawHoldings, licensePreview, licensePreviewLoading, refreshLicensePreview]
  );

  const canStart = Boolean(degen.pubkey && retails.some((r) => r.pubkey)) && !running;

  return (
    <WorkflowContext.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <img
              className="brand-logo"
              src={logo}
              alt="1vault"
            />
          </div>
          <div className="top-meta">
            <span className="chip">{protocol?.cluster ?? "devnet"}</span>
            <span className="chip chip-dim">backend v2</span>
            {activeVault ? (
              <span className="chip">
                vault #{activeVault.vaultId}
                {activeVault.vaultType ? ` · ${activeVault.vaultType}` : ""}
              </span>
            ) : (
              <span className="chip chip-dim">create vault first, then open position</span>
            )}
            {running ? <span className="chip chip-live">{runningMode}</span> : null}
            {authUser ? (
              <span className="chip chip-x" title={`X id ${authUser.twitterId}`}>
                {authUser.avatarUrl ? (
                  <img className="chip-x-avatar" src={authUser.avatarUrl} alt="" />
                ) : null}
                {formatXHandle(authUser)}
              </span>
            ) : authLoading ? (
              <span className="chip chip-dim">X …</span>
            ) : null}
          </div>
          <div className="top-actions">
            {authUser ? (
              <button type="button" className="btn-header" disabled={authBusy} onClick={() => void disconnectX()}>
                Disconnect X
              </button>
            ) : (
              <button type="button" className="btn-header" disabled={authBusy || authLoading} onClick={() => void connectX()}>
                {authBusy ? "Redirecting…" : "Connect X"}
              </button>
            )}
            <button
              type="button"
              className="btn-header"
              disabled={!canStart}
              onClick={() => void start("create-vault")}
            >
              {runningMode === "create-vault" ? "Creating…" : "Create vault"}
            </button>
            <button
              type="button"
              className="btn-header btn-header-primary"
              disabled={!canStart}
              onClick={() => void start("open-position")}
            >
              {runningMode === "open-position" ? "Opening…" : "Open position"}
            </button>
          </div>
        </header>

        {fatal ? <div className="banner">{fatal}</div> : null}

        <main className="canvas-wrap">
          <WorkflowCanvas views={views} />
        </main>

        <footer className="logdock" style={{ flexBasis: logH, height: logH }}>
          <div
            className="logdock-resizer"
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
          />
          <div className="logdock-head">Execution · drag up / down</div>
          <pre className="logdock-body">
            {log.length === 0
              ? "1. Create vault.  2. Degen + retail park SOL (ledger first, then chain).  3. Retail sets TP/SL. Degen executes.  4. Degen close closes every retail book."
              : log.join("\n")}
          </pre>
        </footer>
      </div>
    </WorkflowContext.Provider>
  );
}
