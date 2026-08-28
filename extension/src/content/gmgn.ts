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

type TradeSettings = {
  slippageBps: number;
  gasMicro: number;
  tipLamports: number;
};

const DEFAULT_TRADE_SETTINGS: TradeSettings = {
  slippageBps: 100,
  gasMicro: 150_000,
  tipLamports: 100_000,
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
  return { slippageBps: slip, gasMicro: gas, tipLamports: tip };
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

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    `#${ROOT_ID}{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif}`,
    `#${BTN_ID}{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;margin-right:8px;border:1px solid rgba(136,246,152,.45);border-radius:6px;background:rgba(20,40,28,.85);color:#88f698;font:600 12px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;white-space:nowrap;vertical-align:middle}`,
    `#${BTN_ID}:hover{border-color:rgba(136,246,152,.8);color:#b8ffc4;background:rgba(30,55,38,.95)}`,
    `#${BTN_ID} img{width:14px;height:14px;border-radius:3px;flex-shrink:0}`,
    `#${BTN_ID}.ov-active{background:rgba(40,80,50,.95);box-shadow:0 0 0 1px rgba(136,246,152,.35)}`,
    `#${BTN_ID}.ov-hidden{display:none!important}`,
    `#${OLD_PILL_ID}{display:none!important}`,
    `#${PANEL_ID}{position:fixed;left:auto;top:auto;right:12px;bottom:56px;z-index:2147483645;width:min(720px,calc(100vw - 24px));max-height:min(620px,calc(100vh - 72px));display:none;flex-direction:column;border:1px solid rgba(58,168,240,.28);border-radius:12px;overflow:hidden;color:#fff;box-shadow:0 16px 48px rgba(0,15,40,.55);background-color:#000;background-image:radial-gradient(90% 50% at 50% -10%,rgba(15,40,84,.85) 0%,transparent 55%),radial-gradient(60% 40% at 85% 0%,rgba(58,168,240,.28) 0%,transparent 52%),linear-gradient(165deg,#0b1a2e 0%,#0f2854 38%,#0a0b0d 100%)}`,
    `#${PANEL_ID}.ov-open{display:flex}`,
    `#${PANEL_ID}.ov-hidden{display:none!important}`,
    `#${PANEL_ID} *{box-sizing:border-box}`,
    `.ov-drag-bar{display:flex;align-items:center;justify-content:center;gap:8px;height:28px;flex-shrink:0;cursor:grab;user-select:none;touch-action:none;background:linear-gradient(180deg,rgba(15,40,84,.65),rgba(10,18,32,.55));border-bottom:1px solid rgba(58,168,240,.18);color:rgba(191,232,245,.55);font:600 10px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:.04em}`,
    `.ov-drag-bar:active{cursor:grabbing}`,
    `.ov-drag-bar::before{content:"";width:36px;height:4px;border-radius:999px;background:rgba(58,168,240,.35)}`,
    `.ov-panel-body{display:grid;grid-template-columns:minmax(260px,1fr) minmax(280px,1.15fr);flex:1;min-height:0;overflow:hidden}`,
    `@media (max-width:720px){.ov-panel-body{grid-template-columns:1fr;max-height:min(70vh,560px);overflow:auto}}`,
    `.ov-col{display:flex;flex-direction:column;min-height:0;min-width:0}`,
    `.ov-col-trade{border-right:1px solid rgba(58,168,240,.16);background:rgba(8,18,36,.42)}`,
    `.ov-col-hold{background:rgba(6,12,24,.38)}`,
    `.ov-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid rgba(58,168,240,.14);cursor:grab;user-select:none;touch-action:none;background:linear-gradient(180deg,rgba(15,40,84,.35),transparent)}`,
    `.ov-head:active{cursor:grabbing}`,
    `.ov-drag{cursor:inherit;flex:1;min-width:0}`,
    `.ov-head-left{display:flex;align-items:center;gap:6px;min-width:0}`,
    `.ov-title{font:700 13px/1.2 ui-sans-serif,system-ui,sans-serif;margin:0;pointer-events:none}`,
    `.ov-icon-btn{display:inline-flex;align-items:center;justify-content:center;gap:3px;height:26px;min-width:26px;max-width:140px;padding:0 7px;border:1px solid rgba(136,246,152,.35);border-radius:6px;background:transparent;color:#88f698;cursor:pointer;font:600 11px/1 ui-sans-serif,system-ui,sans-serif}`,
    `.ov-icon-btn:hover{border-color:rgba(136,246,152,.7)}`,
    `.ov-icon-btn.ov-ghost{border-color:rgba(255,255,255,.14);color:rgba(255,255,255,.65);max-width:none}`,
    `.ov-icon-btn.ov-gear{border-color:rgba(58,168,240,.4);color:#7fe4ff}`,
    `.ov-icon-btn.ov-gear.ov-on,.ov-icon-btn.ov-gear:hover{border-color:rgba(58,168,240,.75);background:rgba(58,168,240,.12)}`,
    `.ov-vault-btn .ov-vault-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}`,
    `.ov-vault-wrap{position:relative}`,
    `.ov-vault-menu{position:absolute;top:calc(100% + 4px);right:0;z-index:5;min-width:200px;max-height:220px;overflow:auto;padding:4px;border-radius:8px;border:1px solid rgba(58,168,240,.22);background:rgba(12,22,40,.98);box-shadow:0 10px 28px rgba(0,0,0,.5);display:none}`,
    `.ov-vault-menu.ov-show{display:block}`,
    `.ov-vault-item{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:#fff;text-align:left;cursor:pointer;font:500 12px/1.2 ui-sans-serif,system-ui,sans-serif}`,
    `.ov-vault-item:hover,.ov-vault-item.ov-sel{background:rgba(58,168,240,.14)}`,
    `.ov-vault-item span{color:rgba(255,255,255,.45);font-size:10px}`,
    `.ov-body{padding:10px;display:flex;flex-direction:column;gap:12px;overflow:auto}`,
    `.ov-sec-label{display:flex;align-items:center;justify-content:space-between;gap:8px;font:600 12px/1 ui-sans-serif,system-ui,sans-serif;color:rgba(255,255,255,.7)}`,
    `.ov-sec-label strong{color:#fff}`,
    `.ov-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}`,
    `.ov-buy{height:36px;border:1px solid rgba(136,246,152,.45);border-radius:6px;background:rgba(20,40,28,.6);color:#88f698;font:700 12px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}`,
    `.ov-buy:hover:not(:disabled){background:rgba(40,80,50,.85)}`,
    `.ov-sell{height:36px;border:1px solid rgba(255,90,120,.45);border-radius:6px;background:rgba(40,16,22,.55);color:#ff6b8a;font:700 13px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}`,
    `.ov-sell:hover:not(:disabled){background:rgba(70,24,34,.85)}`,
    `.ov-buy:disabled,.ov-sell:disabled,.ov-icon-btn:disabled{opacity:.4;cursor:not-allowed}`,
    `.ov-meta{display:flex;flex-wrap:wrap;gap:8px;font:500 10px/1 ui-sans-serif,system-ui,sans-serif;color:rgba(255,255,255,.4)}`,
    `.ov-meta .ov-avail,.ov-sec-label .ov-avail{color:#88f698;font-weight:600}`,
    `.ov-settings{display:none;padding:8px 10px 10px;border-top:1px solid rgba(58,168,240,.14);background:rgba(8,20,40,.55);gap:10px;flex-direction:column}`,
    `.ov-settings.ov-show{display:flex}`,
    `.ov-set-row{display:flex;flex-direction:column;gap:5px}`,
    `.ov-set-lab{display:flex;align-items:center;justify-content:space-between;font:600 10px/1 ui-sans-serif,system-ui,sans-serif;color:rgba(191,232,245,.75);letter-spacing:.04em;text-transform:uppercase}`,
    `.ov-set-lab span{color:rgba(255,255,255,.35);font-weight:500;text-transform:none;letter-spacing:0}`,
    `.ov-chips{display:flex;flex-wrap:wrap;gap:4px}`,
    `.ov-chip{height:26px;padding:0 8px;border:1px solid rgba(58,168,240,.28);border-radius:6px;background:rgba(15,40,84,.35);color:rgba(255,255,255,.75);font:600 11px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer}`,
    `.ov-chip:hover{border-color:rgba(58,168,240,.55);color:#fff}`,
    `.ov-chip.ov-on{border-color:rgba(58,168,240,.85);background:rgba(58,168,240,.22);color:#7fe4ff}`,
    `.ov-set-hint{font:500 10px/1.35 ui-sans-serif,system-ui,sans-serif;color:rgba(255,255,255,.38)}`,
    `.ov-foot{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;padding:8px 10px;border-top:1px solid rgba(58,168,240,.14);font:500 10px/1.2 ui-sans-serif,system-ui,sans-serif;color:rgba(255,255,255,.4);background:rgba(6,14,28,.45)}`,
    `.ov-foot b{display:block;color:rgba(255,255,255,.75);font-weight:600;margin-top:2px}`,
    `.ov-status{padding:0 10px 8px;font:500 11px/1.3 ui-sans-serif,system-ui,sans-serif;color:rgba(255,255,255,.55);min-height:16px}`,
    `.ov-status.ov-err{color:#ff6b8a}`,
    `.ov-status.ov-ok{color:#88f698}`,
    `.ov-hold-cols{display:grid;grid-template-columns:minmax(0,1.4fr) .7fr .95fr .55fr;gap:6px;padding:6px 10px;font:600 10px/1 ui-sans-serif,system-ui,sans-serif;color:rgba(255,255,255,.35);border-bottom:1px solid rgba(58,168,240,.1)}`,
    `.ov-hold-list{overflow:auto;flex:1;min-height:0}`,
    `.ov-hold-row{display:grid;grid-template-columns:minmax(0,1.4fr) .7fr .95fr .55fr;gap:6px;align-items:center;padding:10px;border-bottom:1px solid rgba(58,168,240,.08)}`,
    `.ov-token{display:flex;align-items:center;gap:8px;min-width:0}`,
    `.ov-av{width:26px;height:26px;border-radius:50%;flex-shrink:0;display:grid;place-items:center;font:700 9px/1 ui-sans-serif,system-ui,sans-serif;color:#fff;background:linear-gradient(145deg,#1c4d8d,#3aa8f0)}`,
    `.ov-token-name{font:600 12px/1.2 ui-sans-serif,system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`,
    `.ov-token-sub{display:flex;align-items:center;gap:4px;margin-top:2px;font:500 10px/1 ui-sans-serif,system-ui,sans-serif;color:rgba(255,255,255,.4)}`,
    `.ov-num{font:600 11px/1.2 ui-sans-serif,system-ui,sans-serif;color:rgba(255,255,255,.85)}`,
    `.ov-down{color:#ff6b8a}`,
    `.ov-up{color:#88f698}`,
    `.ov-empty{padding:24px 12px;text-align:center;font:500 12px/1.4 ui-sans-serif,system-ui,sans-serif;color:rgba(255,255,255,.4)}`,
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
  const grid = document.querySelector(`#${PANEL_ID} .ov-buy-grid`);
  const availEl = document.querySelector(`#${PANEL_ID} .ov-avail`);
  if (availEl) {
    availEl.textContent =
      vaultParkLamports > 0n
        ? `Available ${formatSolAmt(vaultMaxSol())} SOL`
        : "Available 0 SOL";
  }
  if (!grid) return;
  grid.innerHTML = "";
  const amounts = buyAmountsForVault();
  if (amounts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ov-empty";
    empty.style.padding = "8px";
    empty.style.gridColumn = "1 / -1";
    empty.textContent = "No park SOL in this vault — park first.";
    grid.appendChild(empty);
    return;
  }
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
    setStatus(msg, "err");
    vaults = [];
    selectedVault = null;
    vaultParkLamports = 0n;
    hasTradeableVaults = false;
    syncTokenPageUi();
    renderVaultMenus();
    renderBuyButtons();
    if (holdList) {
      holdList.innerHTML = `<div class="ov-empty ov-down">${escapeHtml(msg)}</div>`;
    }
  }
}

