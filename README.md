# 1Vault

Pooled Solana trading vaults. A **degen** and **retail** park SOL into the **same vault**. The degen signs trades; the vault pays. Retail sets park amount plus take-profit / stop-loss only. Close vault pays leftover SOL **by share weight**, not an equal split.

**UI copy is English.** Brand `#093C5D`.

## What’s in this repo

| Path | What |
|------|------|
| [`ProgramID/onevault-program/`](./ProgramID/onevault-program/) | Anchor program + TypeScript SDK / Devnet scripts |
| [`ProgramID/onevault-indexer/`](./ProgramID/onevault-indexer/) | Postgres indexer, deposit ledger, REST API |
| [`frontend/`](./frontend/) | Production Next.js web app |
| [`simulator/`](./simulator/) | Devnet workflow UI (reference, not production app) |

## Locked product (current)

1. One vault = one pooled book. Locked wSOL is inventory the degen spends on a DEX.
2. `create_vault` locks **1,000,000 1vault Licence (1VL)** into that vault’s `vault_license` PDA until Close vault.
3. Deposit is recorded in **Postgres first**, then on-chain. Chain is source of truth after confirm.
4. Degen must park shares before `request_trade` (`StrategistMustPark`).
5. Closing the vault position closes all retail books with it.
6. Close vault is **not** 50/50. Example: degen 2 + retail 8, leftover 9 → ~1.8 / ~7.2.

## Devnet (public)

| Item | Address |
|------|---------|
| Program | `2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP` |
| Protocol config | `2WXErzw6DEZsVQ2QD3oTcwumCknpzhLf99akKu7qweQR` |
| 1VL mint (6 decimals) | `4R9AHfF2wE8X8252Swra3ncvKVDe3m73k8EfP99zz6YK` |
| Platform fee wallet | `9YajdkrkvyzDm57bPSijfy6sFNj9wuqQtYmuYUXZtPDx` |
| Degen fee wallet | `EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286` |
| Base mint | wSOL `So11111111111111111111111111111111111111112` |

## Quick start (Devnet)

```bash
# Indexer
cd ProgramID/onevault-indexer
cp .env.example .env   # set RPC_URL + DATABASE_URL, never commit .env
npm install && npm run migrate && npm run api

# Frontend (Next.js)
cd frontend
npm install && npm run dev

# Simulator UI
cd simulator
cp .env.example .env
npm install && npm run dev
```

Do not commit private keys, `.env`, or RPC API keys.
