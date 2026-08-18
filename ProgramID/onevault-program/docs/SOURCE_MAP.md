# Source File Map

Every file under `programs/1vault/` and its purpose.

---

## Program Root

| File | Purpose |
|------|---------|
| `Cargo.toml` | Crate manifest, Anchor/Solana dependencies |
| `tests/onevault.rs` | Unit tests (constants, NAV math, vault closing, TP/SL) |

---

## `src/` Core

| File | Purpose |
|------|---------|
| `lib.rs` | `#[program]` module — all public instructions |
| `constants.rs` | PDA seed bytes, fee defaults, tier defaults, Jupiter/Raydium/Orca program IDs |
| `error.rs` | `OneVaultError` — all revert reasons |
| `events.rs` | Anchor `#[event]` structs for indexers |

---

## `src/state/` — On-Chain Account Layouts

| File | Struct(s) | Description |
|------|-----------|-------------|
| `mod.rs` | Enums: `VaultStatus`, `StrategyType`, `MevMode`, `TradeAction`, etc. | Shared enums |
| `protocol.rs` | `ProtocolConfig` | Global protocol settings |
| `strategist.rs` | `Strategist` | Per-strategist metadata (vault counts) |
| `license.rs` | `License` | Active license record |
| `vault.rs` | `Vault` | Vault state + NAV helpers |
| `fee.rs` | `VaultFeeState` | Accrued performance/protocol fees |
| `risk.rs` | `VaultRiskState` | Daily loss, drawdown, circuit breaker |
| `investor.rs` | `InvestorVaultConfig` | Per-investor follow/risk prefs |
| `position.rs` | `VaultPosition`, `InvestorPosition` | Open/closed positions |
| `trade.rs` | `TradeRequest` | Pending/executed trades |
| `referral.rs` | `ReferralAccount` | Referral rewards |
| `staking.rs` | `StakingPool`, `StakerAccount` | Platform 1VAULT staking |
| `vault_stake.rs` | `VaultStakeState` | Vault native SOL stake metadata |
| `multisig.rs` | `UpgradeMultisig`, `UpgradeProposal` | Program upgrade governance |

---

## `src/instructions/` — Instruction Handlers

| File | Instructions |
|------|----------------|
| `protocol_ix.rs` | `initialize_protocol`, `update_protocol_config`, `pause_protocol`, `update_staking_tiers`, `update_allowed_dex`, `update_protected_dex`, `initialize_treasury` |
| `multisig_ix.rs` | `initialize_upgrade_multisig`, `update_upgrade_multisig`, `create_upgrade_proposal`, `approve_upgrade_proposal`, `cancel_upgrade_proposal`, `mark_upgrade_executed` |
| `strategist_ix.rs` | `register_strategist`, `lock_license`, `unlock_license`, `register_referral` |
| `vault_ix.rs` | `create_vault`, `update_vault`, `pause_vault`, `resume_vault`, `initiate_vault_close`, `close_vault`, `update_nav`, `update_vault_staked_value` |
| `investor_ix.rs` | `create_investor_config`, `update_investor_config`, `follow_on`, `follow_off`, `deposit`, `withdraw` |
| `trading_ix.rs` | `request_trade`, `cancel_trade`, `execute_trade`, `open_position` |
| `position_ix.rs` | `increase_position`, `reduce_position`, `close_position`, `update_position_value`, `trigger_tp_sl_close` |
| `follow_ix.rs` | `mirror_position`, `auto_mirror_position`, `close_investor_position`, `sync_investor_position_reduce`, `sync_investor_position_close`, `sync_investor_tp_sl`, `update_follower_stats`, `record_investor_deposit_stats` |
| `accounting_ix.rs` | `accrue_fees`, `claim_fees`, `claim_referral_rewards` |
| `staking_ix.rs` | `initialize_staking`, `init_staker`, `stake_platform`, `unstake_platform`, `claim_staking_reward`, `fund_staking_rewards` |
| `risk_ix.rs` | `init_vault_risk`, `update_vault_risk`, `reset_vault_risk` |
| `vault_stake_ix.rs` | `init_vault_stake`, `deposit_vault_sol`, `stake_vault_sol`, `deactivate_vault_stake`, `withdraw_vault_stake`, `sync_vault_stake`, `set_vault_yield_strategy` |
| `keeper_ix.rs` | `keeper_refresh_vault`, `keeper_reset_risk` |

---

## `src/utils/`

| File | Purpose |
|------|---------|
| `mod.rs` | `apply_bps`, `apply_discount_bps`, `evaluate_tp_sl`, mirror sizing helpers |

---

## Project Scripts & Config

| Path | Purpose |
|------|---------|
| `Anchor.toml` | Program ID, cluster, provider wallet |
| `scripts/deploy-devnet.ps1` | Devnet build + deploy helper |
| `scripts/set-upgrade-authority-multisig.ps1` | Point upgrade authority to multisig |
| `docs/` | This documentation set |

---

## Instruction Count Summary

| Module | Count |
|--------|------:|
| Protocol | 7 |
| Upgrade multisig | 6 |
| Strategist | 4 |
| Vault | 8 |
| Investor | 6 |
| Trading | 4 |
| Position | 5 |
| Follow / copy | 8 |
| Accounting | 3 |
| Platform staking | 6 |
| Risk | 3 |
| Vault SOL stake | 7 |
| Keepers | 2 |
| **Total** | **69** |
