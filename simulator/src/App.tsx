import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CLOSE_NODES, DEPOSIT_NODES, fetchProtocol, previewWallet, runWorkflow, SETUP_NODES, TRADE_NODES, WALLET_OUT_NODES } from "./api";
import type { NodeUpdate, ProtocolInfo, SimMode } from "../shared/events";
import WorkflowCanvas from "./workflow/WorkflowCanvas";
import { WorkflowContext, type WorkflowCtx } from "./workflow/context";
import { initialViews, defaultRetailSettings, emptyWallet, MAX_RETAILS, type WalletSlot } from "./workflow/graph";
import logo from "./assets/1vault-logo.png";

const LOG_MIN = 72;
const LOG_MAX = 420;

export default function App() {
  const [protocol, setProtocol] = useState<ProtocolInfo>();
  const [views, setViews] = useState(initialViews);
  const [degen, setDegenState] = useState<WalletSlot>(() => emptyWallet());
  const [retails, setRetails] = useState<WalletSlot[]>([emptyWallet()]);
  const [settings, setSettings] = useState(defaultRetailSettings);
  const [activeVault, setActiveVault] = useState<{ vaultId: number; vault: string } | undefined>(() => {
    try {
      const raw = sessionStorage.getItem("1v-vault");
      return raw ? (JSON.parse(raw) as { vaultId: number; vault: string }) : undefined;
    } catch {
      return undefined;
    }
  });
  const [running, setRunning] = useState(false);
  const [runningMode, setRunningMode] = useState<SimMode>();
  const [log, setLog] = useState<string[]>([]);
  const [fatal, setFatal] = useState<string>();
  const [logH, setLogH] = useState(148);
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
    setViews((prev) => ({
      ...prev,
      [update.id]: {
        status: update.status,
        detail: update.detail,
        tx: update.tx,
        fields: update.fields,
      },
    }));
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
    async (role: "degen" | "retail", mode: "secret" | "cli", index = 0) => {
      const slot = role === "degen" ? degen : retails[index];
      if (!slot) return;
      const apply = (patch: Partial<WalletSlot>) => {
        if (role === "degen") setDegenState((p) => ({ ...p, ...patch }));
        else setRetails((prev) => prev.map((w, i) => (i === index ? { ...w, ...patch } : w)));
      };
      try {
        apply({ error: undefined });
        const preview = await previewWallet(
          mode === "cli" ? { useCli: true } : { secret: slot.secret }
        );
        apply({
          useCli: mode === "cli",
          secret: mode === "cli" ? "" : slot.secret,
          pubkey: preview.pubkey,
          sol: preview.sol,
          error: undefined,
        });
        if (role === "degen" || index === 0) {
          setViews((prev) => ({
            ...prev,
            [role]: {
              status: "ready",
              detail: "Wallet loaded from Devnet",
              fields: { pubkey: preview.pubkey, sol: preview.sol },
            },
          }));
        }
      } catch (e) {
        apply({ error: String(e).replace(/^Error:\s*/, "") });
      }
    },
    [degen, retails]
  );

  const start = useCallback(async (mode: SimMode) => {
    if (running) return;
    const loaded = retails.filter((r) => r.pubkey);
    if (!degen.pubkey || loaded.length === 0) return;
    const retail = loaded[0];
    const extras = loaded.slice(1);
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
          degenSecret: degen.useCli ? undefined : degen.secret,
          retailSecret: retail.useCli ? undefined : retail.secret,
          degenUseCli: degen.useCli,
          retailUseCli: retail.useCli,
          extraRetails: extras.map((w) => ({
            secret: w.useCli ? undefined : w.secret,
            useCli: w.useCli,
          })),
          settings,
          mode,
          vaultId: activeVault?.vaultId,
        },
        (update) => {
          patchView(update);
          if (update.id === "vault" && update.fields?.vaultId && update.fields.vault && mode !== "close-vault") {
            setActiveVault({
              vaultId: Number(update.fields.vaultId),
              vault: update.fields.vault,
            });
          }
        },
        (event, data) => {
          if (event === "error") {
            const msg = (data as { message?: string }).message ?? "workflow failed";
            setFatal(msg);
            setLog((prev) => [...prev, `ERROR     ${msg}`]);
          }
          if (event === "done") {
            const d = data as { vaultId?: number; vault?: string; closed?: boolean };
            if (d.closed) {
              setActiveVault(undefined);
              setLog((prev) => [...prev, `DONE      ${mode} · vault closed · licence returned`]);
            } else if (d.vaultId && d.vault) {
              setActiveVault({ vaultId: d.vaultId, vault: d.vault });
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
    }
  }, [degen, retails, settings, running, patchView, activeVault]);

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
    [views, protocol, degen, retail, retails, settings, running, runningMode, importWallet, activeVault, start]
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
            <span className="chip">devnet</span>
            {activeVault ? (
              <span className="chip">vault #{activeVault.vaultId}</span>
            ) : (
              <span className="chip chip-dim">create vault first, then open position</span>
            )}
            {running ? <span className="chip chip-live">{runningMode}</span> : null}
          </div>
          <div className="top-actions">
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
              ? "1. Create vault — 1,000,000 1vault Licence locks inside that vault.  2. Degen Trade SOL + retail Park SOL deposit into the vault ($0 fee). Use + to add more retail wallets.  3. Open position — pooled vault SOL enters the market.  4. Withdraw returns native SOL ($0.50). Close vault returns the 1M 1VL to the degen wallet."
              : log.join("\n")}
          </pre>
        </footer>
      </div>
    </WorkflowContext.Provider>
  );
}
