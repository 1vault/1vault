# 1Vault — Frontend integration guide

Canonical reference for **production Next.js** (`frontend/`), **simulator v2** (`simulator-v2/`), and any wallet client that talks to the Go backend.

**Also read**

| Doc | Purpose |
|-----|---------|
| [backend/README.md](../README.md) | Run API, smoke test, tx prep examples |
| [backend/docs/openapi.yaml](./openapi.yaml) | Swagger at `http://localhost:3090/v1/docs` |
| [simulator-v2/README.md](../../simulator-v2/README.md) | Canvas UI, buttons, session state |
| [ProgramID/onevault-program/docs/FRONTEND_BACKEND_INTEGRATION.md](../../ProgramID/onevault-program/docs/FRONTEND_BACKEND_INTEGRATION.md) | Direct Anchor / PDA usage (bypass backend) |
| [backend/docs/idl.json](./idl.json) | Instruction account lists (e.g. `withdraw`) |

---

## 1. Mental model

```
Browser wallet  →  sign unsigned tx  →  POST /v1/tx/submit
                ↘  POST /v1/flows     →  poll → sign each step → submit
Backend         →  builds instructions + blockhash (never holds user secrets)
Indexer + DB    →  vault list, holdings cache (optional for tx prep)
Solana RPC      →  source of truth for shares, balances, account existence
```

- **Strategist** (product: `strategies`, UI: *degen*) — creates vaults, trades, closes vault.
- **Investor** (product: `investors`, UI: *retail*) — parks SOL, auto-follows, withdraws shares.
- **Vault pubkey** — program PDA (`walletKind=pda`), not an EOA wallet.

---

## 2. Cluster & API envelope

Every request:

```http
GET /v1/protocol?cluster=devnet
X-1Vault-Cluster: devnet   # optional header instead of query
```

Success:

```json
{ "success": true, "data": { ... }, "meta": { "cluster": "devnet" } }
```

Error:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

**Roles on write:** prefer `strategies` / `investors`. Legacy `degen` / `retail` still accepted.

---

## 3. Connect X (Twitter OAuth)

Backend stores each X account in Postgres `users.twitter_id` (unique). Session uses JWT + refresh token.

### Flow

1. `GET /v1/auth/twitter/start?returnTo=<app>/auth/callback` → `{ url }`
2. Redirect user to `url` (Twitter OAuth 2.0 + PKCE)
3. Twitter → `GET /v1/auth/twitter/callback?code=…&state=…` (backend)
4. Backend: exchange code → `GET twitter.com/2/users/me` → upsert `users` → issue tokens
5. Redirect to `{returnTo}#accessToken=…&refreshToken=…`
6. Client saves tokens, calls `GET /v1/auth/me` (Bearer)

### Database tables (`migrations/001_auth.sql`)

| Table | Purpose |
|-------|---------|
| `users` | `twitter_id`, `handle`, `display_name`, `avatar_url` |
| `refresh_tokens` | Hashed refresh sessions |
| `auth_states` | PKCE `state`, `code_verifier`, optional `return_to` (migration 004) |
| `user_wallets` | Solana pubkeys bound to user (`role_preference`) |
| `wallet_nonces` | Sign-in-with-Solana bind messages |

### Link Solana wallet (optional)

After X login:

1. `GET /v1/wallets/nonce?pubkey=…` (Bearer)
2. User signs `message` with wallet (`signMessage`)
3. `POST /v1/wallets/bind` — `{ pubkey, nonce, signature, rolePreference: strategies|investors }`

**simulator-v2** auto-binds degen/retail wallet after import when X session exists.

### Backend env

```env
TWITTER_CLIENT_ID=
TWITTER_CLIENT_SECRET=
TWITTER_CALLBACK_URL=http://localhost:3090/v1/auth/twitter/callback
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:5174
FRONTEND_URL=http://localhost:3000
```

`returnTo` origin must match `CORS_ORIGINS` or `FRONTEND_URL`.

### simulator-v2 UI

- Top bar **Connect X** → OAuth → `/auth/callback` → home with `@handle` chip
- Tokens in `localStorage` (`1v-access-token`, `1v-refresh-token`)
- Code: `simulator-v2/src/auth.ts`, `AuthCallback.tsx`

---

## 4. Protocol & 1vault Licence (1VL)

### `GET /v1/protocol`

| Field | Meaning |
|-------|---------|
| `programId` | On-chain program |
| `protocolConfig` | Protocol config PDA |
| `licenseMint` | 1VL SPL mint (6 decimals) |
| `licenseLockAmount` | Raw token units locked **per vault** on `create_vault` (default `1000000` = 1M 1VL) |
| `strategiesFeeWallet` | Performance fee destination |
| `wsolMint` | Base mint (wSOL) |

Display name: **1vault Licence** (`1VL`). UI may show `licenseLockAmount` as `1,000,000 1VL`.

### Licence lifecycle (strategist)

