# 1Vault simulator v2

n8n-style workflow canvas for **Devnet demos**. All on-chain steps go through the **Go backend** (`POST /v1/flows`). The browser signs transactions locally (private key or Phantom/Solflare).

**Full API + UI contract:** [backend/docs/FRONTEND_GUIDE.md](../backend/docs/FRONTEND_GUIDE.md)

## Run

```bash
# Terminal 1 — backend (rebuild after backend changes)
cd backend && go build -o bin/1vault-api ./cmd/api && ./bin/1vault-api

# Terminal 2 — indexer (recommended for vault list / ingest)
cd ProgramID/onevault-indexer && npm run api && npm run dev

# Terminal 3 — simulator v2 UI
cd simulator-v2
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:5174](http://localhost:5174) (port **5174** — original simulator uses 5173).

Vite proxies `/v1/*` → `VITE_BACKEND_URL` (default `http://127.0.0.1:3090`).

## vs original `simulator/`

| | `simulator/` | `simulator-v2/` |
|---|---|---|
| API | Local Express :8788 + direct RPC | Go backend :3090 `/v1/flows` |
| Signing | Server holds keys | Browser signs (secret or Phantom/Solflare) |
| CLI key (`~/.config/solana/id.json`) | Supported | **Not supported** — paste JSON/base58 secret |
| Vault type | — | **Pooled / Sliced** on degen node |
| Licence panel | — | **1vault Licence** on licence node |
| Withdraw | Single vault | **All vaults** with on-chain shares |
| Open position | Creates mint on-chain | Demo mint + allowlist via backend |

---

## Workflow canvas (nodes)

```
Degen → Licence → Create vault → … → Execute trade
Retail → Settings → Deposit → Auto-follow → …
Protocol (bottom) — program + licence mint
```

| Node | Purpose |
|------|---------|
| **Degen wallet** | Strategist signer. **Vault type** dropdown (`pooled` \| `sliced`) for next Create vault. Park SOL amount. |
| **1vault Licence** | Shows token name, **1M 1VL** lock, mint, status, PDA addresses. Updates when degen wallet connects. |
| **Create vault** | Runs `register_strategist` → `lock_license` → `create_vault`. **Close vault** button. |
| **Retail / Settings** | Park amount, TP/SL, copy %. **Unwithdrawn vaults** list + **Withdraw all**. |
| **Deposit** | Park SOL into active vault. |
| **Withdraw to wallet** | Redeems shares → native SOL (retail signs). |
| **Protocol** | `GET /v1/protocol` — program id, licence mint, lock amount. |

Top bar chip: `vault #N · pooled|sliced` after create.

---

## Header actions

| Button | `SimMode` | Backend `mode` | Signers |
|--------|-----------|----------------|---------|
| Create vault | `create-vault` | `create-vault` | Degen + retail (park steps) |
| Deposit | `deposit` | `deposit` | Retail |
| Open position | `open-position` | `open-position` | Degen |
| Withdraw | `withdraw-wallet` | `withdraw` (per vault) | Retail only |
| Close vault | `close-vault` | `close-vault` | Degen (on vault node) |

---

## Vault type (pooled / sliced)

- Set on **Degen wallet** node before **Create vault**.
- Locked only while a workflow is **running** (not when an old vault exists in session).
- Backend always allocates a **new** `vaultId` on create (on-chain PDA scan + indexer).
- On-chain: `pooled=0`, `sliced=1` + management fee bps (sliced demo: 10%).

```json
POST /v1/flows?cluster=devnet
{
  "mode": "create-vault",
  "strategist": "...",
  "vaultId": 36,
  "vaultType": "sliced",
  "name": "Sliced Demo 36",
  ...
}
```

---

## 1vault Licence (1VL)

| UI | Source |
|----|--------|
| Lock amount | `GET /v1/protocol` → `licenseLockAmount` (display as `1,000,000 1VL`) |
| Mint | `licenseMint` |
| Status | `POST /v1/tx/resolve-accounts` + RPC `getAccountInfo` on licence PDAs |
| Locked in vault | After `create_vault` — `1M 1VL` in vault `vault_license` PDA |

Flow steps on **Licence** node: `register_strategist`, `lock_license`. Actual 1VL transfer happens on **Create vault**.

---

## Session state

| Item | Where |
|------|-------|
| Active vault | `sessionStorage` key `1v-vault` — `{ vaultId, vault, vaultTokenAccount?, vaultType? }` |
| Private keys | Memory only in tab — never sent to backend raw |

Clear degen/retail wallets does not clear active vault; create vault always uses a fresh id.

---

## Withdraw to wallet

Redeems parked vault SOL to **retail** as **native SOL** (free withdraw on MVP program).

### Prerequisites

1. Backend rebuilt and running (`:3090`)
2. **Retail** wallet connected — must be the wallet that **parked**
3. ~0.01 SOL for fees
4. Vault has **liquid wSOL** (not locked in open position)

### UI flow

1. Connect **retail** wallet
2. **Unwithdrawn vaults** panel shows **Ready** vs **Blocked**
3. **Withdraw all (N)** or header **Withdraw**
4. Sign **one tx per vault** in Phantom/Solflare

Degen **not required**. Scans **all** vaults with on-chain shares — not only session `activeVault`.

### Backend bundle (per vault)

1. `update_nav` → wSOL ATA → share ATA → optional `create_investor_config` → `withdraw` → close wSOL ATA

**Withdraw accounts (9):** investor, protocol_config, vault, investor_share_account, investor_token_account, vault_token_account, share_mint, **investor_config**, token_program.

### Code references

| File | Role |
|------|------|
| `src/shares.ts` | `fetchWithdrawHoldings`, redeemable vs blocked |
| `src/backend-flow.ts` | Multi-vault loop, `withdraw-summary` event |
| `src/workflow/nodes/SettingsNode.tsx` | Unwithdrawn vaults UI |
| `src/license.ts` | Licence preview / PDA status |

### API (direct)

```json
POST /v1/flows?cluster=devnet
{
  "mode": "withdraw",
  "strategist": "<strategist pubkey>",
  "vault": "<vault pubkey>",
  "investors": [
    { "pubkey": "<retail pubkey>", "role": "investors", "shares": 110000000 }
  ]
}
```

Or `POST /v1/tx/withdraw` — see [backend/README.md](../backend/README.md#withdraw-redeem-shares--native-sol).

### Common errors

| Error | Meaning |
|-------|---------|
| `No on-chain vault shares` | Wrong wallet or never parked |
| `InsufficientLiquidity` | SOL in position — close position first |
| `AccountOwnedByWrongProgram` on `investor_config` | Old backend binary — rebuild API |

---

## Connect X (Twitter)

Sign in with X to create a backend user (`users.twitter_id` stored in Postgres).

1. Click **Connect X** in the top bar
2. Authorize on Twitter (OAuth 2.0 PKCE via backend)
3. Redirect back to `/auth/callback` → session saved in `localStorage`
4. Top bar shows `@handle` and **Disconnect X**

When X is connected, importing degen/retail wallets **auto-binds** the pubkey to your user (`user_wallets` table) via signed nonce.

### Backend requirements

```env
# backend/.env
TWITTER_CLIENT_ID=...
TWITTER_CLIENT_SECRET=...
TWITTER_CALLBACK_URL=http://localhost:3090/v1/auth/twitter/callback
CORS_ORIGINS=...,http://localhost:5174
```

Register callback URL in [Twitter Developer Portal](https://developer.twitter.com/) as the backend callback (not the Vite port).

### API

```http
GET /v1/auth/twitter/start?returnTo=http://localhost:5174/auth/callback
GET /v1/auth/me          Authorization: Bearer <accessToken>
POST /v1/wallets/bind    (optional — link Solana wallet)
```

See [backend/docs/FRONTEND_GUIDE.md](../backend/docs/FRONTEND_GUIDE.md) §3.

---

## Environment (`.env`)

| Variable | Default |
|----------|---------|
| `VITE_BACKEND_URL` | `http://127.0.0.1:3090` |
| `VITE_CLUSTER` | `devnet` |
| `VITE_SOLANA_RPC` | `https://api.devnet.solana.com` |

### Railway / static host

Vite’s `/v1` proxy only works in **dev**. Production builds call the backend via `VITE_BACKEND_URL`.

1. Simulator service — **build** variable:  
   `VITE_BACKEND_URL=https://<your-go-backend>.up.railway.app`
2. Backend service — include the simulator origin:  
   `CORS_ORIGINS=https://<your-simulator>.up.railway.app,...`
3. Redeploy simulator after changing `VITE_*` (they are baked in at build time).

If you see `Unexpected token '<'` / HTML instead of JSON, `VITE_BACKEND_URL` is missing or wrong.

---

## Shared types

`shared/events.ts` — `SimMode`, `VaultType`, `RetailSettings`, `ProtocolInfo`, `NodeUpdate`, workflow node ids.

---

## Docs index

- [backend/docs/FRONTEND_GUIDE.md](../backend/docs/FRONTEND_GUIDE.md) — **start here** for production frontend
- [backend/docs/openapi.yaml](../backend/docs/openapi.yaml) — Swagger
- [backend/README.md](../backend/README.md) — API runbook
- [backend/docs/idl.json](../backend/docs/idl.json) — instruction layouts
