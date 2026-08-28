import { defineManifest } from "@crxjs/vite-plugin";

/**
 * Hardcoded hosts (no runtime URL setup).
 * Backend: Railway production. Indexer :3001 optional for local pipeline ledger.
 */
export default defineManifest({
  manifest_version: 3,
  name: "1vaults",
  description: "Park. They trade. You ride. Degen vault dashboard + capital pipeline.",
  version: "0.1.0",
  icons: {
    "16": "public/icons/icon16.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png",
  },
  action: {
    default_title: "1vaults",
    default_icon: {
      "16": "public/icons/icon16.png",
      "48": "public/icons/icon48.png",
    },
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  permissions: ["storage", "alarms", "notifications", "sidePanel", "identity"],
  host_permissions: [
    "https://awake-enchantment-production-ea29.up.railway.app/*",
    "http://127.0.0.1:3090/*",
    "http://localhost:3090/*",
    "http://127.0.0.1:3001/*",
    "http://localhost:3001/*",
    "https://api.devnet.solana.com/*",
    "https://quote-api.jup.ag/*",
    "https://api.jup.ag/*",
    "https://gmgn.ai/*",
  ],
  content_scripts: [
    {
      matches: ["https://gmgn.ai/*", "https://*.gmgn.ai/*"],
      js: ["src/content/gmgn.ts"],
      run_at: "document_idle",
    },
  ],
  web_accessible_resources: [
    {
      resources: ["public/icons/*", "icons/*"],
      matches: ["https://gmgn.ai/*", "https://*.gmgn.ai/*"],
    },
  ],
});
