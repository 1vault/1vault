import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchProtocol, previewWallet, runWorkflow, SETUP_NODES, TRADE_NODES } from "./api";
import type { NodeUpdate, ProtocolInfo, SimMode } from "../shared/events";
import WorkflowCanvas from "./workflow/WorkflowCanvas";
import { WorkflowContext, type WorkflowCtx } from "./workflow/context";
import { initialViews, defaultRetailSettings, type WalletSlot } from "./workflow/graph";

const emptyWallet: WalletSlot = { secret: "", useCli: false };
const LOG_MIN = 72;
const LOG_MAX = 420;

export default function App() {
  const [protocol, setProtocol] = useState<ProtocolInfo>();
  const [views, setViews] = useState(initialViews);
  const [degen, setDegenState] = useState<WalletSlot>(emptyWallet);
  const [retail, setRetailState] = useState<WalletSlot>(emptyWallet);
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
    async (role: "degen" | "retail", mode: "secret" | "cli") => {
      const slot = role === "degen" ? degen : retail;
      const set = role === "degen" ? setDegenState : setRetailState;
      try {
        set((p) => ({ ...p, error: undefined }));
        const preview = await previewWallet(
          mode === "cli" ? { useCli: true } : { secret: slot.secret }
        );
        set((p) => ({
          ...p,
          useCli: mode === "cli",
          secret: mode === "cli" ? "" : p.secret,
          pubkey: preview.pubkey,
          sol: preview.sol,
          error: undefined,
        }));
        setViews((prev) => ({
          ...prev,
          [role]: {
            status: "ready",
            detail: "Wallet loaded from Devnet",
            fields: { pubkey: preview.pubkey, sol: preview.sol },
          },
        }));
      } catch (e) {
        set((p) => ({ ...p, error: String(e).replace(/^Error:\s*/, "") }));
      }
    },
    [degen, retail]
  );

  const start = useCallback(async (mode: SimMode) => {
    if (running) return;
    if (!degen.pubkey || !retail.pubkey) return;
    setFatal(undefined);
    setRunning(true);
    setRunningMode(mode);
    setLog((prev) => [...prev, `START     ${mode}`]);
    setViews((prev) => {
      const next = { ...prev };
      const reset = mode === "create-vault" ? [...SETUP_NODES, ...TRADE_NODES] : TRADE_NODES;
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
          settings,
          mode,
          vaultId: activeVault?.vaultId,
        },
        (update) => {
          patchView(update);
          if (update.id === "vault" && update.fields?.vaultId && update.fields.vault) {
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
            const d = data as { vaultId?: number; vault?: string };
            if (d.vaultId && d.vault) setActiveVault({ vaultId: d.vaultId, vault: d.vault });
            setLog((prev) => [...prev, `DONE      ${mode}`]);
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
  }, [degen, retail, settings, running, patchView, activeVault]);

  const ctx = useMemo<WorkflowCtx>(
    () => ({
      views,
      protocol,
      degen,
      retail,
      settings,
      running,
      activeVault,
      setDegen: (patch) => setDegenState((p) => ({ ...p, ...patch })),
      setRetail: (patch) => setRetailState((p) => ({ ...p, ...patch })),
      setSettings: (patch) => setSettings((p) => ({ ...p, ...patch })),
      importDegen: (mode) => importWallet("degen", mode),
      importRetail: (mode) => importWallet("retail", mode),
    }),
    [views, protocol, degen, retail, settings, running, importWallet, activeVault]
  );

  const canStart = Boolean(degen.pubkey && retail.pubkey) && !running;

  return (
    <WorkflowContext.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="mark">1V</div>
            <div>
              <div className="brand-name">1Vault</div>
              <div className="brand-sub">Live Devnet workflow</div>
            </div>
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
              className="btn btn-start btn-alt"
              disabled={!canStart}
              onClick={() => void start("create-vault")}
            >
              {runningMode === "create-vault" ? "Running…" : "Create vault"}
            </button>
            <button
              type="button"
              className="btn btn-start"
              disabled={!canStart}
              onClick={() => void start("open-position")}
            >
              {runningMode === "open-position" ? "Running…" : "Open position"}
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
              ? "1. Create vault — degen opens the vault, retail joins and parks funds on that same vault.  2. Open position — degen buys; retail auto-follows. Fee SOL lands after retail exit."
              : log.join("\n")}
          </pre>
        </footer>
      </div>
    </WorkflowContext.Provider>
  );
}
