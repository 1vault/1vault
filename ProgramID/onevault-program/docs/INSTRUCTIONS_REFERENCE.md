# Instructions Reference

Complete catalog of all **69** program instructions grouped by module.

**Program ID:** `J1EpKCXNJL6JfePvNEkFLRhRRVTFZN46oeatYViqqk3G`

Legend: **Auth** = required signer role.

---

## Protocol (7)

| Instruction | Auth | Args | Description |
|-------------|------|------|-------------|
| `initialize_protocol` | authority | treasury, platform_token_mint, license_lock_amount, withdrawal_fee_bps, referral_fee_share_bps, performance_fee_bps, protocol_fee_share_bps, allowed_dex_programs | One-time global init. Creates `ProtocolConfig` PDA. |
| `update_protocol_config` | authority | treasury?, license_lock_amount?, withdrawal_fee_bps?, referral_fee_share_bps?, performance_fee_bps?, protocol_fee_share_bps? | Update global fees and treasury. See [ADMIN_CONFIGURATION.md](./ADMIN_CONFIGURATION.md). |
| `pause_protocol` | authority | paused: bool | Global emergency pause. |
| `update_staking_tiers` | authority | tier_thresholds[5], tier_discounts_bps[5] | 1VAULT staking fee discount tiers. |
| `update_allowed_dex` | authority | allowed_dex_programs: Vec<Pubkey> | Standard DEX allowlist (max 5). |
| `update_protected_dex` | authority | protected_dex_programs: Vec<Pubkey> | MEV-protected DEX allowlist. |
| `initialize_treasury` | authority | — | Create treasury token ATA for a mint. |

---

## Upgrade Multisig (6)

| Instruction | Auth | Description |
|-------------|------|-------------|
| `initialize_upgrade_multisig` | authority | Create M-of-N multisig config |
| `update_upgrade_multisig` | authority | Change members/threshold |
| `create_upgrade_proposal` | member | Propose program buffer upgrade |
| `approve_upgrade_proposal` | member | Approve proposal (bitmask) |
| `cancel_upgrade_proposal` | member/proposer | Cancel pending proposal |
| `mark_upgrade_executed` | authority | Mark proposal executed after BPF upgrade |

Details: [UPGRADE_MULTISIG.md](./UPGRADE_MULTISIG.md)

---

## Strategist (4)

| Instruction | Auth | Args | Description |
|-------------|------|------|-------------|
| `register_strategist` | strategist | — | Create strategist PDA. |
| `lock_license` | strategist | — | Transfer `license_lock_amount` of **1VAULT** to license vault; create `License`. |
| `unlock_license` | strategist | — | Return locked 1VAULT; requires `active_vault_count == 0`. |
| `register_referral` | user | referrer pubkey | Bind referral relationship. |

---

## Vault (8)

| Instruction | Auth | Args | Description |
|-------------|------|------|-------------|
| `create_vault` | strategist | vault_id, name, performance_fee_bps, VaultRiskParams | Create vault, share mint, fee/risk state. Requires active license. |
| `update_vault` | strategist | name?, performance_fee_bps?, risk? | Update vault metadata and risk. Blocked if Closing/Closed. |
| `pause_vault` | strategist | — | Active → Paused. |
| `resume_vault` | strategist | — | Paused → Active. |
| `initiate_vault_close` | strategist | — | Active/Paused → **Closing**. Requires liquid vault (no positions/stake). |
| `close_vault` | strategist | — | Closing → **Closed**. Requires total_shares=0, empty vault ATA. |
| `update_nav` | anyone | — | Set `total_assets` from vault token ATA balance. |
| `update_vault_staked_value` | strategist | staked_value | Update SOL stake NAV component. |

Vault lifecycle: [VAULT_LIFECYCLE.md](./VAULT_LIFECYCLE.md)

---

## Investor (6)

