# 1Vault Indexer (Phase 4)

Off-chain indexing service for the 1Vault protocol. Parses Anchor events from Solana transactions and stores analytics in PostgreSQL.

> **Principle:** Blockchain is the source of truth. PostgreSQL is index/cache/analytics only.

## Architecture

```
Solana RPC / WebSocket
        ↓
   onevault-indexer
        ↓
   PostgreSQL
        ↓
   REST API (leaderboard, trades, performance)
```

## Setup

```bash
cd onevault-indexer
cp .env.example .env
# Edit DATABASE_URL and RPC_URL (Helius recommended for production)

npm install
npm run dev        # start indexer
npm run api        # start REST API on port 3001
```

## PostgreSQL / Supabase

Indexer reads `DATABASE_URL` from `.env` (not `.env.example`). Schema is applied automatically on start:

```bash
cd onevault-indexer
cp .env.example .env
# set DATABASE_URL to the Supabase URI (URL-encode special chars in the password)
npm install
npm run migrate    # push schema/001_init.sql
npm run backfill   # index existing Devnet program txs
npm run api        # REST + POST /api/ingest  (port 3001)
npm run dev        # poll new program txs into the same DB
```

Demo scripts (`fee-demo:devnet`, `product-flow:devnet`) POST each confirmed signature to `http://127.0.0.1:3001/api/ingest` so rows land immediately.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/leaderboard` | Vault leaderboard by return % |
| `GET /api/vaults` | All indexed vaults |
| `GET /api/vaults/:pubkey` | Vault detail + PnL + trades |
| `GET /api/trades?vault=` | Trade history |
| `GET /api/analytics/vault/:pubkey` | Deposit/withdraw/position stats |
| `GET /api/performance/:pubkey` | Share price history |

## Indexed Events

- VaultCreated, InvestorDeposit, InvestorWithdraw
- TradeRequested, TradeExecuted
- PositionOpened, PositionClosed, TpSlTriggered
- FeeAccrued, ReferralRewardAccrued
- PlatformStaked, PlatformUnstaked
- RiskCircuitBreakerTripped

## Program ID

`2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP`
