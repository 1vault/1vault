/**
 * GMGN Vault Strategist pill (P4). Injects a 1Vault button on token pages.
 */
const ATTR = "data-1vault-gmgn";
const PILL_ID = "onevault-gmgn-pill";
const STYLE_ID = "onevault-gmgn-style";

const GMGN_TOKEN_RE = /\/sol\/token\/([1-9A-HJ-NP-Za-km-z]{32,44})/;

function extractMint(): string | null {
  const m = location.pathname.match(GMGN_TOKEN_RE);
  return m?.[1] ?? null;
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  // Single-line CSS string: multi-line template literals confuse the content-script
  // bundle and can leave the IIFE unclosed when a sourcemap comment is appended.
  style.textContent =
    `#${PILL_ID}{position:fixed;right:16px;bottom:88px;z-index:2147483640;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 14px;border:1px solid rgba(58,168,240,.35);border-radius:999px;background:linear-gradient(120deg,#0b1a2e,#0f2854);color:#7fe4ff;font:600 12px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.45)}` +
    `#${PILL_ID}:hover{border-color:rgba(127,228,255,.55);color:#fff}` +
    `#${PILL_ID}::before{content:"";width:8px;height:8px;border-radius:50%;background:#3aa8f0;box-shadow:0 0 8px rgba(58,168,240,.6)}`;
  document.head.appendChild(style);
}

function ensurePill(): void {
  if (document.documentElement.getAttribute(ATTR)) return;
  document.documentElement.setAttribute(ATTR, "1");
  injectStyles();

  let pill = document.getElementById(PILL_ID);
  if (!pill) {
    const btn = document.createElement("button");
    btn.id = PILL_ID;
    btn.type = "button";
    btn.title = "Open 1vaults side panel";
    btn.addEventListener("click", () => {
      const mint = extractMint();
      void chrome.storage.session.set({
        tradeMint: mint ?? "",
        openTradeTab: true,
      });
      void chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
    });
    document.body.appendChild(btn);
    pill = btn;
  }

  const mint = extractMint();
  pill.textContent = mint ? "1vaults · Trade" : "1vaults";
}

function boot(): void {
  ensurePill();
  const obs = new MutationObserver(() => ensurePill());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", ensurePill);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
