# 1Vault Backend API (Go)

High-performance production REST API written in Go (`chi` + `pgx`).

Same v1 contract as before: Twitter OAuth, Solana wallet bind, cluster-scoped vault/ledger reads, standard JSON envelope, Swagger.

**Frontend developers:** read [docs/FRONTEND_GUIDE.md](./docs/FRONTEND_GUIDE.md) for vault types, 1vault Licence (1VL), withdraw bundles, flow modes, and simulator-v2 UI mapping. Swagger: http://localhost:3090/v1/docs

## Requirements

- Go 1.22+
- PostgreSQL (same DB as `onevault-indexer`)

## Do I need to run `onevault-indexer`?

**Not always.** The Go API and [`onevault-indexer`](../ProgramID/onevault-indexer/) are **separate processes** that share the **same Postgres** (`DATABASE_URL`). The backend reads indexer tables; the indexer writes them from Solana RPC.

```
Solana RPC → onevault-indexer → PostgreSQL ← Go backend API ← client
```

### Works without indexer (API only)

- `./1vault-api` + `DATABASE_URL` + `JWT_SECRET`
- `GET /v1/health`, `/v1/protocol`, Swagger
- Twitter auth / wallet bind (backend migrations)
- All `/v1/tx/*` prep + submit (uses RPC, not indexer)
- Market / discover / wallet analytics (GMGN / Dex)

### Needs indexer running (or DB already backfilled)

Product reads stay empty or stale without indexer sync:

- `/v1/vaults`, `/v1/vaults/{pubkey}/*`
- `/v1/leaderboard`, `/v1/trades`
- `/v1/strategists/*`, `/v1/investors/*`
- Ledger tables that overlap indexer schema
- `vaultType` auto-detect from `vaults` after a vault is indexed

### Quick decision

| Goal | Run indexer? |
|------|----------------|
| Swagger tx-prep, market, auth only | No |
| Vault list, leaderboard, holdings, trades | Yes |
| Rows appear right after on-chain tx | Yes + ingest |

**Indexer (same `DATABASE_URL` as backend):**

```bash
cd ProgramID/onevault-indexer
cp .env.example .env
npm install && npm run migrate
npm run api    # REST + POST /api/ingest on :3001
npm run dev    # poll new program txs (separate terminal)
```

Optional: set `INDEXER_INGEST_URL` in backend `.env` and pass `"ingest": true` on `POST /v1/tx/submit` to trigger immediate indexing after broadcast.

The on-chain program does **not** need a local process if Devnet/mainnet deployment already exists.

## Quick start

```bash
cd backend
cp .env.example .env   # DATABASE_URL + JWT_SECRET required
go mod tidy
go run ./cmd/api
```

- API: http://localhost:3090  
- Swagger: http://localhost:3090/v1/docs  
- Wallet test (create-vault + Phantom/Solflare): http://localhost:3090/v1/test/create-vault  
- Workflow simulator v2 (canvas UI → `/v1/flows`): http://localhost:5174 — see [`simulator-v2/README.md`](../simulator-v2/README.md)  

Migrations in `migrations/` run automatically on startup.

## Build

```bash
go build -o bin/1vault-api ./cmd/api
./bin/1vault-api
# or from bin/:
cd bin && ./1vault-api
```

### Linux binary (Railway / VPS)

Command yang benar harus menyertakan package path `./cmd/api` (bukan hanya `go build` di root `backend/`):

```bash
# Script (recommended) — output di bin/railway/
./scripts/build-linux.sh          # linux/amd64
./scripts/build-linux.sh arm64    # linux/arm64

# Manual
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/railway/1vault-api ./cmd/api
```

Hasil: `bin/railway/1vault-api` (static ELF) + `migrations/` + `docs/` untuk Swagger.

### Deploy on Railway (Dockerfile)

1. New project → connect repo → **Root Directory = `backend`**
2. Builder uses `Dockerfile` + `railway.toml` (healthcheck `/v1/health`)
3. Add Postgres plugin → `DATABASE_URL` injected automatically
4. Set variables:

