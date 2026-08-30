/**
 * GMGN Instant Trade — toolbar button + draggable vault trade panel on token pages.
 * Avoid // comments inside injected CSS strings (content-script IIFE + sourcemap hazard).
 */
import { isVaultTradeable, vaultStatusFields } from "../lib/vault-status";
const ATTR = "data-1vault-gmgn";
const STYLE_ID = "onevault-gmgn-style";
const BTN_ID = "onevault-gmgn-instant";
const PANEL_ID = "onevault-gmgn-panel";
const ROOT_ID = "onevault-gmgn-root";
const OLD_PILL_ID = "onevault-gmgn-pill";

const GMGN_TOKEN_RE = /\/sol\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/;
const BUY_PRESET_SOL = [1, 0.8, 0.2, 0.01] as const;
const SELL_PCTS = [10, 25, 50, 100] as const;

/** Caps keep network spend bounded so vault/platform fee economics stay viable. */
const SLIPPAGE_OPTS = [
  { label: "0.5%", bps: 50 },
  { label: "1%", bps: 100 },
  { label: "2%", bps: 200 },
  { label: "3%", bps: 300 },
] as const;
const GAS_OPTS = [
  { label: "Low", micro: 50_000 },
  { label: "Med", micro: 150_000 },
  { label: "High", micro: 400_000 },
] as const;
const TIP_OPTS = [
  { label: "0", lamports: 0 },
  { label: "0.0001", lamports: 100_000 },
  { label: "0.0005", lamports: 500_000 },
  { label: "0.001", lamports: 1_000_000 },
] as const;
const MAX_TIP_LAMPORTS = 1_000_000;
const MAX_PRIORITY_MICRO = 500_000;
/** Floor keeps the panel legible — below this it fades into the GMGN chart. */
const MIN_OPACITY_PCT = 40;

type TradeSettings = {
  slippageBps: number;
  gasMicro: number;
  tipLamports: number;
  opacityPct: number;
};

const DEFAULT_TRADE_SETTINGS: TradeSettings = {
  slippageBps: 100,
  gasMicro: 150_000,
  tipLamports: 100_000,
  opacityPct: 100,
};

type VaultRow = {
  pubkey: string;
  name: string;
  vaultId: number;
  status: string;
  statusCode: number;
  parkLamports: bigint;
};

type PosRow = {
  positionId: number;
  tradeId: number;
  inputMint: string;
  outputMint: string;
  entryValue: string;
  currentValue: string;
  status: string;
};

type BgResult = { ok: true; data: unknown } | { ok: false; error: string };

let selectedVault: VaultRow | null = null;
let vaults: VaultRow[] = [];
/** False when every vault is Closed — hides instant trade UI on GMGN. */
let hasTradeableVaults = false;
let positions: PosRow[] = [];
let panelOpen = false;
let busy = false;
/** Available park SOL (lamports) for the selected vault. */
let vaultParkLamports = 0n;
let tradeSettings: TradeSettings = { ...DEFAULT_TRADE_SETTINGS };
let lastPanelPos: { left: number; top: number } | null = null;
let dragState: {
  startX: number;
  startY: number;
  origLeft: number;
  origTop: number;
  pointerId: number;
} | null = null;

function clampTradeSettings(s: Partial<TradeSettings>): TradeSettings {
  const slip = SLIPPAGE_OPTS.some((o) => o.bps === s.slippageBps)
    ? (s.slippageBps as number)
    : DEFAULT_TRADE_SETTINGS.slippageBps;
  const gas = GAS_OPTS.some((o) => o.micro === s.gasMicro)
    ? (s.gasMicro as number)
    : DEFAULT_TRADE_SETTINGS.gasMicro;
  const tipRaw = Number(s.tipLamports);
  const tip = TIP_OPTS.some((o) => o.lamports === tipRaw)
    ? tipRaw
    : Math.min(MAX_TIP_LAMPORTS, Math.max(0, Math.round(Number.isFinite(tipRaw) ? tipRaw : 0)));
  return {
    slippageBps: slip,
    gasMicro: gas,
    tipLamports: tip,
    opacityPct: clampOpacityPct(s.opacityPct),
  };
}

function clampOpacityPct(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_TRADE_SETTINGS.opacityPct;
  return Math.min(100, Math.max(MIN_OPACITY_PCT, n));
}

/** Idle opacity only — CSS restores full opacity on hover so trading stays readable. */
function applyPanelOpacity(): void {
  const panel = document.getElementById(PANEL_ID);
  panel?.style.setProperty("--ov-panel-opacity", String(tradeSettings.opacityPct / 100));
}

/** Priority fee = gas + tip boost, hard-capped so 1vault fee room stays intact. */
function effectivePriorityMicro(s: TradeSettings = tradeSettings): number {
  const tipBoost = Math.floor(s.tipLamports / 4);
  return Math.min(MAX_PRIORITY_MICRO, s.gasMicro + tipBoost);
}

async function loadTradeSettings(): Promise<void> {
  try {
    const stored = await sessionGet(["tradeSettings"]);
    const raw = stored.tradeSettings;
    if (raw && typeof raw === "object") {
      tradeSettings = clampTradeSettings(raw as Partial<TradeSettings>);
    }
  } catch {
    tradeSettings = { ...DEFAULT_TRADE_SETTINGS };
  }
}

async function saveTradeSettings(): Promise<void> {
  tradeSettings = clampTradeSettings(tradeSettings);
  await sessionSet({ tradeSettings }).catch(() => undefined);
  renderTradeSettings();
}

function isSolTokenPage(): boolean {
  try {
    const path = location.pathname || "";
    if (path.startsWith("/sol/token/")) return true;
    const href = location.href || "";
    return /https?:\/\/([^/]*\.)?gmgn\.ai\/sol\/token\//i.test(href);
  } catch {
    return false;
  }
}

function extractMint(): string | null {
  const m = location.pathname.match(GMGN_TOKEN_RE);
  return m?.[1] ?? null;
}

function iconUrl(): string {
  try {
    return chrome.runtime.getURL("public/icons/icon16.png");
  } catch {
    return "";
  }
}

function shortAddr(pk: string): string {
  if (pk.length < 10) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function mintLabel(mint: string): string {
  if (!mint) return "TOKEN";
  return mint.slice(0, 6).toUpperCase();
}

function lamportsToSol(raw: string | bigint, digits = 3): string {
  try {
    const n = Number(typeof raw === "bigint" ? raw : BigInt(raw || "0")) / 1e9;
    if (!Number.isFinite(n)) return "0";
    return n.toFixed(digits);
  } catch {
    return "0";
  }
}

function vaultMaxSol(): number {
  return Number(vaultParkLamports) / 1e9;
}

function formatSolAmt(sol: number): string {
  if (sol >= 1) return sol.toFixed(sol >= 10 ? 1 : 2);
  if (sol >= 0.01) return sol.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return sol.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function pnlPct(entry: string, current: string): number | null {
  try {
    const e = BigInt(entry || "0");
    if (e <= 0n) return null;
    const c = BigInt(current || entry || "0");
    return Number(((c - e) * 10000n) / e) / 100;
  } catch {
    return null;
  }
}

function bg<T = unknown>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      if (!chrome.runtime?.id) {
        reject(new Error("Extension was updated — reload this GMGN tab."));
        return;
      }
      chrome.runtime.sendMessage(message, (res: BgResult) => {
        const err = chrome.runtime.lastError?.message;
        if (err) {
          if (/context invalidated|extension.?context/i.test(err)) {
            reject(new Error("Extension was updated — reload this GMGN tab."));
          } else {
            reject(new Error(err));
          }
          return;
        }
        if (!res || !res.ok) {
          reject(new Error((res && "error" in res && res.error) || "request failed"));
          return;
        }
        resolve(res.data as T);
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/context invalidated|extension.?context/i.test(msg)) {
        reject(new Error("Extension was updated — reload this GMGN tab."));
      } else {
        reject(e instanceof Error ? e : new Error(msg));
      }
    }
  });
}

