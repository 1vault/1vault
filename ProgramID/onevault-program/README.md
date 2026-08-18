# 1Vault — Solana Smart Contract (Final On-Chain)

**Branding:** 1Vault | **Code:** `onevault` | **Program ID:** `J1EpKCXNJL6JfePvNEkFLRhRRVTFZN46oeatYViqqk3G`

Non-custodial strategy vault protocol — Phase 1–3 + Staking (on-chain only, no UI/backend).

## Documentation

**Full documentation:** [`docs/README.md`](./docs/README.md)

| Guide | Description |
|-------|-------------|
| [Program ID & Build](./docs/PROGRAM_ID.md) | **Program ID, anchor build, IDL sync** |
| [Frontend & Backend](./docs/FRONTEND_BACKEND_INTEGRATION.md) | **Integration guide for apps** |
| [TypeScript SDK](./sdk/README.md) | PDA helpers + client examples |
| [Architecture](./docs/ARCHITECTURE.md) | System design and modules |
| [Admin Configuration](./docs/ADMIN_CONFIGURATION.md) | **Update fees, license lock, DEX, tiers** |
| [Token, License & Staking](./docs/TOKEN_LICENSE_AND_STAKING.md) | 1VAULT CA setup |
| [Vault Lifecycle](./docs/VAULT_LIFECYCLE.md) | Close flow + retail fund return |
| [Instructions Reference](./docs/INSTRUCTIONS_REFERENCE.md) | All 69 instructions |
| [Deployment](./docs/DEPLOYMENT.md) | Build, deploy, bootstrap |

## Instruction Index

### Protocol
| Instruction | Description |
|-------------|-------------|
| `initialize_protocol` | Init config, fees, DEX allowlist, staking tiers |
| `update_protocol_config` | Admin update |
| `pause_protocol` | Emergency pause |
| `update_staking_tiers` | Configure fee discount tiers |
| `update_allowed_dex` | Update Jupiter/DEX allowlist |

### Strategist
| Instruction | Description |
|-------------|-------------|
| `register_strategist` | Create strategist PDA |
| `lock_license` / `unlock_license` | 1VAULT license lock |
| `register_referral` | On-chain referral binding |

### Vault
| Instruction | Description |
|-------------|-------------|
| `create_vault` | Vault + share mint + fee state + risk params |
| `update_vault` | Update name, fees, risk |
| `pause_vault` / `resume_vault` | Vault pause |
| `initiate_vault_close` | Strategist starts closure; retail withdraws shares |
| `close_vault` | Finalize after all shares redeemed |
| `update_nav` | Sync NAV from token balance |
| `update_vault_staked_value` | SOL staking NAV component |

### Investor
| Instruction | Description |
|-------------|-------------|
| `deposit` / `withdraw` | Share mint/burn + withdrawal fee + staking discount + referral |
| `create_investor_config` / `update_investor_config` | Follow & risk settings |
| `follow_on` / `follow_off` | Auto follow toggle |

### Trading (Phase 2)
| Instruction | Description |
|-------------|-------------|
| `request_trade` | Create trade request with risk validation |
| `execute_trade` | CPI to allowlisted DEX (Jupiter) via remaining accounts |
| `cancel_trade` | Cancel pending trade |
| `open_position` | Open vault position after trade |

### Position (Phase 2)
| Instruction | Description |
|-------------|-------------|
| `increase_position` | DCA / scale in |
| `reduce_position` | Partial close |
| `close_position` | Full close |
| `update_position_value` | Mark-to-market |

### Copy / Follow (Phase 3)
| Instruction | Description |
|-------------|-------------|
| `mirror_position` | Investor mirrors strategist position |
| `close_investor_position` | Investor exit with preference checks |
| `update_follower_stats` | Aggregate follower capital estimate |
| `record_investor_deposit_stats` | Track follower TVL |

### Accounting
| Instruction | Description |
|-------------|-------------|
| `accrue_fees` | Performance fee + high water mark |
| `claim_fees` | Strategist + protocol claim |
| `claim_referral_rewards` | Referrer claim |

### Staking (Phase 5)
| Instruction | Description |
|-------------|-------------|
| `initialize_staking` | Staking pool + vault |
| `init_staker` | Create staker account |
| `stake_platform` / `unstake_platform` | Lock 1VAULT for fee discounts |
| `claim_staking_reward` | Claim rewards |
| `fund_staking_rewards` | Admin fund rewards |

## PDA Seeds

```
["protocol"]
["strategist", strategist]
["license", strategist]
["vault", strategist, vault_id]
["share_mint", vault]
["investor_config", vault, investor]
["trade", vault, trade_id]
["vault_position", vault, position_id]
["investor_position", vault, investor, position_id]
["vault_fee", vault]
["referral", user]
["staking_pool"]
["staker", user]
```

## NAV Formula

```
NAV = total_assets + position_value + staked_value
Share Price = NAV / total_shares
```

## Build & Deploy

```powershell
cd onevault-program
anchor build
anchor deploy --provider.cluster devnet
```

## Notes

- **execute_trade**: Pass Jupiter swap accounts as `remaining_accounts` + `swap_data`. DEX program must be in allowlist.
- **Vault SOL staking**: Use `update_vault_staked_value` + external stake program CPI from keeper.
- **Phase 4** (indexer, DB, leaderboard) is off-chain — not in this program.
