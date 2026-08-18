# Architecture Overview

## What 1Vault Is

1Vault is a **non-custodial strategy vault protocol** on Solana. Strategists ("degens") run trading strategies inside vaults; retail investors deposit base assets and receive **vault share tokens**. The on-chain program handles:

- Protocol configuration and fees
- Strategist licensing (1VAULT token lock)
- Vault creation, NAV, pause, and closure
- Investor deposit / withdraw
- Trade requests, DEX execution, positions
- Copy-trading / auto-follow mirroring
- Performance fee accounting
- Platform token staking (fee discounts)
- Risk engine (daily loss, drawdown, circuit breaker)
- Optional vault SOL yield (native stake program CPI)
- Upgrade multisig proposals

There is **no UI or backend inside this repo** — only the Solana program. Off-chain indexing lives in `onevault-indexer/`.

---

## High-Level Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     ProtocolConfig (PDA)                        │
│  authority · treasury · platform_token_mint · fees · DEX lists  │
└────────────────────────────┬────────────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
┌──────────┐          ┌─────────────┐         ┌─────────────┐
│ Strategist│         │ StakingPool │         │  Treasury   │
│ + License │         │  (1VAULT)   │         │   (PDA)     │
└─────┬────┘          └─────────────┘         └─────────────┘
      │
      ▼
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│    Vault    │────▶│ VaultPosition│     │ InvestorVaultConfig│
│ share mint  │     │   + Trade    │     │ + InvestorPosition │
│ fee + risk  │     └──────────────┘     └─────────────────┘
└─────────────┘
```

---

## Module Layout (`programs/1vault/src/`)

| Directory / file | Responsibility |
|------------------|----------------|
| `lib.rs` | Program entrypoint; exposes all instructions |
| `constants.rs` | PDA seeds, defaults, known program IDs |
| `error.rs` | `OneVaultError` enum |
| `events.rs` | Anchor events for indexers |
| `utils/` | BPS math, TP/SL evaluation |
| `state/` | Account structs and enums |
| `instructions/` | Instruction handlers grouped by domain |

### Instruction modules

| File | Domain |
|------|--------|
| `protocol_ix.rs` | Protocol init, config, pause, DEX, treasury |
| `multisig_ix.rs` | Upgrade multisig proposals |
| `strategist_ix.rs` | Register, license lock/unlock, referral |
| `vault_ix.rs` | Vault CRUD, NAV, close lifecycle |
| `investor_ix.rs` | Deposit, withdraw, follow config |
| `trading_ix.rs` | Request / execute / cancel trades |
| `position_ix.rs` | Position management, TP/SL |
| `follow_ix.rs` | Mirror, auto-mirror, sync exits |
| `accounting_ix.rs` | Accrue / claim fees, referral rewards |
| `staking_ix.rs` | Platform 1VAULT staking pool |
| `risk_ix.rs` | Vault risk limits, circuit breaker |
| `vault_stake_ix.rs` | Vault SOL staking (yield strategy) |
| `keeper_ix.rs` | Keeper refresh / risk reset |

---

## Actor Roles

| Role | On-chain identity | Primary actions |
|------|-------------------|-----------------|
| **Protocol authority** | `ProtocolConfig.authority` | Init config, update fees, pause protocol, DEX lists |
| **Strategist (degen)** | Wallet + `Strategist` PDA | Lock license, create/manage vault, trade |
| **Retail investor** | Wallet + optional `InvestorVaultConfig` | Deposit, withdraw, follow settings |
| **Keeper** | Any signer (permissionless helpers) | Refresh vault NAV, reset risk day |
| **Referrer** | `ReferralAccount` PDA | Earn share of withdrawal fees |

---

## Vault Status State Machine

```
                    pause_vault
         ┌──────────────────────────────┐
         ▼                              │
      Active ──initiate_vault_close──▶ Closing
         ▲                              │
         │ resume_vault                 │ withdraw (retail redeems)
         │                              │
      Paused                            │
                                        ▼
                              close_vault (all shares = 0)
                                        │
                                        ▼
                                     Closed
```

| Status | Deposits | Trades | Withdrawals |
|--------|----------|--------|-------------|
| `Active` | Yes | Yes | Yes |
| `Paused` | No | No | Yes |
| `Closing` | No | No | **Yes** (retail returns funds) |
| `Closed` | No | No | No |

---

## Token Usage (Important)

| Use case | Token type |
|----------|------------|
| Strategist license lock | **1VAULT** SPL (`platform_token_mint`) |
| Platform staking (fee discount) | **1VAULT** SPL |
| Vault deposits / withdrawals | Vault **base mint** (e.g. USDC, wSOL) |
| Vault share tokens | Per-vault SPL mint (not 1VAULT) |
| Optional vault yield strategy | Native **SOL** via stake program (separate from license/staking) |

Account rent is always paid in SOL (standard Solana requirement).

---

## NAV Model

```
NAV = total_assets + position_value + staked_value

share_price = NAV × SHARE_PRICE_SCALE / total_shares   (if shares > 0)
```

- `total_assets` — liquid base token in vault ATA (synced via `update_nav`)
- `position_value` — mark-to-market open positions
- `staked_value` — SOL staking component for yield strategy vaults

Deposits and withdrawals both use the **full NAV** (consistent pro-rata pricing).

---

## Security Model

- **Non-custodial**: vault token account authority is the vault PDA; strategist cannot directly drain investor funds outside program rules.
- **License gate**: `create_vault` requires an active license (1VAULT locked).
- **DEX allowlist**: swaps only through programs in `allowed_dex_programs` or `protected_dex_programs` (MEV mode).
- **Risk engine**: daily loss limit and max drawdown can trip circuit breaker.
- **Upgrade multisig**: optional M-of-N approval before program upgrades (see `UPGRADE_MULTISIG.md`).

---

## What Is Off-Chain

- Leaderboards, analytics, trade history UI
- PostgreSQL indexer (`onevault-indexer/`)
- Jupiter swap route building (accounts passed as `remaining_accounts` to `execute_trade`)
- Price oracles for mark-to-market (keepers call `update_position_value`)