const ICON_VAULT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
const ICON_GEAR = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 21v-7M5 10V3M12 21v-4M12 13V3M19 21v-10M19 7V3"/><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="15" r="1.7"/><circle cx="19" cy="9" r="1.7"/></svg>`;
const ICON_REFRESH = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3.5V10h-6.5"/></svg>`;
const ICON_CLOSE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const ICON_WALLET = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10.5h19"/><circle cx="17" cy="14.5" r="1.2"/></svg>`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    `#${BTN_ID},#${PANEL_ID}{--ov-font:ui-sans-serif,system-ui,-apple-system,sans-serif;--ov-accent:#3aa8f0;--ov-accent-bright:#7fe4ff;--ov-accent-line:rgba(58,168,240,.22);--ov-accent-line-strong:rgba(58,168,240,.42);--ov-accent-dim:rgba(58,168,240,.12);--ov-ok:#88f698;--ov-ok-line:rgba(136,246,152,.4);--ov-bad:#ff6b8a;--ov-bad-line:rgba(255,92,92,.45);--ov-text-dim:rgba(255,255,255,.58);--ov-text-faint:rgba(255,255,255,.36);--ov-hairline:rgba(255,255,255,.08)}`,
    `#${ROOT_ID}{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}`,
    `#${BTN_ID}{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;margin-right:8px;border:1px solid var(--ov-ok-line);border-radius:8px;background:linear-gradient(180deg,rgba(28,54,36,.9),rgba(16,34,24,.85));color:var(--ov-ok);font:600 12px/1 var(--ov-font);cursor:pointer;white-space:nowrap;vertical-align:middle;transition:background 130ms ease,border-color 130ms ease,color 130ms ease,box-shadow 130ms ease}`,
    `#${BTN_ID}:hover{border-color:rgba(136,246,152,.85);color:#b8ffc4;background:linear-gradient(180deg,rgba(40,74,50,.95),rgba(24,48,32,.9));box-shadow:0 4px 14px rgba(136,246,152,.16)}`,
    `#${BTN_ID}:focus-visible{outline:2px solid var(--ov-accent-bright);outline-offset:2px}`,
    `#${BTN_ID} img{width:14px;height:14px;border-radius:4px;flex-shrink:0}`,
    `#${BTN_ID}.ov-active{background:linear-gradient(180deg,rgba(46,86,58,.95),rgba(28,56,38,.9));box-shadow:0 0 0 1px rgba(136,246,152,.4)}`,
    `#${BTN_ID}.ov-hidden{display:none!important}`,
    `#${OLD_PILL_ID}{display:none!important}`,
    `#${PANEL_ID}{position:fixed;left:auto;top:auto;right:12px;bottom:56px;z-index:2147483645;width:min(760px,calc(100vw - 24px));max-height:min(640px,calc(100vh - 72px));display:none;flex-direction:column;border:1px solid rgba(58,168,240,.32);border-radius:14px;overflow:hidden;color:#fff;font-family:var(--ov-font);box-shadow:0 24px 64px rgba(0,10,30,.62),inset 0 1px 0 rgba(255,255,255,.06);background-color:#000;background-image:radial-gradient(90% 50% at 50% -10%,rgba(15,40,84,.85) 0%,transparent 55%),radial-gradient(60% 40% at 85% 0%,rgba(58,168,240,.28) 0%,transparent 52%),linear-gradient(165deg,#0b1a2e 0%,#0f2854 38%,#0a0b0d 100%)}`,
    `#${PANEL_ID}.ov-open{display:flex;animation:ov-pop 150ms cubic-bezier(.22,1,.36,1)}`,
    `#${PANEL_ID}{opacity:var(--ov-panel-opacity,1);transition:opacity 180ms ease}`,
    `#${PANEL_ID}:hover,#${PANEL_ID}:focus-within{opacity:1}`,
    `#${PANEL_ID}.ov-op-preview:hover,#${PANEL_ID}.ov-op-preview:focus-within{opacity:var(--ov-panel-opacity,1)}`,
    `#${PANEL_ID}.ov-hidden{display:none!important}`,
    `#${PANEL_ID} *{box-sizing:border-box}`,
    `@keyframes ov-pop{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}`,
    `@keyframes ov-spin{to{transform:rotate(360deg)}}`,
    `.ov-topbar{display:flex;align-items:center;gap:10px;height:44px;flex-shrink:0;padding:0 8px 0 10px;cursor:grab;user-select:none;touch-action:none;border-bottom:1px solid var(--ov-accent-line);background:linear-gradient(180deg,rgba(15,40,84,.72),rgba(8,16,30,.5))}`,
    `.ov-topbar:active{cursor:grabbing}`,
    `.ov-grip{width:10px;height:16px;flex-shrink:0;pointer-events:none;background-image:radial-gradient(circle,rgba(191,232,245,.42) 1px,transparent 1.2px);background-size:5px 5px;background-position:0 2px}`,
    `.ov-brand{display:flex;align-items:center;gap:8px;min-width:0;flex:1;pointer-events:none}`,
    `.ov-brand img{width:18px;height:18px;border-radius:5px;flex-shrink:0}`,
    `.ov-title{font:700 13px/1.2 var(--ov-font);letter-spacing:-.01em;white-space:nowrap}`,
    `.ov-token-chip{display:inline-flex;align-items:center;height:20px;max-width:130px;padding:0 8px;border:1px solid var(--ov-accent-line);border-radius:999px;background:var(--ov-accent-dim);color:var(--ov-accent-bright);font:600 10px/1 var(--ov-font);letter-spacing:.05em;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;pointer-events:auto;cursor:inherit}`,
    `.ov-token-chip.ov-hide{display:none}`,
    `.ov-actions{display:flex;align-items:center;gap:6px;flex-shrink:0}`,
    `.ov-sep{width:1px;height:20px;flex-shrink:0;margin:0 1px;background:rgba(255,255,255,.14)}`,
    `.ov-icon-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;min-width:28px;max-width:170px;padding:0 8px;border:1px solid var(--ov-ok-line);border-radius:8px;background:rgba(20,40,28,.5);color:var(--ov-ok);cursor:pointer;font:600 11px/1 var(--ov-font);transition:background 130ms ease,border-color 130ms ease,color 130ms ease,transform 130ms ease}`,
    `.ov-icon-btn:hover{border-color:rgba(136,246,152,.78);background:rgba(30,58,40,.8)}`,
    `.ov-icon-btn:active{transform:translateY(1px)}`,
    `.ov-icon-btn:focus-visible,.ov-close:focus-visible,.ov-chip:focus-visible,.ov-buy:focus-visible,.ov-sell:focus-visible,.ov-empty-btn:focus-visible,.ov-banner-act:focus-visible{outline:2px solid var(--ov-accent-bright);outline-offset:2px}`,
    `.ov-icon-btn.ov-ghost{border-color:rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:var(--ov-text-dim);max-width:none}`,
    `.ov-icon-btn.ov-ghost:hover{border-color:rgba(255,255,255,.3);background:rgba(255,255,255,.09);color:#fff}`,
    `.ov-icon-btn.ov-gear{border-color:var(--ov-accent-line-strong);background:rgba(15,40,84,.42);color:var(--ov-accent-bright)}`,
    `.ov-icon-btn.ov-gear.ov-on,.ov-icon-btn.ov-gear:hover{border-color:rgba(58,168,240,.8);background:rgba(58,168,240,.18)}`,
    `.ov-icon-btn.ov-spin svg{animation:ov-spin 620ms linear}`,
    `.ov-close{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;flex-shrink:0;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:rgba(255,255,255,.04);color:var(--ov-text-dim);cursor:pointer;transition:background 140ms ease,border-color 140ms ease,color 140ms ease,transform 140ms ease}`,
    `.ov-close svg{transition:transform 140ms cubic-bezier(.22,1,.36,1)}`,
    `.ov-close:hover{background:rgba(255,92,92,.14);border-color:var(--ov-bad-line);color:#ff8a8a}`,
    `.ov-close:hover svg{transform:rotate(90deg)}`,
    `.ov-close:active{transform:translateY(1px)}`,
    `.ov-banner{display:none;align-items:center;gap:9px;flex-shrink:0;padding:8px 12px;border-bottom:1px solid rgba(255,92,92,.28);background:rgba(58,14,22,.55);color:#ffb3c1;font:600 11px/1.35 var(--ov-font)}`,
    `.ov-banner.ov-show{display:flex}`,
    `.ov-banner.ov-warn{border-bottom-color:rgba(230,184,77,.3);background:rgba(50,38,10,.5);color:#f0d79a}`,
    `.ov-banner-dot{width:6px;height:6px;flex-shrink:0;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px rgba(255,92,92,.14)}`,
    `.ov-banner-msg{flex:1;min-width:0}`,
    `.ov-banner-act{display:none;height:24px;padding:0 9px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;font:600 10px/1 var(--ov-font);cursor:pointer}`,
    `.ov-banner-act.ov-show{display:inline-flex;align-items:center}`,
    `.ov-banner-act:hover{background:rgba(255,255,255,.12)}`,
    `.ov-panel-body{display:grid;grid-template-columns:minmax(260px,1fr) minmax(280px,1.15fr);flex:1;min-height:0;overflow:hidden}`,
    `@media (max-width:720px){.ov-panel-body{grid-template-columns:1fr;max-height:min(70vh,560px);overflow:auto}}`,
    `.ov-col{display:flex;flex-direction:column;min-height:0;min-width:0}`,
    `.ov-col-trade{border-right:1px solid rgba(58,168,240,.16);background:rgba(8,18,36,.42)}`,
    `.ov-col-hold{background:rgba(6,12,24,.38)}`,
    `.ov-sec-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-shrink:0;height:38px;padding:0 12px;border-bottom:1px solid rgba(58,168,240,.1)}`,
    `.ov-sec-title{font:700 11px/1 var(--ov-font);letter-spacing:.09em;text-transform:uppercase;color:rgba(191,232,245,.72)}`,
    `.ov-count{font:600 10px/1 var(--ov-font);color:var(--ov-text-faint)}`,
    `.ov-vault-btn .ov-vault-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}`,
    `.ov-vault-wrap{position:relative}`,
    `.ov-vault-menu{position:absolute;top:calc(100% + 6px);right:0;z-index:5;min-width:220px;max-height:240px;overflow:auto;padding:5px;border-radius:10px;border:1px solid var(--ov-accent-line);background:rgba(10,20,38,.98);box-shadow:0 14px 34px rgba(0,0,0,.55);display:none}`,
    `.ov-vault-menu.ov-show{display:block}`,
    `.ov-vault-item{display:flex;flex-direction:column;align-items:flex-start;gap:3px;width:100%;padding:8px 10px;border:0;border-radius:7px;background:transparent;color:#fff;text-align:left;cursor:pointer;font:500 12px/1.2 var(--ov-font)}`,
    `.ov-vault-item:hover,.ov-vault-item.ov-sel{background:rgba(58,168,240,.15)}`,
    `.ov-vault-item.ov-sel{box-shadow:inset 2px 0 0 var(--ov-accent)}`,
    `.ov-vault-item span{color:var(--ov-text-faint);font-size:10px}`,
    `.ov-body{padding:12px;display:flex;flex-direction:column;gap:14px;overflow:auto}`,
    `.ov-sec-label{display:flex;align-items:center;justify-content:space-between;gap:8px;font:600 12px/1 var(--ov-font);color:var(--ov-text-dim)}`,
    `.ov-sec-label strong{color:#fff}`,
    `.ov-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}`,
    `.ov-buy{height:38px;border:1px solid var(--ov-ok-line);border-radius:8px;background:linear-gradient(180deg,rgba(30,58,40,.75),rgba(16,34,24,.7));color:var(--ov-ok);font:700 12px/1 var(--ov-font);cursor:pointer;font-variant-numeric:tabular-nums;transition:background 130ms ease,border-color 130ms ease,transform 130ms ease,box-shadow 130ms ease}`,
    `.ov-buy:hover:not(:disabled){transform:translateY(-1px);border-color:rgba(136,246,152,.85);background:linear-gradient(180deg,rgba(44,84,56,.9),rgba(24,50,34,.85));box-shadow:0 6px 16px rgba(136,246,152,.18)}`,
    `.ov-buy:active:not(:disabled){transform:translateY(0);box-shadow:none}`,
    `.ov-sell{height:38px;border:1px solid rgba(255,90,120,.3);border-radius:8px;background:linear-gradient(180deg,rgba(44,18,26,.6),rgba(26,12,18,.55));color:#ff9db0;font:700 12px/1 var(--ov-font);cursor:pointer;font-variant-numeric:tabular-nums;transition:background 130ms ease,border-color 130ms ease,transform 130ms ease,box-shadow 130ms ease}`,
    `.ov-sell[data-pct="25"]{border-color:rgba(255,90,120,.42);color:#ff90a6}`,
    `.ov-sell[data-pct="50"]{border-color:rgba(255,90,120,.55);color:#ff7f98;background:linear-gradient(180deg,rgba(60,20,30,.68),rgba(32,13,20,.6))}`,
    `.ov-sell[data-pct="100"]{border-color:rgba(255,90,120,.72);color:var(--ov-bad);background:linear-gradient(180deg,rgba(84,22,36,.75),rgba(44,14,23,.68))}`,
    `.ov-sell:hover:not(:disabled){transform:translateY(-1px);border-color:rgba(255,90,120,.9);box-shadow:0 6px 16px rgba(255,90,120,.2)}`,
    `.ov-sell:active:not(:disabled){transform:translateY(0);box-shadow:none}`,
    `.ov-buy:disabled,.ov-sell:disabled,.ov-icon-btn:disabled{opacity:.35;cursor:not-allowed;transform:none;box-shadow:none}`,
    `.ov-meta{display:flex;flex-wrap:wrap;gap:8px;font:500 10px/1 var(--ov-font);color:var(--ov-text-faint)}`,
    `.ov-avail{display:inline-flex;align-items:center;height:20px;padding:0 8px;border:1px solid var(--ov-ok-line);border-radius:999px;background:rgba(136,246,152,.1);color:var(--ov-ok);font:600 10px/1 var(--ov-font);font-variant-numeric:tabular-nums;white-space:nowrap}`,
    `.ov-avail.ov-zero{border-color:rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:var(--ov-text-faint)}`,
    `.ov-settings{display:none;padding:10px 12px 12px;border-top:1px solid rgba(58,168,240,.14);background:#0a1526;gap:11px;flex-direction:column}`,
    `.ov-settings.ov-show{display:flex}`,
    `.ov-set-row{display:flex;flex-direction:column;gap:5px}`,
    `.ov-set-lab{display:flex;align-items:center;justify-content:space-between;font:600 10px/1 var(--ov-font);color:rgba(191,232,245,.75);letter-spacing:.05em;text-transform:uppercase}`,
    `.ov-set-lab span{color:var(--ov-text-faint);font-weight:500;text-transform:none;letter-spacing:0}`,
    `.ov-chips{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:5px}`,
    `.ov-chip{height:28px;padding:0 4px;border:1px solid var(--ov-accent-line);border-radius:7px;background:#122c50;color:rgba(255,255,255,.82);font:600 11px/1 var(--ov-font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;transition:background 130ms ease,border-color 130ms ease,color 130ms ease}`,
    `.ov-chip:hover{border-color:var(--ov-accent-line-strong);color:#fff}`,
    `.ov-chip.ov-on{border-color:rgba(58,168,240,.85);background:rgba(58,168,240,.22);color:var(--ov-accent-bright)}`,
    `.ov-set-hint{font:500 10px/1.4 var(--ov-font);color:rgba(255,255,255,.5)}`,
    `.ov-set-div{height:1px;background:var(--ov-hairline)}`,
    `.ov-range-row{display:flex;align-items:center;gap:10px}`,
    `.ov-range{flex:1;height:16px;margin:0;padding:0;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer}`,
    `.ov-range:focus-visible{outline:2px solid var(--ov-accent-bright);outline-offset:3px;border-radius:4px}`,
    `.ov-range::-webkit-slider-runnable-track{height:4px;border-radius:999px;background:linear-gradient(90deg,var(--ov-accent) 0%,var(--ov-accent-bright) var(--ov-range-fill,100%),rgba(255,255,255,.15) var(--ov-range-fill,100%))}`,
    `.ov-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;margin-top:-5px;border:2px solid #0a1526;border-radius:50%;background:var(--ov-accent-bright);box-shadow:0 0 0 1px rgba(58,168,240,.65),0 2px 6px rgba(0,0,0,.5);transition:background 130ms ease,transform 130ms ease}`,
    `.ov-range:hover::-webkit-slider-thumb{background:#fff;transform:scale(1.12)}`,
    `.ov-range-val{min-width:38px;text-align:right;font:700 11px/1 var(--ov-font);font-variant-numeric:tabular-nums;color:var(--ov-accent-bright)}`,
    `.ov-foot{display:grid;grid-template-columns:repeat(4,1fr);flex-shrink:0;padding:9px 12px;border-top:1px solid rgba(58,168,240,.14);font:600 9px/1 var(--ov-font);letter-spacing:.07em;text-transform:uppercase;color:rgba(255,255,255,.45);background:#070f1e}`,
    `.ov-foot>div{padding:0 9px;border-left:1px solid var(--ov-hairline)}`,
    `.ov-foot>div:first-child{padding-left:0;border-left:0}`,
    `.ov-foot b{display:block;margin-top:5px;font:700 11.5px/1 var(--ov-font);letter-spacing:0;text-transform:none;color:rgba(255,255,255,.85);font-variant-numeric:tabular-nums}`,
    `.ov-status{padding:8px 12px 9px;font:500 11px/1.35 var(--ov-font);color:rgba(255,255,255,.68);background:#0a1526;min-height:16px}`,
    `.ov-status.ov-err{color:var(--ov-bad)}`,
    `.ov-status.ov-ok{color:var(--ov-ok)}`,
    `.ov-hold-cols{display:grid;grid-template-columns:minmax(0,1.4fr) .7fr .95fr .55fr;gap:6px;flex-shrink:0;padding:7px 12px;font:600 10px/1 var(--ov-font);letter-spacing:.06em;text-transform:uppercase;color:var(--ov-text-faint);border-bottom:1px solid rgba(58,168,240,.12);background:rgba(6,12,24,.94)}`,
    `.ov-hold-list{overflow:auto;flex:1;min-height:0}`,
    `.ov-hold-row{display:grid;grid-template-columns:minmax(0,1.4fr) .7fr .95fr .55fr;gap:6px;align-items:center;padding:10px 12px;border-bottom:1px solid rgba(58,168,240,.07);transition:background 130ms ease}`,
    `.ov-hold-row:hover{background:rgba(58,168,240,.07)}`,
    `.ov-token{display:flex;align-items:center;gap:8px;min-width:0}`,
    `.ov-av{width:28px;height:28px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font:700 9px/1 var(--ov-font);color:#fff;background:linear-gradient(145deg,#1c4d8d,#3aa8f0);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}`,
    `.ov-token-name{font:600 12px/1.2 var(--ov-font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    `.ov-token-sub{display:flex;align-items:center;gap:4px;margin-top:3px;font:500 10px/1 var(--ov-font);color:var(--ov-text-faint)}`,
    `.ov-vault-tag{display:inline-flex;align-items:center;height:16px;padding:0 5px;border:1px solid var(--ov-accent-line);border-radius:5px;background:var(--ov-accent-dim);color:var(--ov-accent-bright);font:600 9px/1 var(--ov-font)}`,
    `.ov-num{font:600 11px/1.2 var(--ov-font);color:rgba(255,255,255,.86);font-variant-numeric:tabular-nums}`,
    `.ov-pnl{display:inline-flex;align-items:center;height:20px;padding:0 7px;border:1px solid transparent;border-radius:999px;font:700 10.5px/1 var(--ov-font);font-variant-numeric:tabular-nums}`,
    `.ov-pnl.ov-up{color:var(--ov-ok);background:rgba(136,246,152,.12);border-color:rgba(136,246,152,.28)}`,
    `.ov-pnl.ov-down{color:var(--ov-bad);background:rgba(255,92,92,.12);border-color:rgba(255,92,92,.3)}`,
    `.ov-pnl.ov-flat{color:var(--ov-text-dim);background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.12)}`,
    `.ov-down{color:var(--ov-bad)}`,
    `.ov-up{color:var(--ov-ok)}`,
    `.ov-empty{padding:24px 14px;text-align:center;font:500 12px/1.45 var(--ov-font);color:var(--ov-text-faint)}`,
    `.ov-empty-rich{display:flex;flex-direction:column;align-items:center;gap:7px;padding:16px 14px;border:1px dashed var(--ov-accent-line);border-radius:10px;background:rgba(10,22,42,.4);text-align:center}`,
    `.ov-empty-ico{display:grid;place-items:center;width:32px;height:32px;border:1px solid var(--ov-accent-line);border-radius:9px;background:var(--ov-accent-dim);color:var(--ov-accent-bright)}`,
    `.ov-empty-t{font:600 12px/1.3 var(--ov-font);color:rgba(255,255,255,.82)}`,
    `.ov-empty-s{font:500 10.5px/1.45 var(--ov-font);color:var(--ov-text-faint);max-width:240px}`,
    `.ov-empty-btn{height:26px;padding:0 11px;border:1px solid var(--ov-accent-line-strong);border-radius:7px;background:rgba(58,168,240,.14);color:var(--ov-accent-bright);font:600 10.5px/1 var(--ov-font);cursor:pointer;transition:background 130ms ease,border-color 130ms ease}`,
    `.ov-empty-btn:hover{background:rgba(58,168,240,.24);border-color:rgba(58,168,240,.8)}`,
    `@media (prefers-reduced-motion:reduce){#${PANEL_ID},#${PANEL_ID} *{transition:none!important;animation:none!important}.ov-buy:hover:not(:disabled),.ov-sell:hover:not(:disabled),.ov-close:hover svg,.ov-icon-btn:active,.ov-close:active{transform:none!important}}`,
  ].join("");
  document.documentElement.appendChild(style);
}

