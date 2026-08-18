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

## PostgreSQL

Run migration automatically on indexer start, or manually:

```bash
psql $DATABASE_URL -f schema/001_init.sql
```

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

`J1EpKCXNJL6JfePvNEkFLRhRRVTFZN46oeatYViqqk3G`
