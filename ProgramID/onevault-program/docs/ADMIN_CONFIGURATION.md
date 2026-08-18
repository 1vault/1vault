# Admin Configuration Guide

Complete reference for **who can change what**, **which instruction to call**, and **important constraints**.

---

## Configuration Layers

| Layer | Who controls | Scope |
|-------|--------------|-------|
| **Protocol** | `ProtocolConfig.authority` | Global fees, license amount, DEX, staking tiers |
| **Vault** | Vault strategist | Per-vault performance fee, risk params, name |
| **Investor** | Each investor | Follow settings, personal risk caps |
| **Staking pool** | Set once at init | 1VAULT mint binding |

---

## Master Table: All Updatable Parameters

| Parameter | Storage location | Set at init | Update instruction | Updater | Notes |
|-----------|------------------|-------------|-------------------|---------|-------|
| **1VAULT token CA** | `ProtocolConfig.platform_token_mint` | `initialize_protocol` | ❌ **Not updatable** | — | Wait for token launch before init, or add future instruction |
| **Treasury wallet** | `ProtocolConfig.treasury` | `initialize_protocol` | `update_protocol_config` | Authority | Metadata pubkey |
| **License lock amount** | `ProtocolConfig.license_lock_amount` | `initialize_protocol` | `update_protocol_config` | Authority | Only affects **new** `lock_license` calls |
| **Withdrawal fee** | `ProtocolConfig.withdrawal_fee_bps` | `initialize_protocol` | `update_protocol_config` | Authority | Default: 50 bps (0.5%) |
| **Referral fee share** | `ProtocolConfig.referral_fee_share_bps` | `initialize_protocol` | `update_protocol_config` | Authority | Default: 2000 bps (20% of fee) |
| **Protocol performance fee share** | `ProtocolConfig.protocol_fee_share_bps` | `initialize_protocol` | `update_protocol_config` | Authority | Share of performance fees to protocol |
| **Default performance fee** | `ProtocolConfig.performance_fee_bps` | `initialize_protocol` | `update_protocol_config` | Authority | Reference default; vaults set own |
| **Staking tier thresholds** | `ProtocolConfig.tier_thresholds[5]` | `initialize_protocol` | `update_staking_tiers` | Authority | 1VAULT amounts per tier |
| **Staking tier discounts** | `ProtocolConfig.tier_discounts_bps[5]` | `initialize_protocol` | `update_staking_tiers` | Authority | Fee discount per tier |
| **Standard DEX allowlist** | `ProtocolConfig.allowed_dex_programs` | `initialize_protocol` | `update_allowed_dex` | Authority | Max 5 programs |
| **Protected DEX allowlist** | `ProtocolConfig.protected_dex_programs` | `initialize_protocol` | `update_protected_dex` | Authority | MEV-protected routes |
| **Protocol pause** | `ProtocolConfig.is_paused` | — | `pause_protocol` | Authority | Blocks most user actions |
| **Treasury token ATA** | PDA `["treasury", mint]` | `initialize_treasury` | Create per mint | Authority | Once per base mint |
| **Staking pool mint** | `StakingPool.platform_token_mint` | `initialize_staking` | ❌ **Not updatable** | — | Must match protocol mint |
| **Vault performance fee** | `Vault.performance_fee_bps` | `create_vault` | `update_vault` | Strategist | Per vault |
| **Vault risk params** | `Vault.*` risk fields | `create_vault` | `update_vault` | Strategist | Not when Closing/Closed |
| **Vault daily loss limit** | `VaultRiskState.daily_loss_limit_bps` | `create_vault` | `update_vault_risk` | Strategist | Default 500 bps |
| **Vault max drawdown** | `VaultRiskState.max_drawdown_bps` | `create_vault` | `update_vault_risk` | Authority or strategist* | Default 2000 bps |
| **Upgrade multisig members** | `UpgradeMultisig` | `initialize_upgrade_multisig` | `update_upgrade_multisig` | Multisig authority | See UPGRADE_MULTISIG.md |

\*Check `risk_ix.rs` for signer requirements on `update_vault_risk`.

---

## 1. Updating Protocol Fees

### Withdrawal fee

**Instruction:** `update_protocol_config`  
**Signer:** protocol authority  
**Argument:** `withdrawal_fee_bps: Some(<value>)`