function removeOldPill(): void {
  document.getElementById(OLD_PILL_ID)?.remove();
}

function findInstantTradeHost(): HTMLElement | null {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node = walk.nextNode();
  while (node) {
    const el = node as HTMLElement;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (
      el.childElementCount <= 3 &&
      text.length < 40 &&
      (/^instant trade$/i.test(text) || text.toLowerCase() === "instant trade")
    ) {
      const btn = el.closest("button,a,[role='button']") as HTMLElement | null;
      return btn ?? el;
    }
    node = walk.nextNode();
  }
  return null;
}

function ensureRoot(): HTMLElement {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    document.documentElement.appendChild(root);
  }
  return root;
}

function setStatus(msg: string, kind: "" | "err" | "ok" = ""): void {
  const el = document.querySelector(`#${PANEL_ID} .ov-status`);
  if (!el) return;
  el.textContent = msg;
  el.className = `ov-status${kind ? ` ov-${kind}` : ""}`;
}

/** Stale content script — the tab must reload before any message can land. */
function isConnErr(msg: string): boolean {
  return /Extension was updated|context invalidated|extension.?context|Receiving end does not exist|Could not establish connection/i.test(
    msg
  );
}

/**
 * Panel-level banner for connection faults, so one failure renders once
 * instead of duplicating across the trade status and the holdings list.
 */