| Variable | Required |
|----------|----------|
| `JWT_SECRET` | yes |
| `DATABASE_URL` | yes (Postgres plugin or Supabase) |
| `PORT` | auto by Railway |
| `CORS_ORIGINS` | production frontend + simulator origins |
| `TWITTER_*` / RPC / GMGN | optional |

**Supabase from Railway:** use the **transaction** pooler URL (port **6543**), not session `:5432` (hits `max clients reached`). Example:

```text
postgresql://postgres.PROJECT:PASSWORD@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require
```

On `:6543` / `pooler.supabase.*`, the API uses **simple protocol** (no named prepared statements). Otherwise pgx hits `SQLSTATE 42P05` — `prepared statement "stmtcache_…" already exists`. Override with `DATABASE_SIMPLE_PROTOCOL=1`.

Image includes `ca-certificates` for TLS verify. Escape hatch only: `DATABASE_SSL_INSECURE=1`.

Do **not** commit `.env` — set secrets in Railway dashboard.
## Smoke test (one-shot)

With the API running locally:

```bash
cd backend
./scripts/smoke.sh
# optional:
# BASE_URL=http://localhost:3090 CLUSTER=devnet ./scripts/smoke.sh
```

Covers system, protocol, vaults, tokens, discover, streams, wallets, tx-prep, flows, feature stubs, and auth soft-paths.  
`PASS` = healthy · `SOFT` = expected degraded (404/429/503) · `FAIL` = hard error (exit 1).
Also fails if responses still contain legacy `degen`/`retail` role language.

`.env` lives in `backend/` (parent of `bin/`). The binary loads it automatically from:
`backend/.env`, cwd, or `../.env` relative to the executable.
Migrations/docs resolve from the backend root the same way.

## Cluster

```http
GET /v1/vaults?cluster=devnet
X-1Vault-Cluster: mainnet-beta
```

## Auth

1. `GET /v1/auth/twitter/start` — optional `?returnTo=http://localhost:5174/auth/callback` (simulator-v2)
2. Twitter callback → upsert `users.twitter_id` → JWT + refresh
3. `GET /v1/auth/me` with Bearer token
4. `GET /v1/wallets/nonce?pubkey=...` → sign → `POST /v1/wallets/bind`
5. Ledger writes require Bearer token + bound wallet

Full OAuth flow + DB tables: [docs/FRONTEND_GUIDE.md](./docs/FRONTEND_GUIDE.md) §3.

## Envelope

```json
{
  "success": true,
  "data": {},
  "meta": { "cluster": "devnet", "requestId": "...", "version": "v1" },
  "error": null
}
```

Non-custodial: this service never moves funds or accepts private keys.

## Async flows (non-custodial job + poll)

Same lifecycle as the simulator, but **dynamic pubkeys** and **async steps**:

```text
POST /v1/flows?cluster=devnet
  { mode, strategist, vaultTokenAccount, vaultId, investors:[{pubkey,lamports,...}] }
→ { id, status: awaiting_signature, steps[], prepared tx on current step }

Client signs EOA only → POST /v1/flows/{id}/submit { signedTransaction }
→ confirming (backend auto-ingests to indexer) → poll GET /v1/flows/{id} until next step or completed
```

**Signing policy:** responses include `signerDetails` + `signingMode`:
- `eoa` — user wallet must sign in frontend
- `ephemeral` / `keeper` — backend co-signs (create_vault vault token, keeper `update_nav`)
- After confirm, backend POSTs signature to `INDEXER_INGEST_URL` automatically

Single-tx path: `POST /v1/tx/submit` → async confirm+ingest → poll `GET /v1/tx/status/{signature}` for `ingest` result.

Modes: `create-vault`, `deposit`, `configure-follow`, `withdraw`, `open-position`, `exit-position` (sell % + slippage + gas + TP/SL), `claim-fees`, `close-vault`.

### Exit / sell position

