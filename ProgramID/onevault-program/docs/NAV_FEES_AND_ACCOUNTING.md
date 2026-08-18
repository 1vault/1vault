# NAV, Fees, and Accounting

Formulas and flows for Net Asset Value, share pricing, and fee collection.

---

## NAV Formula

```
NAV = total_assets + position_value + staked_value
```

| Component | Source | Updated by |
|-----------|--------|------------|
| `total_assets` | Liquid base token in vault ATA | `update_nav`, `deposit`, `withdraw`, trade proceeds |
| `position_value` | Sum of open position mark-to-market | `update_position_value`, `open_position`, `close_position` |
| `staked_value` | Vault SOL staking component | `update_vault_staked_value`, `sync_vault_stake` |

Constants:
- `SHARE_PRICE_SCALE = 1_000_000` (6 decimal places for share price math)
- `BPS_DENOMINATOR = 10_000`

---

## Share Price

```
share_price = NAV × SHARE_PRICE_SCALE / total_shares     (if total_shares > 0)
share_price = SHARE_PRICE_SCALE                          (if total_shares == 0)
```

---

## Deposit (Mint Shares)

**First deposit** (`total_shares == 0`):

```
shares_minted = deposit_amount
```

**Subsequent deposits:**

```
shares_minted = deposit_amount × total_shares / NAV
```

After deposit:
- `vault.total_assets += amount`
- `vault.total_shares += shares_minted`
- High-water mark updated if share price increases

---

## Withdraw (Burn Shares)

```
gross_amount = shares × NAV / total_shares

withdrawal_fee = gross_amount × withdrawal_fee_bps / 10_000
                 (reduced by staker fee_discount_bps if staker account provided)

referral_share = withdrawal_fee × referral_fee_share_bps / 10_000  (if referral linked)
treasury_fee   = withdrawal_fee - referral_share

net_amount = gross_amount - withdrawal_fee
```

Transfers:
- `net_amount` → investor base token ATA (from vault ATA)
- `withdrawal_fee` → treasury ATA `["treasury", base_mint]`
- Referral share accrued to `ReferralAccount.claimable_rewards`

After withdraw:
- `vault.total_assets -= gross_amount`
- `vault.total_shares -= shares`

---

## Performance Fees (High-Water Mark)

**Instruction:** `accrue_fees`

Only accrues when share price exceeds `vault.high_water_mark`.

```
price_delta = share_price - high_water_mark
profit_on_nav = total_shares × price_delta / SHARE_PRICE_SCALE

performance_fee = profit_on_nav × vault.performance_fee_bps / 10_000
                  (reduced by strategist staker discount if provided)

protocol_fee = performance_fee × protocol_fee_share_bps / 10_000
strategist_fee = performance_fee - protocol_fee
```

Accrued to `VaultFeeState`:
- `accrued_performance_fees += strategist_fee`
- `accrued_protocol_fees += protocol_fee`

Then `vault.high_water_mark = share_price`.

### Claiming

**Instruction:** `claim_fees` — strategist claims performance fees from vault base token.

Protocol portion claimed separately to treasury (see `accounting_ix.rs` claim path).

---

## Default Fee Values

| Parameter | Constant | Default | Meaning |
|-----------|----------|--------:|---------|
| Withdrawal fee | `DEFAULT_WITHDRAWAL_FEE_BPS` | 50 | 0.5% |
| Referral share of withdrawal fee | `DEFAULT_REFERRAL_FEE_SHARE_BPS` | 2000 | 20% |
| Protocol performance share | `DEFAULT_PROTOCOL_FEE_BPS` | 500 | 5% of perf fee |
| Vault performance fee (typical) | set per vault | 2000 | 20% of profit |
| License lock | `DEFAULT_LICENSE_LOCK_AMOUNT` | 1_000_000 | raw 1VAULT units |

All protocol-level defaults can be overridden at `initialize_protocol` or via `update_protocol_config`.

---

## Fee Update Quick Reference

| Fee type | Who sets | Update method |
|----------|----------|---------------|
| Withdrawal fee (global) | Protocol authority | `update_protocol_config` |
| Referral share (global) | Protocol authority | `update_protocol_config` |
| Protocol perf fee share | Protocol authority | `update_protocol_config` |
| Vault performance fee | Strategist | `update_vault` |
| Staking fee discount | Protocol authority | `update_staking_tiers` |
| License lock amount | Protocol authority | `update_protocol_config` |

See [ADMIN_CONFIGURATION.md](./ADMIN_CONFIGURATION.md) for detailed examples.

---

## Referral Rewards

On withdraw with linked `ReferralAccount`:
- Portion of withdrawal fee added to `claimable_rewards`

**Instruction:** `claim_referral_rewards`  
Transfers from treasury PDA authority to referrer's token ATA.

---

## NAV Sync Best Practices

Keepers should regularly:

1. `update_position_value` for each open position (oracle/mark price)
2. `update_nav` to sync liquid token balance
3. `sync_vault_stake` if vault uses SOL yield
4. `keeper_refresh_vault` (combined helper)
5. `accrue_fees` after NAV increases above HWM

Investors deposit/withdraw using **full NAV** — stale `position_value` causes incorrect share pricing.

---

## Example NAV Scenario

| Field | Value |
|-------|------:|
| total_assets | 600 USDC |
| position_value | 400 USDC |
| staked_value | 0 |
| **NAV** | **1,000 USDC** |
| total_shares | 1,000 |

Share price scale = 1_000_000 → price = 1_000_000 (1.0 USDC/share)

Investor withdraws 100 shares:
```
gross = 100 × 1000 / 1000 = 100 USDC
fee (0.5%) = 0.5 USDC
net = 99.5 USDC
```

---

## Accounting Accounts

| PDA | Purpose |
|-----|---------|
| `["vault_fee", vault]` | Accrued vs claimed fee ledger |
| `["treasury", mint]` | Protocol fee token ATA |
| `["referral", user]` | Referral reward balance |