function setBanner(msg: string, kind: "err" | "warn" = "err"): void {
  const banner = document.querySelector(`#${PANEL_ID} .ov-banner`);
  if (!banner) return;
  const text = banner.querySelector(".ov-banner-msg");
  const act = banner.querySelector(".ov-banner-act");
  if (text) text.textContent = msg;
  banner.classList.toggle("ov-show", msg.length > 0);
  banner.classList.toggle("ov-warn", kind === "warn");
  act?.classList.toggle("ov-show", msg.length > 0 && isConnErr(msg));
}

function renderTokenChip(): void {
  const chip = document.querySelector(`#${PANEL_ID} .ov-token-chip`) as HTMLElement | null;
  if (!chip) return;
  const mint = extractMint();
  chip.classList.toggle("ov-hide", !mint);
  if (!mint) return;
  chip.textContent = mintLabel(mint);
  chip.title = mint;
}

function renderTradeSettings(): void {
  const root = document.querySelector(`#${PANEL_ID} .ov-settings`);
  if (!root) return;
  const slip = root.querySelector('[data-set="slip"]');
  const gas = root.querySelector('[data-set="gas"]');
  const tip = root.querySelector('[data-set="tip"]');
  slip?.querySelectorAll(".ov-chip").forEach((btn) => {
    const bps = Number((btn as HTMLElement).dataset.bps);
    btn.classList.toggle("ov-on", bps === tradeSettings.slippageBps);
  });
  gas?.querySelectorAll(".ov-chip").forEach((btn) => {
    const micro = Number((btn as HTMLElement).dataset.micro);
    btn.classList.toggle("ov-on", micro === tradeSettings.gasMicro);
  });
  tip?.querySelectorAll(".ov-chip").forEach((btn) => {
    const lamports = Number((btn as HTMLElement).dataset.lamports);
    btn.classList.toggle("ov-on", lamports === tradeSettings.tipLamports);
  });
  const range = root.querySelector(".ov-range") as HTMLInputElement | null;
  if (range) {
    range.value = String(tradeSettings.opacityPct);
    const span = 100 - MIN_OPACITY_PCT;
    const fill = ((tradeSettings.opacityPct - MIN_OPACITY_PCT) / span) * 100;
    range.style.setProperty("--ov-range-fill", `${fill}%`);
  }
  const rangeVal = root.querySelector(".ov-range-val");
  if (rangeVal) rangeVal.textContent = `${tradeSettings.opacityPct}%`;
  applyPanelOpacity();
  const gear = document.querySelector(`#${PANEL_ID} [data-action="settings"]`);
  const open = root.classList.contains("ov-show");
  gear?.classList.toggle("ov-on", open);
}