```json
POST /v1/tx/exit-position?cluster=devnet
{
  "strategist": "<strategies-wallet>",
  "vault": "<vault>",
  "vaultTokenAccount": "<vault wSOL ATA>",
  "outputTokenAccount": "<vault token ATA being sold>",
  "positionId": 1,
  "exitPercent": 50,
  "proceeds": 0,
  "priorityFeeMicroLamports": 5000,
  "computeUnitLimit": 400000,
  "alsoRequestSell": true,
  "tradeId": 2,
  "inputMint": "<meme mint>",
  "outputMint": "So11111111111111111111111111111111111111112",
  "baseAmount": 1000000000,
  "slippageBps": 100,
  "takeProfitBps": 2000,
  "stopLossBps": 500
}
```

- `exitPercent` / `exitBps`: portion of position (100% → `close_position`, else `reduce_position`)
- `slippageBps`, `takeProfitBps`, `stopLossBps`: on the sell `request_trade`
- `priorityFeeMicroLamports`: Solana priority fee (gas tip)
- If `proceeds` is omitted/`0`, backend auto-fills from live market price when `inputMint` + `baseAmount` are set (`proceedsSource: "market"`)

Async: `POST /v1/flows` with `"mode":"exit-position"` runs sell request → execute_trade (direct on-chain) → exit accounting → update_nav.

## Token market & research

Requires market data to be configured. Quotes always use **Solana mainnet** — `?cluster=` only selects the vault program cluster, not the market feed.

```text
GET /v1/tokens/{mint}/price?cluster=devnet
GET /v1/tokens/{mint}/price?cluster=devnet&amount=<raw>&exitBps=5000  → notionalUsd + proceedsLamports
GET /v1/tokens/{mint}/kline?cluster=devnet&resolution=1m&from=&to=
GET /v1/tokens/{mint}/analyze?cluster=devnet
GET /v1/tokens/{mint}/info?cluster=devnet          → full info + marketCapUsd
GET /v1/tokens/{mint}/security?cluster=devnet
GET /v1/tokens/{mint}/pool?cluster=devnet
GET /v1/tokens/{mint}/holders?cluster=devnet&limit=20&tag=smart_degen
GET /v1/tokens/{mint}/traders?cluster=devnet&orderBy=profit
GET /v1/tokens/{mint}/research?cluster=devnet      → info + security + pool
GET /v1/tokens/{mint}/holder-analysis?cluster=devnet
GET /v1/tokens/{mint}/detail?cluster=devnet       → research + pairs merged
GET /v1/tokens/{mint}/pairs?cluster=devnet
GET /v1/tokens/{mint}/orders?cluster=devnet

### Discover & live streams

```text
GET  /v1/discover/profiles/latest?cluster=devnet
GET  /v1/discover/profiles/recent?cluster=devnet
GET  /v1/discover/takeovers/latest?cluster=devnet
GET  /v1/discover/ads/latest?cluster=devnet
GET  /v1/discover/boosts/latest?cluster=devnet
GET  /v1/discover/boosts/top?cluster=devnet
GET  /v1/discover/search?cluster=devnet&q=BONK
GET  /v1/discover/metas/trending?cluster=devnet
GET  /v1/discover/metas/{slug}?cluster=devnet
GET  /v1/discover/pairs/{chainId}/{pairId}?cluster=devnet

# WebSocket (no cluster required)
WS   /v1/stream/profiles/latest
WS   /v1/stream/profiles/recent
WS   /v1/stream/takeovers/latest
WS   /v1/stream/ads/latest
WS   /v1/stream/boosts/latest
WS   /v1/stream/boosts/top
```
```

### Wallets

`walletKind` on every wallet response:
- `eoa` — individual / personal wallet
- `pda` — vault wallet (program-derived)

Optional query `walletKind=eoa|pda` (aliases: `individual`, `vault`). If omitted, known vault pubkeys → `pda`, else `eoa`.

