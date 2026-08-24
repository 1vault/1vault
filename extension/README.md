# 1Vault Degen Chrome Extension

MV3 extension for **degen / strategist** wallets. Talks to the existing Go backend (`:3090`) and indexer (`:3001`) — **no backend code changes**.

Brand `#093C5D`. UI English. Verbs: park / sign / ride / close.

## What ships

### P0 — Foundation
- Scaffold (Vite + React 19 + `@crxjs/vite-plugin`)
- Encrypted keyring (AES-GCM + PBKDF2) in `chrome.storage.local`
- Wire signing (`signWirePartial`) ported from `simulator-v2`
- Typed `/v1` client + hand-written wrappers for undocumented routes (`refresh` / `retry` / `update-vault-risk`)
- Indexer client for vault-scoped deposit intents + mandates
- Pipeline estimate math (`committed` / `incoming` / `mandated` / `projected`)
- Side panel wallet UX (frontend ink + cyan accent)
- GMGN content-script stub (pill in P4)

### P1 — Read + watcher
- Pipeline auto-refresh every 20s for active vault
- Positions tab via `GET /v1/vaults/{pk}/positions`

### P2 — Flow runner
- `lib/flow/runner.ts` — create-vault, deposit (park), open-position (devnet demo mint), claim-fees, close-vault
- Background `RUN_FLOW` / `FLOW_STATE` message bus
- Activity tab streams step events + signatures
- Hero + quick actions wired to flows

### P3 — Trade + exit
- `exit-position` flow (sell → execute_trade → exit_position → update_nav)
- Trade tab: due diligence (`/v1/tokens/{mint}/research`), open positions list, per-position Exit
- Positions parsing fixed (`vault` array + trade id resolution)

### P4 — GMGN pill (initial)
- Floating **1Vault · Trade** pill on `gmgn.ai` token pages
- Opens side panel → Trade tab, prefills mint from URL

## Run

```bash
# Terminal 1 — Go backend
cd backend && go run ./cmd/api

# Terminal 2 — indexer (for pipeline ledger reads)
cd ProgramID/onevault-indexer && npm run api

# Terminal 3 — extension
cd extension
npm install
npm run gen:api   # regenerates src/lib/api/schema.d.ts from openapi.yaml
npm run dev       # or: npm run build → load dist/ in chrome://extensions
```

Load unpacked:

1. Open `chrome://extensions`
2. Enable Developer mode
3. **Load unpacked** → select `extension/dist` (after `npm run build`) or the CRXJS dev output shown in the terminal

## Hardcoded hosts

| Host | Purpose |
|------|---------|
| [Production API](https://awake-enchantment-production-ea29.up.railway.app/v1/docs) | Go `/v1` API (default) |
| `http://127.0.0.1:3001` | Indexer ledger (`?vault=`) for capital pipeline — optional local |
| `https://api.devnet.solana.com` | RPC |
| Jupiter / gmgn.ai | Later phases |

No runtime base-URL setup screen. Swagger: `https://awake-enchantment-production-ea29.up.railway.app/v1/docs`

## X (Twitter) login

- **Connect X** in the side panel header → backend OAuth (`/v1/auth/twitter/start`)
- Profile header shows X avatar, display name, and **Strategist** / **Investor** (from bound wallet role)
- **Logout** clears encrypted keyring, auth tokens, and session state

On Railway backend, add the extension OAuth redirect origin to `CORS_ORIGINS`:

```text
https://<extension-id>.chromiumapp.org
```

Extension id: `chrome://extensions` → 1vaults → ID (unpacked builds get a stable id per folder).

## Intentionally unused

- `/v1/ledger/*` and `POST /v1/tx/park` — need Bearer; use indexer + `park-guest` instead
- X.com content script — needs social lookup APIs

## Layout

```
extension/src/
  background/     service worker + message bus
  popup/          My Vaults
  sidepanel/      8-tab shell (Vault live)
  content/gmgn.ts stub
  lib/
    api/          openapi client + undocumented.ts
    indexer/      :3001 ledger
    keyring.ts
    auth/           X OAuth + session storage
    signing.ts
    estimate.ts
    flow/           async flow runner (P2)
```