function vaultBadgeLabel(v: VaultRow | null): string {
  if (!v) return "?";
  return String(v.vaultId > 0 ? v.vaultId : "1");
}

/** Short label for the vault picker button (selected vault name). */
function vaultButtonLabel(v: VaultRow | null): string {
  if (!v) return "Select";
  const name = (v.name || "Vault").trim() || "Vault";
  if (name.length <= 14) return name;
  return `${name.slice(0, 12)}…`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function closeVaultMenus(): void {
  document.querySelectorAll(`#${PANEL_ID} .ov-vault-menu`).forEach((m) => m.classList.remove("ov-show"));
}

function renderVaultMenus(): void {
  document.querySelectorAll(`#${PANEL_ID} .ov-vault-menu`).forEach((menu) => {
    menu.innerHTML = "";
    if (vaults.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ov-empty";
      empty.style.padding = "10px";
      empty.textContent = "No Active vaults — create or select an Active vault in the side panel.";
      menu.appendChild(empty);
      return;
    }
    for (const v of vaults) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `ov-vault-item${selectedVault?.pubkey === v.pubkey ? " ov-sel" : ""}`;
      const parkLabel = formatSolAmt(Number(v.parkLamports) / 1e9);
      item.innerHTML = `<strong>${escapeHtml(v.name)}</strong><span>${escapeHtml(parkLabel)} SOL · ${escapeHtml(shortAddr(v.pubkey))}</span>`;
      item.addEventListener("click", () => {
        void selectVault(v);
        closeVaultMenus();
      });
      menu.appendChild(item);
    }
  });
  document.querySelectorAll(`#${PANEL_ID} .ov-vault-btn`).forEach((btn) => {
    const label = btn.querySelector(".ov-vault-n");
    if (label) label.textContent = vaultButtonLabel(selectedVault);
    const el = btn as HTMLElement;
    if (selectedVault) {
      el.title = `${selectedVault.name} · ${formatSolAmt(Number(selectedVault.parkLamports) / 1e9)} SOL · ${shortAddr(selectedVault.pubkey)}`;
    } else {
      el.title = "Select vault for entry";
    }
  });
}

function parseAmountToLamports(raw: unknown): bigint {
  if (typeof raw === "bigint") return raw > 0n ? raw : 0n;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    if (raw < 1_000) return BigInt(Math.floor(raw * 1e9));
    return BigInt(Math.floor(raw));
  }
  const s = String(raw ?? "").trim().replace(/,/g, "");
  if (!s || s === "0") return 0n;
  if (/^\d+$/.test(s)) {
    try {
      const n = BigInt(s);
      return n > 0n ? n : 0n;
    } catch {
      return 0n;
    }
  }
  if (/^\d*\.\d+$/.test(s) || /^\d+\.\d*$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.floor(n * 1e9 + 1e-9));
  }
  return 0n;
}

function maxLamports(...vals: unknown[]): bigint {
  let best = 0n;
  for (const v of vals) {
    const n = parseAmountToLamports(v);
    if (n > best) best = n;
  }
  return best;
}

function seedParkFromVaultRow(row: Record<string, unknown>): bigint {
  return maxLamports(
    row.nav,
    row.total_assets,
    row.totalAssets,
    row.remaining_parked,
    row.remainingParked,
    row.strategistParked,
    row.parked
  );
}

async function fetchVaultParkLamports(vaultPubkey: string, seed = 0n): Promise<bigint> {
  try {
    const park = await bg<{
      total?: { committed?: string; projected?: string };
      strategist?: { committed?: string };
    }>({ type: "PARK_BREAKDOWN", vault: vaultPubkey });

    const live = maxLamports(
      park.total?.committed,
      park.strategist?.committed,
      park.total?.projected
    );
    return live > seed ? live : seed;
  } catch {
    return seed;
  }
}

/** Presets that never exceed vault park; last slot is Max when park > 0. */
function buyAmountsForVault(): number[] {
  const max = vaultMaxSol();
  if (!(max > 0)) return [];
  const presets = BUY_PRESET_SOL.filter((a) => a <= max + 1e-12);
  const out: number[] = [];
  for (const a of presets) {
    if (!out.some((x) => Math.abs(x - a) < 1e-9)) out.push(a);
  }
  const maxRounded = Math.floor(max * 1e6) / 1e6;
  if (!out.some((x) => Math.abs(x - maxRounded) < 1e-9)) {
    if (out.length >= 4) out[out.length - 1] = maxRounded;
    else out.push(maxRounded);
  }
  return out.slice(0, 4);
}

function renderBuyButtons(): void {
  const grid = document.querySelector(`#${PANEL_ID} .ov-buy-grid`) as HTMLElement | null;
  const availEl = document.querySelector(`#${PANEL_ID} .ov-avail`);
  if (availEl) {
    const hasPark = vaultParkLamports > 0n;
    availEl.textContent = hasPark
      ? `Available ${formatSolAmt(vaultMaxSol())} SOL`
      : "Available 0 SOL";
    availEl.classList.toggle("ov-zero", !hasPark);
  }
  if (!grid) return;
  grid.innerHTML = "";
  const amounts = buyAmountsForVault();
  if (amounts.length === 0) {
    grid.style.display = "block";
    const empty = document.createElement("div");
    empty.className = "ov-empty-rich";
    empty.innerHTML = [
      `<span class="ov-empty-ico">${ICON_WALLET}</span>`,
      `<span class="ov-empty-t">No park SOL in this vault</span>`,
      `<span class="ov-empty-s">Park SOL into the selected vault first — buy presets are capped to what is parked.</span>`,
      `<button type="button" class="ov-empty-btn">Park SOL</button>`,
    ].join("");
    empty.querySelector(".ov-empty-btn")?.addEventListener("click", () => {
      void chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
    });
    grid.appendChild(empty);
    return;
  }
  grid.style.display = "";
  const max = vaultMaxSol();
  for (let i = 0; i < amounts.length; i++) {
    const amt = amounts[i]!;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ov-buy";
    const isMaxSlot = i === amounts.length - 1 && Math.abs(amt - max) < 1e-6;
    b.textContent = isMaxSlot ? `Max ${formatSolAmt(amt)}` : formatSolAmt(amt);
    b.disabled = amt > max + 1e-12 || busy;
    b.title = `Buy ${formatSolAmt(amt)} SOL (max ${formatSolAmt(max)} SOL)`;
    b.addEventListener("click", () => void runBuy(amt));
    grid.appendChild(b);
  }
}

async function refreshVaultPark(): Promise<void> {
  if (!selectedVault) {
    vaultParkLamports = 0n;
    renderBuyButtons();
    const footBal = document.querySelector(`#${PANEL_ID} .ov-foot-bal`);
    if (footBal) footBal.textContent = "—";
    return;
  }
  const lamports = await fetchVaultParkLamports(
    selectedVault.pubkey,
    selectedVault.parkLamports
  );
  vaultParkLamports = lamports;
  selectedVault = { ...selectedVault, parkLamports: lamports };
  const idx = vaults.findIndex((v) => v.pubkey === selectedVault!.pubkey);
  if (idx >= 0) vaults[idx] = selectedVault;
  renderBuyButtons();
  const footBal = document.querySelector(`#${PANEL_ID} .ov-foot-bal`);
  if (footBal) {
    footBal.textContent = lamports > 0n ? `${formatSolAmt(vaultMaxSol())} SOL` : "—";
  }
}