```text
GET  /v1/wallets/{walletAddress}/kind?cluster=devnet
GET  /v1/wallets/{walletAddress}/holdings?cluster=devnet&walletKind=eoa     → requires signing key
GET  /v1/wallets/{walletAddress}/activity?cluster=devnet&walletKind=pda
GET  /v1/wallets/{walletAddress}/stats?cluster=devnet&period=7d
GET  /v1/wallets/{walletAddress}/token-balance?cluster=devnet&token=<mint>
GET  /v1/wallets/{walletAddress}/created-tokens?cluster=devnet
GET  /v1/wallets/{walletAddress}/score?cluster=devnet
POST /v1/wallets/profits?cluster=devnet
     body: { "wallets": [...], "period": "7d", "walletKind": "eoa" }
```

Spot price uses token info first, then falls back to last kline close. Mark-to-market only — not an on-chain fill. Token metadata (`name`/`symbol`/`links`) is untrusted.

**Roles (product language):** `strategies` (formerly degen) and `investors` (formerly retail). Responses use the new names; writes still accept legacy `degen`/`retail`.

### Vault types

`vaultType` on vault list/get (and create-vault prep):
- `pooled` — Pooled Vault: all capital in one pool, same strategy; P&L by ownership share
- `sliced` — Sliced Vault: capital split into slices with different strategy/risk/exposure

Encoded on-chain as book mode (`pooled=0` / `sliced=1` + u16 param; sliced defaults to 1000 management-fee bps). Also stored in API/DB registry. Default for existing vaults is `pooled`. Filter with `GET /v1/vaults?vaultType=pooled|sliced`. Pass `vaultType` on `POST /v1/tx/create-vault` or flows `mode=create-vault`.

### Performance

Hot GET paths use in-process TTL caches with singleflight + stale-while-revalidate:
- **DB reads** (vaults, leaderboard, strategist/investor): ~10–20s TTL → warm typically &lt;50ms
- **Market/Discover** (token, wallet, dex lists): ~8–45s TTL → warm typically single-digit–tens of ms with full prior payload
- **Wallet kind**: in-memory vault pubkey index (refreshed every 30s) — no DB RTT when ready

Cold miss still pays one upstream/DB round-trip (Supabase `ap-southeast-2` / GMGN / Dex). Tx prep & on-chain confirm remain RPC-bound.

Atomic prep remains at `/v1/tx/*`. Product reads use existing indexer tables (`vaults`, `strategists`, `vault_holdings`, …). Stripped/future writes return `FEATURE_NOT_ON_CHAIN`.

## On-chain tx prep (unsigned)

Server builds Anchor instructions + recent blockhash; **client signs** and posts back.

```text
POST /v1/tx/<action>?cluster=devnet   → { transaction, requiredSigners, accounts }
  client signs with wallet (+ vaultTokenAccount for create_vault)
POST /v1/tx/submit?cluster=devnet     → { signature }
GET  /v1/tx/status/{signature}?cluster=devnet
```

| Endpoint | Purpose |
|---|---|
| `/v1/tx/resolve-accounts` | Derive PDAs from `strategist` / `investor` / `vault` / `vaultId` |
| `/v1/tx/register-strategist` | Strategist PDA |
| `/v1/tx/lock-license` | Licence record |
| `/v1/tx/create-vault` | Create vault (co-sign `vaultTokenAccount`) |
| `/v1/tx/park` / `park-guest` | Wrap SOL → deposit |
| `/v1/tx/withdraw` | Redeem shares → native SOL (bundled update_nav + withdraw + unwrap) |
| `/v1/tx/request-trade` | Trade request (buy/sell) |
| `/v1/tx/execute-trade` | Direct fill — DEX auto from `PROGRAM_IDS` (no client choice) |
| `/v1/tx/open-position` / `close-position` / `reduce-position` / `exit-position` | Position lifecycle |
| `/v1/tx/accrue-fees` / `claim-fees` | Fees |
| `/v1/tx/initiate-close` / `unlock-license` | Close path |