async function refreshPositions(): Promise<void> {
  const list = document.querySelector(`#${PANEL_ID} .ov-hold-list`);
  if (!list) return;
  if (!selectedVault) {
    list.innerHTML = `<div class="ov-empty">Select a vault to load holdings.</div>`;
    positions = [];
    return;
  }
  list.innerHTML = `<div class="ov-empty">Loading…</div>`;
  try {
    const data = await bg<{ positions?: PosRow[] }>({
      type: "VAULT_POSITIONS",
      vault: selectedVault.pubkey,
    });
    positions = data.positions ?? [];
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
      const pnlClass = pct == null ? "" : pct < 0 ? "ov-down" : pct > 0 ? "ov-up" : "";
      const pnlText = pct == null ? "—" : `${pct < 0 ? "" : "+"}${pct.toFixed(1)}%`;
      row.innerHTML = [
        `<div class="ov-token"><div class="ov-av">${escapeHtml(ticker.slice(0, 2))}</div>`,
        `<div><div class="ov-token-name" title="${escapeHtml(mint)}">${escapeHtml(ticker)}</div>`,
        `<div class="ov-token-sub"><span class="ov-icon-btn" style="height:18px;min-width:18px;padding:0 4px;pointer-events:none">#${vaultBadgeLabel(selectedVault)}</span></div></div></div>`,
        `<div class="ov-num">${escapeHtml(lamportsToSol(entry, 2))} SOL</div>`,
        `<div class="ov-num ${pnlClass}">${escapeHtml(pnlText)}</div>`,
        `<div class="ov-num">${escapeHtml(lamportsToSol(cur, 3))}</div>`,
      ].join("");
      list.appendChild(row);
    }
  } catch (e) {
    list.innerHTML = `<div class="ov-empty ov-down">${escapeHtml(e instanceof Error ? e.message : String(e))}</div>`;
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
    setStatus(e instanceof Error ? e.message : String(e), "err");
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
    setStatus(e instanceof Error ? e.message : String(e), "err");
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
    if (t?.closest("button,a,input,.ov-vault-menu,.ov-buy,.ov-sell,.ov-body,.ov-hold-list,.ov-hold-cols,.ov-foot,.ov-status,.ov-settings,.ov-chip")) {
      return;
    }
    if (!t?.closest(".ov-drag-bar,.ov-head")) return;
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

  panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="ov-drag-bar" title="Drag to move panel">Drag to move</div>
    <div class="ov-panel-body">
    <div class="ov-col ov-col-trade">
      <div class="ov-head">
        <div class="ov-head-left ov-drag">
          <span class="ov-title">1vault instant trade</span>
        </div>
        <div class="ov-head-left">
          <button type="button" class="ov-icon-btn ov-gear" data-action="settings" title="Slippage, gas & tip">⚙</button>
          <div class="ov-vault-wrap">
            <button type="button" class="ov-icon-btn ov-vault-btn" title="Select vault for entry" data-menu="trade">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span class="ov-vault-n">1</span>
            </button>
            <div class="ov-vault-menu" data-menu="trade"></div>
          </div>
          <button type="button" class="ov-icon-btn ov-ghost" data-action="close" title="Close">✕</button>
        </div>
      </div>
      <div class="ov-body">
        <div>
          <div class="ov-sec-label"><strong>Buy</strong><span class="ov-avail">Available —</span></div>
          <div class="ov-grid ov-buy-grid" style="margin-top:8px"></div>
          <div class="ov-meta" style="margin-top:8px"><span>Capped to selected vault park</span></div>
        </div>
        <div>
          <div class="ov-sec-label"><strong>Sell %</strong><span>This token</span></div>
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
      <div class="ov-head">
        <div class="ov-drag"><span class="ov-title">Holding</span></div>
        <div class="ov-head-left">
          <div class="ov-vault-wrap">
            <button type="button" class="ov-icon-btn ov-vault-btn" title="Select vault" data-menu="hold">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span class="ov-vault-n">1</span>
            </button>
            <div class="ov-vault-menu" data-menu="hold"></div>
          </div>
          <button type="button" class="ov-icon-btn ov-ghost" data-action="refresh" title="Refresh">↻</button>
        </div>
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
    b.textContent = `${pct}%`;
    b.title = `Sell ${pct}%`;
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

  panel.querySelector('[data-action="close"]')?.addEventListener("click", () => setPanelOpen(false));
  panel.querySelector('[data-action="refresh"]')?.addEventListener("click", () => {
    void refreshPositions();
    void refreshVaultPark();
  });
  panel.querySelector('[data-action="settings"]')?.addEventListener("click", (e) => {
    e.stopPropagation();
    const box = panel!.querySelector(".ov-settings");
    box?.classList.toggle("ov-show");
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
    void loadTradeSettings().then(() => renderTradeSettings());
    void loadVaults();
    startVaultSyncPoll();
  } else {
    stopVaultSyncPoll();
    closeVaultMenus();
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
  if (isSolTokenPage()) void loadVaults();
}

function boot(): void {
  if (document.documentElement.getAttribute(ATTR)) {
    ensureToolbarButton();
    return;
  }
  document.documentElement.setAttribute(ATTR, "1");
  ensureToolbarButton();
  document.addEventListener("click", onDocClick, true);
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