async function sessionGet(keys: string[]): Promise<Record<string, unknown>> {
  return bg<Record<string, unknown>>({ type: "SESSION_GET", keys });
}

async function sessionSet(values: Record<string, unknown>): Promise<void> {
  await bg({ type: "SESSION_SET", values });
}

async function selectVault(v: VaultRow): Promise<void> {
  selectedVault = v;
  await sessionSet({ activeVault: v.pubkey });
  renderVaultMenus();
  await Promise.all([refreshPositions(), refreshVaultPark()]);
}

let vaultSyncTimer: number | null = null;

function startVaultSyncPoll(): void {
  if (vaultSyncTimer != null) return;
  vaultSyncTimer = window.setInterval(() => {
    if (panelOpen && isSolTokenPage()) void loadVaults();
  }, 20_000);
}

function stopVaultSyncPoll(): void {
  if (vaultSyncTimer == null) return;
  window.clearInterval(vaultSyncTimer);
  vaultSyncTimer = null;
}

async function loadVaults(): Promise<void> {
  const holdList = document.querySelector(`#${PANEL_ID} .ov-hold-list`);
  if (holdList) holdList.innerHTML = `<div class="ov-empty">Loading vaults…</div>`;
  setStatus("Loading vaults…");
  setBanner("");
  renderTokenChip();

  try {
    const data = await bg<{ vaults?: Array<Record<string, unknown>>; pubkey?: string }>({
      type: "MY_VAULTS",
      tradeableOnly: true,
    });
    const rows = data.vaults ?? [];

    const mapped: VaultRow[] = rows
      .map((row) => {
        const pubkey = String(row.pubkey ?? "");
        const vaultId = Number(row.vaultId ?? row.vault_id ?? 0) || 0;
        const { status, statusCode } = vaultStatusFields(row);
        const seed = seedParkFromVaultRow(row);
        return {
          pubkey,
          name: String(row.name ?? "Vault"),
          vaultId,
          status,
          statusCode: statusCode ?? -1,
          parkLamports: seed,
        } satisfies VaultRow;
      })
      .filter((v) => v.pubkey.length >= 32);

    hasTradeableVaults = mapped.length > 0;

    if (mapped.length === 0) {
      vaults = [];
      selectedVault = null;
      vaultParkLamports = 0n;
      renderVaultMenus();
      renderBuyButtons();
      setHoldCount(null);
      if (holdList) {
        holdList.innerHTML = `<div class="ov-empty">No Active vaults — only open/Active vaults appear in Instant Trade.</div>`;
      }
      setStatus(
        rows.length > 0
          ? "No Active vaults — Closed/Paused vaults are hidden."
          : "No vaults on this wallet — unlock side panel and create/park first.",
        "err"
      );
      return;
    }

    vaults = mapped;

    const stored = await sessionGet(["activeVault"]).catch(() => ({} as Record<string, unknown>));
    const preferred =
      typeof stored.activeVault === "string"
        ? vaults.find((v) => v.pubkey === stored.activeVault)
        : null;
    selectedVault =
      preferred ??
      vaults.find((v) => v.parkLamports > 0n) ??
      vaults[0] ??
      null;

    if (selectedVault) {
      await sessionSet({ activeVault: selectedVault.pubkey }).catch(() => undefined);
      vaultParkLamports = selectedVault.parkLamports;
      setStatus(
        selectedVault.parkLamports > 0n
          ? `Vault ready · ${formatSolAmt(Number(selectedVault.parkLamports) / 1e9)} SOL available`
          : "Vault selected — syncing park…",
        selectedVault.parkLamports > 0n ? "ok" : ""
      );
    } else {
      vaultParkLamports = 0n;
      setStatus("Select a vault to trade.", "err");
    }

    renderVaultMenus();
    renderBuyButtons();
    await Promise.all([refreshPositions(), refreshVaultPark()]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setBanner(msg, isConnErr(msg) ? "err" : "warn");
    setStatus("");
    vaults = [];
    selectedVault = null;
    vaultParkLamports = 0n;
    hasTradeableVaults = false;
    syncTokenPageUi();
    renderVaultMenus();
    renderBuyButtons();
    setHoldCount(null);
    if (holdList) {
      holdList.innerHTML = `<div class="ov-empty">Holdings unavailable while vaults cannot load.</div>`;
    }
  }
}

function setHoldCount(n: number | null): void {
  const el = document.querySelector(`#${PANEL_ID} .ov-count`);
  if (!el) return;
  el.textContent = n == null ? "" : n === 1 ? "1 position" : `${n} positions`;
}

async function refreshPositions(): Promise<void> {
  const list = document.querySelector(`#${PANEL_ID} .ov-hold-list`);
  if (!list) return;
  if (!selectedVault) {
    list.innerHTML = `<div class="ov-empty">Select a vault to load holdings.</div>`;
    positions = [];
    setHoldCount(null);
    return;
  }
  list.innerHTML = `<div class="ov-empty">Loading…</div>`;
  try {
    const data = await bg<{ positions?: PosRow[] }>({
      type: "VAULT_POSITIONS",
      vault: selectedVault.pubkey,
    });
    positions = data.positions ?? [];
    setHoldCount(positions.length);
    if (positions.length === 0) {
      list.innerHTML = `<div class="ov-empty">No open holdings in this vault.</div>`;
      return;
    }
    list.innerHTML = "";
    for (const pos of positions) {
      const mint = pos.outputMint || pos.inputMint;
      const ticker = mintLabel(mint);
      const entry = pos.entryValue || "0";
      const cur = pos.currentValue || entry;
      const pct = pnlPct(entry, cur);
      const row = document.createElement("div");
      row.className = "ov-hold-row";
      const pnlClass = pct == null || pct === 0 ? "ov-flat" : pct < 0 ? "ov-down" : "ov-up";
      const pnlText = pct == null ? "—" : `${pct < 0 ? "" : "+"}${pct.toFixed(1)}%`;
      row.innerHTML = [
        `<div class="ov-token"><div class="ov-av">${escapeHtml(ticker.slice(0, 2))}</div>`,
        `<div><div class="ov-token-name" title="${escapeHtml(mint)}">${escapeHtml(ticker)}</div>`,
        `<div class="ov-token-sub"><span class="ov-vault-tag">#${escapeHtml(vaultBadgeLabel(selectedVault))}</span></div></div></div>`,
        `<div class="ov-num">${escapeHtml(lamportsToSol(entry, 2))} SOL</div>`,
        `<div><span class="ov-pnl ${pnlClass}">${escapeHtml(pnlText)}</span></div>`,
        `<div class="ov-num">${escapeHtml(lamportsToSol(cur, 3))}</div>`,
      ].join("");
      list.appendChild(row);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setHoldCount(null);
    if (isConnErr(msg)) {
      setBanner(msg);
      list.innerHTML = `<div class="ov-empty">Holdings unavailable — reload the tab.</div>`;
    } else {
      list.innerHTML = `<div class="ov-empty ov-down">${escapeHtml(msg)}</div>`;
    }
  }
}

async function runBuy(amountSol: number): Promise<void> {
  if (!selectedVault) {
    setStatus("Select a vault first.", "err");
    return;
  }
  if (!isVaultTradeable(selectedVault.status, selectedVault.statusCode)) {
    setStatus("This vault is Closed — trading disabled.", "err");
    return;
  }
  const mint = extractMint();
  if (!mint) {
    setStatus("Open a Solana token page on GMGN first.", "err");
    return;
  }
  const max = vaultMaxSol();
  if (!(max > 0)) {
    setStatus("Selected vault has no park SOL.", "err");
    return;
  }
  if (amountSol > max + 1e-9) {
    setStatus(`Amount exceeds vault park (${formatSolAmt(max)} SOL max).`, "err");
    return;
  }
  if (busy) return;
  busy = true;
  renderBuyButtons();
  setStatus(`Opening position · ${formatSolAmt(amountSol)} SOL…`);
  try {
    await sessionSet({
      activeVault: selectedVault.pubkey,
      tradeMint: mint,
      openTradeTab: true,
      tradeBuySol: amountSol,
    });
    await bg({
      type: "RUN_FLOW",
      mode: "open-position",
      vault: selectedVault.pubkey,
      vaultId: selectedVault.vaultId || undefined,
      parkSol: amountSol,
      slippageBps: tradeSettings.slippageBps,
      priorityFeeMicroLamports: effectivePriorityMicro(),
    });
    setStatus("Buy submitted — watch the 1vaults side panel for progress.", "ok");
    void chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
    setTimeout(() => {
      void refreshPositions();
      void refreshVaultPark();
    }, 2500);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isConnErr(msg)) setBanner(msg);
    else setStatus(msg, "err");
  } finally {
    busy = false;
    renderBuyButtons();
  }
}

async function runSell(pct: number): Promise<void> {
  if (!selectedVault) {
    setStatus("Select a vault first.", "err");
    return;
  }
  if (!isVaultTradeable(selectedVault.status, selectedVault.statusCode)) {
    setStatus("This vault is Closed — trading disabled.", "err");
    return;
  }
  const mint = extractMint();
  if (!mint) {
    setStatus("Open a Solana token page on GMGN first.", "err");
    return;
  }
  const pos =
    positions.find((p) => (p.outputMint || p.inputMint) === mint) ?? positions[0];
  if (!pos) {
    setStatus("No open position in this vault to sell.", "err");
    return;
  }
  if (busy) return;
  busy = true;
  setStatus(`Selling ${pct}%…`);
  try {
    await bg({
      type: "RUN_FLOW",
      mode: "exit-position",
      vault: selectedVault.pubkey,
      vaultId: selectedVault.vaultId || undefined,
      positionId: pos.positionId,
      tradeId: pos.tradeId,
      inputMint: pos.outputMint || pos.inputMint,
      exitPercent: pct,
      slippageBps: tradeSettings.slippageBps,
      priorityFeeMicroLamports: effectivePriorityMicro(),
    });
    setStatus(`Sell ${pct}% submitted — watch the 1vaults side panel.`, "ok");
    void chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
    setTimeout(() => void refreshPositions(), 2500);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (isConnErr(msg)) setBanner(msg);
    else setStatus(msg, "err");
  } finally {
    busy = false;
  }
}

function clampPanelPosition(panel: HTMLElement, left: number, top: number): { left: number; top: number } {
  const rect = panel.getBoundingClientRect();
  const w = rect.width || 320;
  const h = rect.height || 200;
  const maxL = Math.max(8, window.innerWidth - w - 8);
  const maxT = Math.max(8, window.innerHeight - h - 8);
  return {
    left: Math.min(Math.max(8, left), maxL),
    top: Math.min(Math.max(8, top), maxT),
  };
}

function applyPanelPosition(panel: HTMLElement, left: number, top: number): void {
  const p = clampPanelPosition(panel, left, top);
  panel.style.left = `${p.left}px`;
  panel.style.top = `${p.top}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  lastPanelPos = { left: p.left, top: p.top };
}

function restorePanelPosition(panel: HTMLElement): void {
  if (!lastPanelPos) return;
  applyPanelPosition(panel, lastPanelPos.left, lastPanelPos.top);
}

function attachDrag(panel: HTMLElement): void {
  if (panel.dataset.ovDragBound === "1") return;
  panel.dataset.ovDragBound = "1";

  const onMove = (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    applyPanelPosition(panel, dragState.origLeft + dx, dragState.origTop + dy);
  };

  const onUp = (e: PointerEvent) => {
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    try {
      panel.releasePointerCapture(dragState.pointerId);
    } catch {
      /* ignore */
    }
    dragState = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };

  const startDrag = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const t = ev.target as HTMLElement | null;
    if (!t?.closest(".ov-topbar")) return;
    if (t.closest("button,a,input,select,.ov-vault-menu")) return;
    const rect = panel.getBoundingClientRect();
    dragState = {
      startX: ev.clientX,
      startY: ev.clientY,
      origLeft: rect.left,
      origTop: rect.top,
      pointerId: ev.pointerId,
    };
    applyPanelPosition(panel, rect.left, rect.top);
    try {
      panel.setPointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    ev.preventDefault();
    ev.stopPropagation();
  };

  panel.addEventListener("pointerdown", startDrag);
}

function buildPanel(root: HTMLElement): HTMLElement {
  let panel = document.getElementById(PANEL_ID) as HTMLElement | null;
  if (panel) {
    attachDrag(panel);
    return panel;
  }

  const brandIcon = iconUrl() ? `<img src="${iconUrl()}" alt="">` : "";

  panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="ov-topbar" title="Drag to move">
      <span class="ov-grip"></span>
      <div class="ov-brand">
        ${brandIcon}
        <span class="ov-title">1vault Instant Trade</span>
        <span class="ov-token-chip ov-hide"></span>
      </div>
      <div class="ov-actions">
        <div class="ov-vault-wrap">
          <button type="button" class="ov-icon-btn ov-vault-btn" title="Select vault for entry" aria-label="Select vault" data-menu="trade">
            ${ICON_VAULT}
            <span class="ov-vault-n">Select</span>
          </button>
          <div class="ov-vault-menu" data-menu="trade"></div>
        </div>
        <button type="button" class="ov-icon-btn ov-gear" data-action="settings" title="Slippage, gas &amp; tip" aria-label="Trade settings">${ICON_GEAR}</button>
        <button type="button" class="ov-icon-btn ov-ghost" data-action="refresh" title="Refresh holdings &amp; park" aria-label="Refresh">${ICON_REFRESH}</button>
        <span class="ov-sep"></span>
        <button type="button" class="ov-close" data-action="close" title="Close (Esc)" aria-label="Close panel">${ICON_CLOSE}</button>
      </div>
    </div>
    <div class="ov-banner" role="status">
      <span class="ov-banner-dot"></span>
      <span class="ov-banner-msg"></span>
      <button type="button" class="ov-banner-act">Reload tab</button>
    </div>
    <div class="ov-panel-body">
    <div class="ov-col ov-col-trade">
      <div class="ov-sec-head">
        <span class="ov-sec-title">Trade</span>
        <span class="ov-avail ov-zero">Available —</span>
      </div>
      <div class="ov-body">
        <div>
          <div class="ov-sec-label"><strong>Buy</strong><span>SOL from park</span></div>
          <div class="ov-grid ov-buy-grid" style="margin-top:8px"></div>
          <div class="ov-meta" style="margin-top:8px"><span>Capped to selected vault park</span></div>
        </div>
        <div>
          <div class="ov-sec-label"><strong>Sell</strong><span>This token</span></div>
          <div class="ov-grid ov-sell-grid" style="margin-top:8px"></div>
        </div>
      </div>
      <div class="ov-settings" aria-label="Trade settings">
        <div class="ov-set-row" data-set="slip">
          <div class="ov-set-lab">Slippage<span>max 3%</span></div>
          <div class="ov-chips">
            ${SLIPPAGE_OPTS.map((o) => `<button type="button" class="ov-chip" data-bps="${o.bps}">${o.label}</button>`).join("")}
          </div>
        </div>
        <div class="ov-set-row" data-set="gas">
          <div class="ov-set-lab">Gas fee<span>priority / CU</span></div>
          <div class="ov-chips">
            ${GAS_OPTS.map((o) => `<button type="button" class="ov-chip" data-micro="${o.micro}">${o.label}</button>`).join("")}
          </div>
        </div>
        <div class="ov-set-row" data-set="tip">
          <div class="ov-set-lab">Tip fee<span>max 0.001 SOL</span></div>
          <div class="ov-chips">
            ${TIP_OPTS.map((o) => `<button type="button" class="ov-chip" data-lamports="${o.lamports}">${o.label}</button>`).join("")}
          </div>
        </div>
        <div class="ov-set-hint">Caps keep network spend low so vault &amp; 1vault fee room stays intact.</div>
        <div class="ov-set-div"></div>
        <div class="ov-set-row" data-set="opacity">
          <div class="ov-set-lab">Panel opacity<span>solid on hover</span></div>
          <div class="ov-range-row">
            <input type="range" class="ov-range" min="${MIN_OPACITY_PCT}" max="100" step="5" value="100" aria-label="Panel opacity">
            <span class="ov-range-val">100%</span>
          </div>
        </div>
      </div>
      <div class="ov-status"></div>
      <div class="ov-foot">
        <div>Park<b class="ov-foot-bal">—</b></div>
        <div>Bought<b>—</b></div>
        <div>Sold<b>—</b></div>
        <div>PnL<b>—</b></div>
      </div>
    </div>
    <div class="ov-col ov-col-hold">
      <div class="ov-sec-head">
        <span class="ov-sec-title">Holding</span>
        <span class="ov-count"></span>
      </div>
      <div class="ov-hold-cols"><span>Token</span><span>Bought</span><span>UPnL</span><span>Bal</span></div>
      <div class="ov-hold-list"><div class="ov-empty">Select a vault…</div></div>
    </div>
    </div>
  `;

  const sellGrid = panel.querySelector(".ov-sell-grid")!;
  for (const pct of SELL_PCTS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ov-sell";
    b.dataset.pct = String(pct);
    b.textContent = `${pct}%`;
    b.title = `Sell ${pct}% of this position`;
    b.addEventListener("click", () => void runSell(pct));
    sellGrid.appendChild(b);
  }

  panel.querySelectorAll(".ov-vault-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = (btn as HTMLElement).dataset.menu;
      panel!.querySelectorAll(".ov-vault-menu").forEach((m) => {
        const el = m as HTMLElement;
        if (el.dataset.menu === key) el.classList.toggle("ov-show");
        else el.classList.remove("ov-show");
      });
    });
  });

  const closeBtn = panel.querySelector('[data-action="close"]');
  closeBtn?.addEventListener("click", () => setPanelOpen(false));
  closeBtn?.addEventListener("pointerdown", (e) => e.stopPropagation());

  const refreshBtn = panel.querySelector('[data-action="refresh"]') as HTMLElement | null;
  refreshBtn?.addEventListener("click", () => {
    refreshBtn.classList.remove("ov-spin");
    void refreshBtn.offsetWidth;
    refreshBtn.classList.add("ov-spin");
    window.setTimeout(() => refreshBtn.classList.remove("ov-spin"), 640);
    void refreshPositions();
    void refreshVaultPark();
  });

  panel.querySelector(".ov-banner-act")?.addEventListener("click", () => location.reload());
  panel.querySelector('[data-action="settings"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    const box = panel!.querySelector(".ov-settings");
    const open = box?.classList.toggle("ov-show");
    if (!open) panel!.classList.remove("ov-op-preview");
    renderTradeSettings();
  });
  panel.querySelectorAll('[data-set="slip"] .ov-chip').forEach((btn) => {
    btn.addEventListener("click", () => {
      tradeSettings.slippageBps = Number((btn as HTMLElement).dataset.bps) || 100;
      void saveTradeSettings();
    });
  });
  panel.querySelectorAll('[data-set="gas"] .ov-chip').forEach((btn) => {
    btn.addEventListener("click", () => {
      tradeSettings.gasMicro = Number((btn as HTMLElement).dataset.micro) || 150_000;
      void saveTradeSettings();
    });
  });
  panel.querySelectorAll('[data-set="tip"] .ov-chip').forEach((btn) => {
    btn.addEventListener("click", () => {
      tradeSettings.tipLamports = Number((btn as HTMLElement).dataset.lamports) || 0;
      void saveTradeSettings();
    });
  });

  const range = panel.querySelector(".ov-range") as HTMLInputElement | null;
  range?.addEventListener("input", () => {
    tradeSettings.opacityPct = clampOpacityPct(range.value);
    renderTradeSettings();
  });
  range?.addEventListener("change", () => void saveTradeSettings());
  /** Suspend the hover-restore while tuning, otherwise the slider has no visible effect. */
  range?.addEventListener("focus", () => panel!.classList.add("ov-op-preview"));
  range?.addEventListener("blur", () => panel!.classList.remove("ov-op-preview"));

  attachDrag(panel);
  root.appendChild(panel);
  renderBuyButtons();
  renderTradeSettings();
  return panel;
}

