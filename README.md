# 1Vault

Pooled Solana trading vaults. A **degen** and **retail** park SOL into the **same vault**. The degen signs trades; the vault pays. Retail sets park amount plus take-profit / stop-loss only. Close vault pays leftover SOL **by share weight**, not an equal split.

**UI copy is English.** Brand `#093C5D`.

## What’s in this repo

| Path | What |
|------|------|
| [`ProgramID/onevault-program/`](./ProgramID/onevault-program/) | Anchor program (MVP) + TypeScript SDK / Devnet scripts |
| [`ProgramID/onevault-indexer/`](./ProgramID/onevault-indexer/) | Postgres indexer, deposit ledger, REST API |
| [`backend/`](./backend/) | Production REST API v1 in **Go** (Twitter auth, Swagger, `/v1`) |
| [`frontend/`](./frontend/) | Production Next.js web app |
| [`simulator/`](./simulator/) | Devnet workflow UI (reference, not production app) |
| [`simulator-v2/`](./simulator-v2/) | Devnet canvas UI → Go backend `/v1/flows` (recommended for integration testing) |

## MVP on-chain (current program)

**In contract:** license lock (1M 1VL per vault), park/deposit, **free withdraw**, trade + TP/SL + launchpad allowlist, follow/copy, performance fee accrue/claim (degen wallet), keeper NAV refresh, upgrade multisig.

**Stripped (not in this build):** referral, risk engine, platform staking, vault SOL validator stake, flat withdraw fee, DCA flags, on-chain MEV mode, `StrategyType` metadata, protocol 5% performance split, follower stats ix, vault-wide position caps.

**Not yet built:** V2 retail early-exit fee, platform 0.1% trade fee, per-investor HWM.

> **Breaking:** `ProtocolConfig` and `Vault` account layouts changed. After upgrading the program on Devnet, run `npm run bootstrap:devnet` in `onevault-program/sdk` and create new vaults.

## Locked product (current)

1. One vault = one pooled book. Locked wSOL is inventory the degen spends on a DEX.
2. `create_vault` locks **1,000,000 1vault Licence (1VL)** into that vault’s `vault_license` PDA until Close vault.
3. Deposit is recorded in **Postgres first**, then on-chain. Chain is source of truth after confirm.
4. Park and redeem are **free** (no flat withdraw fee on-chain).
5. Degen must park shares before `request_trade` (`StrategistMustPark`).
6. Closing the vault position closes all retail books with it.
7. Close vault is **not** 50/50. Example: degen 2 + retail 8, leftover 9 → ~1.8 / ~7.2.

## Devnet (public)

| Item | Address |
|------|---------|
| Program | `2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP` |
| Protocol config | `2WXErzw6DEZsVQ2QD3oTcwumCknpzhLf99akKu7qweQR` *(re-bootstrap after MVP upgrade)* |
| 1VL mint (6 decimals) | `4R9AHfF2wE8X8252Swra3ncvKVDe3m73k8EfP99zz6YK` |
| Degen fee wallet | `EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286` |
| Base mint | wSOL `So11111111111111111111111111111111111111112` |

## Quick start (Devnet)

```bash
# Program + SDK bootstrap (after anchor build)
cd ProgramID/onevault-program/sdk
npm install
npm run bootstrap:devnet

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

# Simulator v2 (Go backend flows — see simulator-v2/README.md)
cd simulator-v2
cp .env.example .env
npm install && npm run dev   # http://localhost:5174
```

**Frontend integration:** [backend/docs/FRONTEND_GUIDE.md](./backend/docs/FRONTEND_GUIDE.md) — vault types, licence (1VL), withdraw, flows, simulator-v2 mapping.

Do not commit private keys, `.env`, or RPC API keys.