| Step | Instruction | When | Signer |
|------|-------------|------|--------|
| 1 | `register_strategist` | First time strategist uses protocol | strategist |
| 2 | `lock_license` | Activates licence **record** (no 1VL move yet on MVP) | strategist |
| 3 | `create_vault` | Locks **1M 1VL** into vault's `vault_license` PDA | strategist + ephemeral `vaultTokenAccount` |
| 4 | `unlock_license` | After `close_vault` wind-down | strategist |

**Derive PDAs:** `POST /v1/tx/resolve-accounts` with `{ "strategist": "<pubkey>" }` returns:

- `strategistAccount`, `license`, `licenseVault`, `licenseMint`, `strategistLicenseAta`

**On-chain status (frontend):** `getAccountInfo` on `strategistAccount` / `license` PDAs — see `simulator-v2/src/license.ts`.

### Prepared tx `accounts` (licence steps)

| Step | Typical `accounts` keys |
|------|-------------------------|
| `register_strategist` | `strategistAccount`, `licenseMint` |
| `lock_license` | `strategistAccount`, `license`, `licenseVault`, `licenseMint`, `strategistLicenseAta` |
| `create_vault` | `vault`, `vaultId`, `vaultTokenAccount`, `vaultType`, `licenseLocked` (`"<amount> 1VL"`), … |

---

## 5. Vault types (`pooled` | `sliced`)

Product classification + on-chain **book mode**:

| `vaultType` | Label | On-chain | Management fee (demo) |
|-------------|-------|----------|------------------------|
| `pooled` | Pooled Vault | mode `0`, param `0` | — |
| `sliced` | Sliced Vault | mode `1`, param bps | default **1000** bps (10%) |

**API**

- List filter: `GET /v1/vaults?vaultType=pooled|sliced`
- Responses: `vaultType`, `vaultTypeLabel`, `vaultTypeMeaning`
- Create: `vaultType` on `POST /v1/tx/create-vault` or `POST /v1/flows` `mode=create-vault`
- Default for existing/indexed vaults: `pooled`

**simulator-v2:** Degen node → **Vault type** dropdown before **Create vault**. Choice applies to the **next** create (new `vaultId`). Not locked when a previous vault exists in session — only while a workflow is `running`.

---

## 6. Flow modes (`POST /v1/flows`)

| `mode` | Who signs | Planner steps (summary) |
|--------|-----------|-------------------------|
| `create-vault` | strategist + investors | `register_strategist` → `lock_license` → `create_vault` → per investor: config, follow, optional `park` |
| `deposit` | investors | `create_investor_config` → `update_investor_config` → `park` |
| `configure-follow` | investors | config + `follow_on` / `follow_off` |
| `withdraw` | investor[0] only | **single** `withdraw` (bundled tx) |
| `open-position` | strategist | trade request/execute → open → fees → close demo position → claim → `update_nav` |
| `exit-position` | strategist | sell path + `exit_position` + `update_nav` |
| `claim-fees` | strategist | `accrue_fees` → `claim_fees` |
| `close-vault` | strategist | `initiate_close` → `close_vault` → `unlock_license` |

**Async pattern**

1. `POST /v1/flows?cluster=devnet` → `{ id, status, steps }`
2. Poll `GET /v1/flows/{id}` until `awaiting_signature`
3. `POST /v1/flows/{id}/refresh` (fresh blockhash) → sign `prepared.transaction`
4. `POST /v1/flows/{id}/submit` with `{ signedTransaction }`
5. Repeat until `status: completed`

Skipped steps: if account already exists (e.g. strategist registered), planner marks step `skipped`.

### `create-vault` body example

```json
{
  "mode": "create-vault",
  "strategist": "<strategist pubkey>",
  "vaultId": 12,
  "vaultTokenAccount": "<fresh keypair pubkey>",
  "name": "Pooled Demo 12",
  "vaultType": "pooled",
  "investors": [
    { "pubkey": "<strategist>", "role": "strategies", "lamports": 100000000 },
    { "pubkey": "<investor>", "role": "investors", "lamports": 100000000, "takeProfitBps": 2000, "stopLossBps": 500 }
  ]
}
```

`vaultTokenAccount`: generate new keypair in browser; backend co-signs as ephemeral signer.

### `withdraw` body example

```json
{
  "mode": "withdraw",
  "strategist": "<strategist pubkey>",
  "vault": "<vault pubkey>",
  "investors": [
    { "pubkey": "<investor pubkey>", "role": "investors", "shares": 110000000 }
  ]
}
```

**Do not** pass `strategist` signature for withdraw. Shares must match on-chain share ATA (not indexer alone).

---

## 7. Withdraw (redeem shares → native SOL)

**MVP: free withdraw** — no platform fee accounts on-chain.

### Bundled transaction (one investor signature)

| Order | Action |
|-------|--------|
| 1 | `update_nav` |
| 2 | Create wSOL ATA (idempotent) |
| 3 | Create share ATA (idempotent) |
| 4 | `create_investor_config` (if PDA missing) |
| 5 | `withdraw` |
| 6 | Close wSOL ATA → native SOL |

### On-chain `withdraw` accounts (devnet build)

```
investor → protocol_config → vault → investor_share_account → investor_token_account
→ vault_token_account → share_mint → investor_config → token_program
```

**9 accounts** — `investor_config` is required before `token_program`. Stale IDLs omit it.