function setPanelOpen(open: boolean): void {
  if (open && !isSolTokenPage()) {
    open = false;
  }
  panelOpen = open;
  const panel = document.getElementById(PANEL_ID);
  const btn = document.getElementById(BTN_ID);
  if (panel) {
    panel.classList.toggle("ov-open", open);
    panel.classList.toggle("ov-hidden", !isSolTokenPage());
    if (open) restorePanelPosition(panel);
  }
  if (btn) btn.classList.toggle("ov-active", open);
  if (open) {
    renderTokenChip();
    void loadTradeSettings().then(() => renderTradeSettings());
    void loadVaults();
    startVaultSyncPoll();
  } else {
    stopVaultSyncPoll();
    closeVaultMenus();
    setBanner("");
    panel?.classList.remove("ov-op-preview");
    document.querySelector(`#${PANEL_ID} .ov-settings`)?.classList.remove("ov-show");
  }
}

function placeButtonLeftOfInstant(btn: HTMLElement): boolean {
  if (!isSolTokenPage()) return false;
  const host = findInstantTradeHost();
  if (!host?.parentElement) return false;
  if (btn.nextElementSibling === host && btn.parentElement === host.parentElement) {
    return true;
  }
  host.insertAdjacentElement("beforebegin", btn);
  btn.style.position = "";
  btn.style.right = "";
  btn.style.bottom = "";
  btn.style.left = "";
  btn.style.top = "";
  btn.style.zIndex = "";
  return true;
}