All prep bodies take **caller-supplied pubkeys** (`strategist`, `investor`, `vault`, `vaultTokenAccount`, …).  
Vault can be passed as `vault`, or derived with `strategist` + `vaultId`. No wallet is hardcoded in the tx builders.

Example create:

```json
POST /v1/tx/create-vault?cluster=devnet
{
  "strategist": "<strategies-wallet>",
  "vaultTokenAccount": "<new keypair pubkey>",
  "vaultId": 3,
  "name": "Alpha book",
  "performanceFeeBps": 2000,
  "baseMint": "So11111111111111111111111111111111111111112",
  "allowedMints": ["So11111111111111111111111111111111111111112"]
}
```

Example park:

```json
POST /v1/tx/park-guest?cluster=devnet
{
  "investor": "<investor pubkey>",
  "strategist": "<strategies-wallet>",
  "vaultId": 3,
  "vaultTokenAccount": "<vault ATA pubkey>",
  "lamports": 100000000
}
```

### Withdraw (redeem shares → native SOL)

Free withdraw for retail investors. The investor must hold vault shares (SPL share ATA) from a prior park/deposit.

```json
POST /v1/tx/withdraw?cluster=devnet
{
  "investor": "<investor pubkey>",
  "strategist": "<strategies-wallet>",
  "vault": "<vault pubkey>",
  "vaultTokenAccount": "<vault wSOL ATA>",
  "shares": 110000000
}
```

The prepared transaction bundles:

| Step | Instruction | Signer |
|------|-------------|--------|
| 1 | `update_nav` | investor (fee payer) |
| 2 | Create wSOL ATA | investor |
| 3 | Create share ATA | investor |
| 4 | `create_investor_config` | investor (skipped on-chain if PDA exists) |
| 5 | `withdraw` | investor |
| 6 | Close wSOL ATA → native SOL | investor |

**On-chain `withdraw` accounts:** `investor`, `protocol_config`, `vault`, `investor_share_account`, `investor_token_account`, `vault_token_account`, `share_mint`, `investor_config`, `token_program`.

**Liquidity cap:** only liquid wSOL in `vault_token_account` can be redeemed. If funds are in an open position, close the position first or redeem fewer shares.

**Read shares:** `GET /v1/investors/{pubkey}` (indexer) + verify on-chain share ATA balance before withdraw.

Example async withdraw flow:

```json
POST /v1/flows?cluster=devnet
{
  "mode": "withdraw",
  "strategist": "<strategies-wallet>",
  "vault": "<vault pubkey>",
  "investors": [
    { "pubkey": "<investor pubkey>", "role": "investors", "shares": 110000000 }
  ]
}
```

Poll `GET /v1/flows/{id}` → sign when `status: awaiting_signature` → `POST /v1/flows/{id}/submit`.

**simulator-v2:** connect or import the **retail** wallet that parked funds; Withdraw scans all vaults with on-chain shares (not only session active vault). See [docs/FRONTEND_GUIDE.md](./docs/FRONTEND_GUIDE.md).

Example async create-vault flow:

```json
POST /v1/flows?cluster=devnet
{
  "mode": "create-vault",
  "strategist": "<strategies-wallet>",
  "vaultTokenAccount": "<new keypair pubkey>",
  "vaultId": 12,
  "name": "Book 12",
  "vaultType": "pooled",
  "investors": [
    { "pubkey": "<strategies-wallet>", "role": "strategies", "lamports": 200000000 },
    { "pubkey": "<investors-wallet>", "role": "investors", "lamports": 100000000, "takeProfitBps": 500, "stopLossBps": 200 }
  ]
}
```

**create_vault flow:** generate a keypair for `vaultTokenAccount` → prep → strategist + that keypair both sign → submit.

Buy/sell/reduce use program instructions only. `execute_trade` picks DEX automatically from `PROGRAM_IDS` priority (no client selection). `POST /v1/tx/request-trade` also returns auto `executeTrade`. Exit/reduce auto-fill `proceeds` from market price when omitted.