- Unit: basis points (100 bps = 1%)
- Max: 10_000 bps (100%)
- Default: `50` (0.5%)
- Applies to all future `withdraw` calls immediately

```typescript
await program.methods
  .updateProtocolConfig(
    null,           // treasury
    null,           // license_lock_amount
    75,             // withdrawal_fee_bps → 0.75%
    null,           // referral_fee_share_bps
    null,           // performance_fee_bps
    null            // protocol_fee_share_bps
  )
  .accounts({ authority, protocolConfig })
  .rpc();
```

Pass `null` for fields you do **not** want to change (Anchor `Option`).

### Referral fee share

Changes what percentage of the **withdrawal fee** goes to the referrer (rest goes to treasury ATA).

**Argument:** `referral_fee_share_bps: Some(2500)` → 25% of withdrawal fee to referrer.

### Protocol share of performance fees

**Argument:** `protocol_fee_share_bps: Some(500)` → protocol takes 5% of accrued performance fee.

---

## 2. Updating License Lock Amount

**Instruction:** `update_protocol_config`  
**Argument:** `license_lock_amount: Some(<amount>)`

| Topic | Detail |
|-------|--------|
| Default | `1_000_000` (raw token units — depends on 1VAULT decimals) |
| Effect | Only **`lock_license`** calls after the update use the new amount |
| Existing licenses | **Not affected** — `License.locked_amount` is fixed at lock time |
| To change existing lock | Strategist must `unlock_license` (no active vaults) and `lock_license` again |

**Example:** 1VAULT has 6 decimals → `1_000_000` raw = 1.0 token.

```typescript
// Require 2,000,000 raw units (2 tokens with 6 decimals)
await program.methods
  .updateProtocolConfig(null, new BN(2_000_000), null, null, null, null)
  .accounts({ authority, protocolConfig })
  .rpc();
```

---

## 3. Setting the 1VAULT Token CA

### Current behavior

The 1VAULT mint address is stored in:

1. `ProtocolConfig.platform_token_mint` — via **`initialize_protocol`**
2. `StakingPool.platform_token_mint` — via **`initialize_staking`**

There is **no on-chain instruction** to change the mint after initialization.

### Recommended workflow (token not launched yet)

```
1. Deploy program
2. Launch 1VAULT SPL token → obtain mint CA
3. initialize_protocol(platform_token_mint: CA)
4. initialize_staking(platform_token_mint: CA)  // same CA
5. Open license + staking to users
```

### If you must deploy before token launch

Options:

- **A (recommended):** Do not call `initialize_protocol` until CA exists.
- **B:** Deploy program only; init protocol later when CA is ready.
- **C (future):** Add `set_platform_token_mint` one-time instruction (not implemented yet).

### Where license/staking read the CA

| Instruction | Validation |
|-------------|------------|
| `lock_license` | `strategist_token_account.mint == protocol_config.platform_token_mint` |
| `stake_platform` | `owner_token.mint == staking_pool.platform_token_mint` |
| `create_vault` | Requires active `License` (1VAULT already locked) |

---

## 4. Updating Staking Fee-Discount Tiers

**Instruction:** `update_staking_tiers`  
**Signer:** protocol authority

**Arguments:**
- `tier_thresholds: [u64; 5]` — minimum staked 1VAULT per tier
- `tier_discounts_bps: [u16; 5]` — fee discount at each tier

**Defaults** (from `constants.rs`):

| Tier | Threshold (raw units) | Discount (bps) | Discount % |
|------|----------------------:|---------------:|-----------:|
| 0 | 0 | 0 | 0% |
| 1 | 100_000 | 1_000 | 10% |
| 2 | 500_000 | 2_500 | 25% |
| 3 | 1_000_000 | 5_000 | 50% |
| 4 | 5_000_000 | 7_500 | 75% |

Discount applies to:
- Withdrawal fees (if investor passes `staker` account)
- Performance fees on `accrue_fees` (if strategist passes `staker` account)

**Note:** Changing tiers does not retroactively recompute existing `StakerAccount.fee_discount_bps` until the user stakes again or you add a refresh instruction.

---

## 5. Updating DEX Allowlists

### Standard routes (MevMode::Standard vaults)