function syncTokenPageUi(): void {
  removeOldPill();
  const onToken = isSolTokenPage();
  const btn = document.getElementById(BTN_ID);
  const panel = document.getElementById(PANEL_ID);
  if (btn) {
    btn.classList.toggle("ov-hidden", !onToken);
    btn.style.display = onToken ? "" : "none";
  }
  if (panel) {
    panel.classList.toggle("ov-hidden", !onToken);
    if (!onToken) panel.classList.remove("ov-open");
  }
  if (!onToken && panelOpen) {
    panelOpen = false;
    btn?.classList.remove("ov-active");
    closeVaultMenus();
  }
}

function ensureToolbarButton(): void {
  removeOldPill();
  injectStyles();
  const root = ensureRoot();
  buildPanel(root);

  let btn = document.getElementById(BTN_ID) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.title = "1vault instant trade";
    const img = document.createElement("img");
    img.src = iconUrl();
    img.alt = "";
    btn.appendChild(img);
    btn.appendChild(document.createTextNode("1vault instant trade"));
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isSolTokenPage()) return;
      setPanelOpen(!panelOpen);
    });
  }

  if (isSolTokenPage()) {
    if (!placeButtonLeftOfInstant(btn)) {
      if (!btn.isConnected) {
        btn.style.position = "fixed";
        btn.style.right = "16px";
        btn.style.bottom = "88px";
        btn.style.zIndex = "2147483640";
        root.appendChild(btn);
      }
    }
  } else if (!btn.isConnected) {
    root.appendChild(btn);
  }

  syncTokenPageUi();
}

function onDocClick(e: MouseEvent): void {
  const t = e.target as Node | null;
  const panel = document.getElementById(PANEL_ID);
  if (!panel || !panelOpen) return;
  if (panel.contains(t) || (t instanceof Element && t.closest(`#${BTN_ID}`))) return;
  closeVaultMenus();
}

function hookSpaNavigation(): void {
  const wrap = (name: "pushState" | "replaceState") => {
    const orig = history[name].bind(history);
    history[name] = function (...args: Parameters<History["pushState"]>) {
      const ret = orig(...args);
      queueMicrotask(onRouteChange);
      return ret;
    };
  };
  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", onRouteChange);
}

function onRouteChange(): void {
  ensureToolbarButton();
  syncTokenPageUi();
  renderTokenChip();
  if (isSolTokenPage()) void loadVaults();
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== "Escape" || !panelOpen) return;
  const menuOpen = document.querySelector(`#${PANEL_ID} .ov-vault-menu.ov-show`);
  if (menuOpen) {
    closeVaultMenus();
    return;
  }
  setPanelOpen(false);
}

function boot(): void {
  if (document.documentElement.getAttribute(ATTR)) {
    ensureToolbarButton();
    return;
  }
  document.documentElement.setAttribute(ATTR, "1");
  ensureToolbarButton();
  document.addEventListener("click", onDocClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  hookSpaNavigation();
  if (isSolTokenPage()) void loadVaults();

  let obsTimer = 0;
  const obs = new MutationObserver(() => {
    if (obsTimer) return;
    obsTimer = window.setTimeout(() => {
      obsTimer = 0;
      removeOldPill();
      ensureToolbarButton();
      syncTokenPageUi();
    }, 200);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
