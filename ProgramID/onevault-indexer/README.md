# 1Vault Indexer (Phase 4)

Off-chain indexing for the **MVP** 1Vault program. Parses Anchor events from Solana transactions and stores analytics in PostgreSQL.

> **Principle:** Blockchain is source of truth. PostgreSQL is index/cache/analytics only.

## Architecture

```
Solana RPC / WebSocket
        ↓
   onevault-indexer
        ↓
   PostgreSQL
        ↓
   REST API (leaderboard, ledger, ingest)
```

## Setup

```bash
cd ProgramID/onevault-indexer
cp .env.example .env
# Required: DATABASE_URL + RPC_URL (Helius recommended)

npm install
npm run migrate    # apply schema/*.sql
npm run api        # REST on port 3001
npm run dev        # poll new program txs (separate terminal)
```

### `.env` checklist

| Variable | Notes |
|----------|--------|
| `CLUSTER` | `devnet` or `mainnet-beta` |
| `RPC_URL` | Helius / Solana RPC |
| `PROGRAM_ID` | `2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP` |
| `DATABASE_URL` | Same Postgres as Go backend. Prefer Supabase **transaction** pooler **`:6543`** (session `:5432` hits max clients) |
| `API_PORT` | default `3001` |
| `POLL_INTERVAL_MS` | default `5000`–`8000` |

The indexer auto-rewrites `pooler.supabase.com:5432` → `:6543` and uses TLS with `rejectUnauthorized: false` for Supabase.

Demo scripts in `onevault-program/sdk` POST each confirmed signature to `http://127.0.0.1:3001/api/ingest` for immediate rows.

After **MVP program upgrade**, old indexed rows for stripped events remain in legacy tables; new txs only emit MVP events.

## Verify (smoke)

With `npm run api` running:

```bash
curl -s http://127.0.0.1:3001/health
curl -s http://127.0.0.1:3001/api/stats
curl -s http://127.0.0.1:3001/api/vaults | head
npm run status
```

Expect `health.ok=true` and non-empty `stats` after any indexed vaults exist.

## API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/stats` | Row counts per table |
| `GET /api/protocol-state` | Latest `ProtocolInitialized` snapshot |
| `GET /api/leaderboard` | Vaults by return % |
| `GET /api/vaults` | All indexed vaults |
| `GET /api/vaults/:pubkey` | Vault + PnL snapshots + trades |
| `GET /api/vaults/:pubkey/holdings` | Park book per investor |
| `GET /api/vaults/:pubkey/positions` | Vault + investor positions |
| `GET /api/vaults/:pubkey/fees` | Performance fee accruals |
| `GET /api/vaults/:pubkey/follows` | Follow / mirror events |
| `GET /api/vaults/:pubkey/payouts` | Close-vault pro-rata payouts |
| `GET /api/trades?vault=` | Trade history |
| `GET /api/analytics/vault/:pubkey` | Deposit/withdraw/position stats |
| `GET /api/performance/:pubkey` | Share price history |
| `POST /api/ingest` | Index one signature immediately |
| `POST /api/ledger/deposits` | Create deposit intent (Postgres-first) |
| `POST /api/ledger/deposits/:id/submit` | Attach on-chain signature |
| `GET /api/ledger/deposits` | List deposit intents |
| `POST /api/ledger/mandates` | Upsert investor mandate |
| `GET /api/ledger/mandates` | List mandates |

Removed: `GET /api/vaults/:pubkey/stakes` (vault SOL staking stripped from program).

## Indexed events (MVP)

- **Vault:** `VaultCreated`, `VaultClosingInitiated`, `VaultClosed`, `VaultClosePayout`
- **Investor:** `InvestorDeposit`, `InvestorWithdraw` (`fee_amount` is 0 on-chain)
- **Trade:** `TradeRequested`, `TradeExecuted`
- **Position:** `PositionOpened`, `PositionUpdated`, `PositionClosed`, `PositionFollowersClosed`, `TpSlTriggered`
- **Fees:** `FeeAccrued` (performance only; `protocol_fee` column stored as `0`)
- **Follow:** `InvestorMirrored`
- **Protocol:** `ProtocolInitialized`, `UpgradeProposal*`

**Legacy (no longer emitted):** `ReferralRewardAccrued`, `PlatformStaked` / `Unstaked`, `VaultSolStaked` / `Unstaked`, `RiskCircuitBreakerTripped`. Tables remain for historical rows.

## Utilities

```bash
npm run backfill   # index historical program signatures
npm run replay     # re-parse selected event types from transactions table
npm run ingest -- <signature>
npm run status
```

## Program ID

`2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP`

## Backend integration

Go API (`backend/`) reads the **same** `DATABASE_URL`. Run indexer when you need vault list / holdings / leaderboard to stay fresh:

| Process | Command | Port |
|---------|---------|------|
| Indexer API | `npm run api` | 3001 |
| Indexer poller | `npm run dev` | — |
| Go backend | `./bin/1vault-api` | 3090 |

Optional: set `INDEXER_INGEST_URL=http://127.0.0.1:3001/api/ingest` on the backend so `POST /v1/tx/submit` can trigger immediate indexing.

## Deploy on Railway

Lihat **[RAILWAY.md](./RAILWAY.md)** — Root Directory wajib `ProgramID/onevault-indexer`.

Ringkas (CLI):

```bash
cd ProgramID/onevault-indexer
railway login
railway link   # atau railway init
railway variables set DATABASE_URL="...:6543/postgres" RPC_URL="..." PROGRAM_ID="2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP" CLUSTER="devnet" RUN_POLLER="1"
railway up
```