### Liquidity cap

Redeemable amount ≤ liquid wSOL in `vault_token_account`. If SOL is in an open position → `InsufficientLiquidity` or blocked in UI.

### Multi-vault withdraw (simulator-v2)

UI mode `withdraw-wallet` maps to backend `mode: "withdraw"` **per vault**:

1. Scan all vaults where investor has on-chain share balance (`fetchWithdrawHoldings`)
2. For each vault with `redeemableShares > 0`, start a separate flow
3. Continue on partial failure; emit `withdraw-summary` meta event

**Do not** filter by session `activeVault` only — investor may hold shares in multiple vaults.

### Atomic prep

`POST /v1/tx/withdraw` — same bundle as flow single step.

---

## 8. simulator-v2 canvas → API mapping

Reference implementation: `simulator-v2/src/backend-flow.ts`.

| UI button / node | `SimMode` | Backend `mode` |
|------------------|-----------|----------------|
| Create vault | `create-vault` | `create-vault` |
| Deposit | `deposit` | `deposit` |
| Open position | `open-position` | `open-position` |
| Withdraw (settings) | `withdraw-wallet` | `withdraw` (loop) |
| Close vault (vault node) | `close-vault` | `close-vault` |

| Flow step | Canvas node id |
|-----------|----------------|
| `register_strategist`, `lock_license` | `license` |
| `create_vault` | `vault` |
| `park` | `deposit` |
| `withdraw` | `toWallet` |
| `request_trade` … `open_position` | `ata`, `request`, `execute`, `openPos` |
| `close_vault` | `vault`, `license` |

### Session state (browser)

| Key | Storage | Content |
|-----|---------|---------|
| `1v-vault` | `sessionStorage` | `{ vaultId, vault, vaultTokenAccount?, vaultType? }` |
| Wallet secrets | memory only | Never sent to backend except as signed txs |

Top bar: `vault #N · pooled|sliced` when active vault set.

### Settings node (retail)

- Park SOL, TP/SL, copy bps
- **Unwithdrawn vaults** panel — ready vs blocked holdings
- **Withdraw all (N)** — multi-vault redeem

### Degen node

- Vault type: `pooled` | `sliced`
- Park SOL amount for create-vault flow

### Licence node

Shows **1vault Licence** panel (always when protocol loaded):

- token name, lock amount, mint (explorer link)
- status: connect wallet → pending → registered → active → locked in vault
- strategist / licence PDAs after `resolve-accounts`

### Protocol node (bottom)

Same licence + program id from `GET /v1/protocol`.

---

## 9. Wallet kind

| `walletKind` | Meaning | Use |
|--------------|---------|-----|
| `eoa` | Personal wallet | Investors, strategists, signers |
| `pda` | Vault account | Holdings, vault detail |

`GET /v1/wallets/{address}/kind?cluster=devnet`

---

## 10. TypeScript types (simulator-v2)

| File | Types |
|------|-------|
| `simulator-v2/shared/events.ts` | `SimMode`, `VaultType`, `RetailSettings`, `ProtocolInfo`, `NodeUpdate` |
| `simulator-v2/src/shares.ts` | `WithdrawHolding`, `fetchWithdrawHoldings` |
| `simulator-v2/src/license.ts` | `LicensePreview`, `fetchLicensePreview` |

Production frontend should mirror these contracts or import from a shared package.

---

## 11. Common errors

| Symptom | Cause | Fix |
|---------|-------|-----|
| `AccountOwnedByWrongProgram` on withdraw | Wrong account order / missing `investor_config` | Rebuild backend; use latest IDL |
| `No on-chain vault shares` | Wrong investor wallet | Use wallet that parked |
| `InsufficientLiquidity` | SOL in position | Close position first |
| Licence dropdown disabled | Workflow `running` | Wait for flow to finish |
| Vault list empty | Indexer not running | Start indexer or use on-chain reads |
| `vaultId` already exists | PDA taken | `nextVaultId` + on-chain scan (simulator-v2) |

---

## 12. Devnet addresses (public)

| Item | Address |
|------|---------|
| Program | `2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP` |
| 1VL mint | `4R9AHfF2wE8X8252Swra3ncvKVDe3m73k8EfP99zz6YK` |
| wSOL | `So11111111111111111111111111111111111111112` |

Full list: root [README.md](../../README.md).

---

## 13. Checklist for new frontend screens

- [ ] `GET /v1/protocol` on load — programme id, licence mint, lock amount
- [ ] **Connect X** — `twitter/start` → callback → `auth/me`; optional wallet bind
- [ ] Strategist path: resolve-accounts → register → lock → create vault with `vaultType`
- [ ] Show licence lock **1M 1VL** before create vault
- [ ] Investor path: park → (optional) withdraw; shares from **RPC** share ATA
- [ ] Withdraw: single bundled tx; no strategist signer
- [ ] Multi-vault: iterate holdings, not only “active” vault
- [ ] Poll flows + refresh blockhash before sign
- [ ] Display `vaultTypeLabel` on vault cards
- [ ] Use `walletKind` on wallet analytics vs vault PDAs
