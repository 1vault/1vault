# 1Vault — Solana Smart Contract (MVP)

**Branding:** 1Vault | **Code:** `onevault` | **Program ID:** `2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP`

Non-custodial pooled vault protocol — **MVP scope** after stripping referral, risk, staking, DCA, on-chain MEV, and related metadata.

## Documentation

**Full documentation:** [`docs/README.md`](./docs/README.md) *(some deep-dive docs still describe pre-strip features; trust this README + IDL for MVP)*

| Guide | Description |
|-------|-------------|
| [Program ID & Build](./docs/PROGRAM_ID.md) | Program ID, `anchor build`, IDL sync |
| [Frontend & Backend](./docs/FRONTEND_BACKEND_INTEGRATION.md) | Integration guide for apps |
| [TypeScript SDK](./sdk/README.md) | PDA helpers, bootstrap, Devnet scripts |
| [Deployment](./docs/DEPLOYMENT.md) | Build, deploy, bootstrap |

## MVP scope

| In contract | Out (stripped) |
|-------------|----------------|
| `lock_license` + per-vault 1VL escrow | Referral, platform staking |
| Park / deposit / **free** withdraw | Flat withdraw fee, staker discount |
| Trade, TP/SL, launchpad + DEX allowlist | On-chain MEV mode, `protected_dex` |
| Follow / copy (`mirror_position`, sync ix) | DCA flags, follower stats ix |
| `accrue_fees` / `claim_fees` → degen wallet | Protocol 5% performance split |
| Keeper `keeper_refresh_vault` | Risk engine, vault SOL stake |
| Upgrade multisig | Vault `max_position` / exposure caps |

## Instruction index (~47)

### Protocol
| Instruction | Description |
|-------------|-------------|
| `initialize_protocol` | Treasury, 1VL mint, license lock amount, performance fee cap, DEX allowlist |
| `update_protocol_config` | Update treasury, license lock, performance fee |
| `pause_protocol` | Emergency pause |
| `update_allowed_dex` | DEX allowlist (Jupiter, Raydium, …) |
| `update_allowed_launchpads` | Launchpad allowlist (Pump.fun, …) |
| `initialize_treasury` | Per-mint treasury ATA |
| `sweep_treasury_sol` | Unwrap treasury wSOL to native SOL |

### Upgrade multisig
`initialize_upgrade_multisig`, `update_upgrade_multisig`, `create_upgrade_proposal`, `approve_upgrade_proposal`, `cancel_upgrade_proposal`, `mark_upgrade_executed`

### Strategist
| Instruction | Description |
|-------------|-------------|
| `register_strategist` | Create strategist PDA |
| `lock_license` / `unlock_license` | Activate license record (1VL locked on `create_vault`) |

### Vault
| Instruction | Description |
|-------------|-------------|
| `create_vault` | Vault + share mint + fee state + 1VL lock |
| `update_vault` | Name, performance fee, slippage, accepted mints |
| `pause_vault` / `resume_vault` | Vault pause |
| `initiate_vault_close` / `close_vault` | Closure + pro-rata share payouts |
| `update_nav` | Sync `total_assets` from vault ATA |

### Investor
| Instruction | Description |
|-------------|-------------|
| `deposit` / `withdraw` | Share mint/burn — **no withdraw fee** |
| `create_investor_config` / `update_investor_config` | Follow settings + **investor** risk limits |
| `follow_on` / `follow_off` | Auto-follow toggle |

### Trading & positions
`request_trade`, `execute_trade`, `cancel_trade`, `ensure_vault_token_ata`, `open_position`, `increase_position`, `reduce_position`, `close_position`, `update_position_value`, `trigger_tp_sl_close`

`request_trade` no longer takes `dca_enabled` / `dca_index`. `increase_position` remains a one-off scale-in.

### Follow / copy
`mirror_position`, `auto_mirror_position`, `close_investor_position`, `sync_investor_position_reduce`, `sync_investor_position_close`, `sync_investor_tp_sl`

### Accounting & keeper
| Instruction | Description |
|-------------|-------------|
| `accrue_fees` | Vault-wide HWM performance fee |
| `claim_fees` | Pay accrued performance fee to degen wallet (wSOL unwrap) |
| `keeper_refresh_vault` | Sync vault ATA balance → `total_assets` |

## PDA seeds (MVP)

```
["protocol"]
["strategist", strategist]
["license", strategist]
["license_vault", strategist]
["vault", strategist, vault_id]
["vault_license", vault]
["share_mint", vault]
["vault_fee", vault]
["investor_config", vault, investor]
["trade", vault, trade_id]
["vault_position", vault, position_id]
["investor_position", vault, investor, position_id]
["treasury"] / ["treasury", mint]
["fee_unwrap", ...]
["upgrade_multisig"] / ["upgrade_proposal", multisig, proposal_id]
```

## NAV formula

```
NAV = total_assets + position_value
Share price = NAV / total_shares  (scaled by SHARE_PRICE_SCALE)
```

## Build & deploy

```powershell
cd onevault-program
anchor build
anchor deploy --provider.cluster devnet
```

Bootstrap Devnet (new `ProtocolConfig` after upgrade):

```powershell
cd sdk
npm run bootstrap:devnet
```

## Notes

- **execute_trade:** Pass swap accounts as `remaining_accounts` + `swap_data`. Venue must be on the DEX or launchpad allowlist. Anti-MEV routing (Jito, etc.) is **off-chain** when building the swap tx.
- **Breaking layout:** Existing Devnet `ProtocolConfig` PDAs are incompatible after MVP upgrade — re-run bootstrap.
- **Phase 4** indexer lives in `../onevault-indexer/`.