**Instruction:** `update_allowed_dex`  
**Argument:** `allowed_dex_programs: Vec<Pubkey>` (max 5)

Default reference IDs in `constants.rs`:
- Jupiter v6: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`
- Raydium AMM v4: `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8`
- Orca Whirlpool: `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc`

### Protected routes (MevMode::Protected vaults)

**Instruction:** `update_protected_dex`  
**Argument:** `protected_dex_programs: Vec<Pubkey>` (max 5)

`execute_trade` validates the DEX program against the list matching the vault's `mev_mode`.

---

## 6. Emergency Protocol Pause

**Instruction:** `pause_protocol(paused: bool)`  
**Signer:** authority

When `is_paused == true`:
- Most instructions check `!protocol_config.is_paused` and fail with `ProtocolPaused`
- Use for incidents; unpause with `pause_protocol(false)`

---

## 7. Per-Vault Configuration (Strategist)

**Instruction:** `update_vault`  
**Signer:** vault strategist  
**Blocked when:** vault status is `Closing` or `Closed`

| Argument | Field updated |
|----------|---------------|
| `name: Some("...")` | Vault display name |
| `performance_fee_bps: Some(1500)` | Vault performance fee (15%) |
| `risk: Some(VaultRiskParams { ... })` | Description, strategy type, exposure limits, accepted mints, MEV mode, yield strategy |

### Vault performance fee vs protocol performance fee

- **`Vault.performance_fee_bps`** — charged on profit above high-water mark for **this vault** (set by strategist at create/update).
- **`ProtocolConfig.performance_fee_bps`** — stored at protocol level as default/reference; vault fee is independent per vault.

---

## 8. Per-Vault Risk Limits

**Instruction:** `update_vault_risk`  
**Arguments:**
- `daily_loss_limit_bps: Option<u16>` — default 500 (5%)
- `max_drawdown_bps: Option<u16>` — default 2000 (20%)

**Reset daily counters:** `reset_vault_risk` or keeper `keeper_reset_risk`.

**Circuit breaker:** When limits exceeded, `VaultRiskState.circuit_breaker_active = true` and trades are blocked until reset logic runs.

---

## 9. Treasury Token Accounts

Withdrawal fees and protocol fee claims go to treasury ATAs.

**Instruction:** `initialize_treasury`  
**Once per mint** (e.g. USDC, wSOL):

```
Accounts: authority, protocol_config, mint, treasury_authority, treasury_token_account
PDA: ["treasury", mint]
```

Call before vaults using that base mint accept withdrawals.

---

## 10. Configuration Change Checklist

### Before mainnet launch

- [ ] Set correct `platform_token_mint` (1VAULT CA)
- [ ] Set `license_lock_amount` for desired USD/token equivalent
- [ ] Set withdrawal and performance fees
- [ ] Configure staking tiers
- [ ] Add Jupiter (and backup DEX) to allowlists
- [ ] `initialize_treasury` for each supported base mint
- [ ] `initialize_staking` with same 1VAULT CA
- [ ] Optional: `initialize_upgrade_multisig`

### After launch (live updates)

| Goal | Action |
|------|--------|
| Raise withdrawal fee | `update_protocol_config` |
| Change license requirement for new strategists | `update_protocol_config` → `license_lock_amount` |
| Add new DEX | `update_allowed_dex` / `update_protected_dex` |
| Adjust staking discounts | `update_staking_tiers` |
| Pause protocol | `pause_protocol(true)` |
| Strategist changes vault fee | `update_vault` |

---

## 11. What Cannot Be Changed On-Chain (Today)

| Item | Workaround |
|------|------------|
| `platform_token_mint` after init | Wait for CA before init; or program upgrade |
| `StakingPool.platform_token_mint` after init | Init staking only after CA known |
| Existing `License.locked_amount` | Unlock + re-lock |
| Vault `base_mint` / `share_mint` | Create new vault |
| Program ID | Redeploy new program |

---

## 12. Authority Rotation

To rotate protocol authority today: **requires a program upgrade** or adding a dedicated `transfer_authority` instruction (not present). Document your multisig custody of the authority key.

For upgrade governance see [UPGRADE_MULTISIG.md](./UPGRADE_MULTISIG.md).