| Instruction | Auth | Args | Description |
|-------------|------|------|-------------|
| `create_investor_config` | investor | — | Init follow/risk prefs for a vault. |
| `update_investor_config` | investor | InvestorConfigParams | Update follow settings. |
| `follow_on` | investor | — | Enable auto_follow. |
| `follow_off` | investor | — | Disable auto_follow. |
| `deposit` | investor | amount | Transfer base mint → vault; mint shares. Active vault only. |
| `withdraw` | investor | shares | Burn shares; receive base mint minus fee. Allowed in Active/Paused/**Closing**. |

---

## Trading (4)

| Instruction | Auth | Args | Description |
|-------------|------|------|-------------|
| `request_trade` | strategist | trade_id, action, mints, mode, amount, slippage, min_out, dca, tp/sl, linked_position | Create pending trade with validation. |
| `cancel_trade` | strategist | — | Cancel pending trade. |
| `execute_trade` | strategist/keeper | swap_data | CPI to allowlisted DEX; pass Jupiter accounts in `remaining_accounts`. |
| `open_position` | strategist | position_id, entry_value, output_amount | Open position after successful swap. |

---

## Position (5)

| Instruction | Auth | Args | Description |
|-------------|------|------|-------------|
| `increase_position` | strategist | added_value, added_output | Scale in / DCA entry. |
| `reduce_position` | strategist | reduce_bps, proceeds | Partial close. |
| `close_position` | strategist | proceeds | Full close. |
| `update_position_value` | anyone | new_value | Mark-to-market for NAV. |
| `trigger_tp_sl_close` | keeper/strategist | current_value, proceeds | Close when TP/SL threshold met. |

---

## Copy / Follow (8)

| Instruction | Auth | Description |
|-------------|------|-------------|
| `mirror_position` | investor | Manual mirror of strategist position. |
| `auto_mirror_position` | keeper | Auto-follow for investors with auto_follow enabled. |
| `close_investor_position` | investor | Exit mirrored position (respects follow prefs). |
| `sync_investor_position_reduce` | keeper | Sync partial strategist exit to followers. |
| `sync_investor_position_close` | keeper | Sync full exit. |
| `sync_investor_tp_sl` | keeper | Sync TP/SL exit. |
| `update_follower_stats` | strategist/keeper | Update follower count and capital estimate. |
| `record_investor_deposit_stats` | keeper | Track follower deposit stats. |

---

## Accounting (3)

| Instruction | Auth | Description |
|-------------|------|-------------|
| `accrue_fees` | anyone | Accrue performance + protocol fees above HWM. |
| `claim_fees` | strategist | Claim accrued performance fees to strategist wallet. |
| `claim_referral_rewards` | referrer | Claim referral rewards from treasury PDA. |

Formulas: [NAV_FEES_AND_ACCOUNTING.md](./NAV_FEES_AND_ACCOUNTING.md)

---

## Platform Staking (6)

| Instruction | Auth | Args | Description |
|-------------|------|------|-------------|
| `initialize_staking` | authority | — | Create staking pool + vault ATA for **1VAULT**. |
| `init_staker` | user | — | Create personal staker account. |
| `stake_platform` | user | amount, lock_duration_secs | Stake 1VAULT for fee discounts. |
| `unstake_platform` | user | amount | Unstake after lock expires. |
| `claim_staking_reward` | user | — | Claim staking rewards. |
| `fund_staking_rewards` | authority | amount | Fund reward pool. |

Details: [TOKEN_LICENSE_AND_STAKING.md](./TOKEN_LICENSE_AND_STAKING.md)

---

## Risk Engine (3)

| Instruction | Auth | Args | Description |
|-------------|------|------|-------------|
| `init_vault_risk` | strategist | — | Init risk state (also created in create_vault). |
| `update_vault_risk` | strategist | daily_loss_limit_bps?, max_drawdown_bps? | Update risk limits. |
| `reset_vault_risk` | strategist/keeper | — | Reset circuit breaker / daily counters. |

---

## Vault SOL Staking / Yield (7)

Optional yield strategy — **not** the 1VAULT platform staking module.

| Instruction | Auth | Description |
|-------------|------|-------------|
| `init_vault_stake` | strategist | Init stake account for vault SOL |
| `deposit_vault_sol` | strategist | Deposit lamports to vault PDA |
| `stake_vault_sol` | strategist | CPI to Solana stake program |
| `deactivate_vault_stake` | strategist | Deactivate stake account |
| `withdraw_vault_stake` | strategist | Withdraw deactivated stake |
| `sync_vault_stake` | keeper | Sync staked value into NAV |
| `set_vault_yield_strategy` | strategist | Set YieldStrategy enum on vault |

---

## Keepers (2)

| Instruction | Auth | Description |
|-------------|------|-------------|
| `keeper_refresh_vault` | anyone | Refresh NAV / risk from external state |
| `keeper_reset_risk` | anyone | Reset daily risk window |

---

## VaultRiskParams (create_vault / update_vault)

```rust
struct VaultRiskParams {
    description: String,
    strategy_type: StrategyType,      // Momentum, Dca, Arbitrage, Custom
    max_position_bps: u16,
    max_exposure_bps: u16,
    max_open_positions: u8,
    max_slippage_bps: u16,
    mev_mode: MevMode,                // Standard | Protected
    dca_enabled: bool,
    dca_count: u8,
    dca_allocation_bps: u16,
    accepted_mints: Vec<Pubkey>,
    yield_strategy: YieldStrategy,    // None | NativeSolStake
}
```

---

## InvestorConfigParams (update_investor_config)

All fields are `Option<T>` — only provided fields are updated:

`auto_follow`, `allocation_mode`, `position_size`, `max_position_bps`, `max_exposure_bps`, `max_open_positions`, `follow_dca`, `dca_mode`, `dca_allocation_bps`, `follow_partial_exit`, `follow_full_exit`, `follow_tp_sl`, `max_slippage_bps`
