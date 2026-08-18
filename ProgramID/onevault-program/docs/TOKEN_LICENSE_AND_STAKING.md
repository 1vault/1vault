# Token, License, and Platform Staking

How the **1VAULT platform token** is used for strategist licensing and investor/strategist fee discounts.

---

## Overview

| Feature | Token | Module |
|---------|-------|--------|
| Strategist license (required to create vaults) | **1VAULT SPL** | `strategist_ix.rs` |
| Platform staking (fee discounts) | **1VAULT SPL** | `staking_ix.rs` |
| Vault deposits / shares | Vault base mint (USDC, etc.) | `investor_ix.rs` |

**No native SOL** is locked for license or platform staking. SOL is only used for account rent and the separate optional vault yield module.

---

## 1VAULT Token CA (Contract Address)

The mint address is **not hardcoded** in the program. It is configured at runtime:

| Storage | Set by | Updatable? |
|---------|--------|------------|
| `ProtocolConfig.platform_token_mint` | `initialize_protocol` | ❌ No (currently) |
| `StakingPool.platform_token_mint` | `initialize_staking` | ❌ No (currently) |

### When you launch the token

1. Deploy/create the 1VAULT SPL token on Solana.
2. Copy the **mint public key** (this is the CA).
3. Pass it to `initialize_protocol` as `platform_token_mint`.
4. Pass the **same CA** to `initialize_staking`.

```typescript
const ONEVAULT_MINT = new PublicKey("YOUR_CA_HERE");

await program.methods
  .initializeProtocol(
    treasuryPubkey,
    ONEVAULT_MINT,
    new BN(1_000_000),  // license_lock_amount
    50,                  // withdrawal_fee_bps
    2000,                // referral_fee_share_bps
    2000,                // performance_fee_bps
    500,                 // protocol_fee_share_bps
    [JUPITER_V6_PROGRAM_ID]
  )
  .accounts({ ... })
  .rpc();
```

---

## Strategist License Flow

### Prerequisites

- Protocol initialized with valid `platform_token_mint`
- Strategist registered (`register_strategist`)
- Strategist wallet holds ≥ `license_lock_amount` of 1VAULT

### lock_license

```
Strategist wallet (1VAULT ATA)
        │
        │ transfer license_lock_amount
        ▼
["license_vault", strategist] token ATA  (authority: License PDA)
        │
        ▼
License PDA created: is_active = true, locked_amount = amount
```

**Accounts:** strategist, protocol_config, strategist_account, license (init), strategist_token_account, license_token_vault (init), platform_token_mint, token_program

**Errors:**
- `InsufficientLicenseBalance` — not enough 1VAULT
- `LicenseAlreadyActive` — license PDA already exists

### create_vault gate

```rust
constraint = license.is_active @ OneVaultError::LicenseNotActive
```

Without an active license, strategists cannot create vaults.

### unlock_license

Requirements:
- `strategist_account.active_vault_count == 0` (all vaults finalized closed)
- License is active

Returns full `locked_amount` to strategist 1VAULT ATA. Closes license account.

---

## License Lock Amount

| Setting | Location | Default |
|---------|----------|---------|
| Required lock | `ProtocolConfig.license_lock_amount` | `1_000_000` raw units |

**Update for new strategists:** `update_protocol_config(license_lock_amount: Some(new_amount))`

**Important:** Existing licenses keep their original `License.locked_amount` until unlock + re-lock.

### Decimals example

| Token decimals | `1_000_000` raw equals |
|----------------|------------------------:|
| 6 | 1.0 1VAULT |
| 9 | 0.001 1VAULT |

Always confirm decimals when setting `license_lock_amount`.

---

## Platform Staking Flow

Separate from license — any user can stake 1VAULT for **fee discounts**.

### initialize_staking (once)

Creates:
- `StakingPool` at `["staking_pool"]`
- Token vault at `["staking_pool", b"vault"]` holding staked 1VAULT

Must use the **same mint** as `ProtocolConfig.platform_token_mint`.

### User flow

```
1. init_staker          → create StakerAccount PDA
2. stake_platform       → transfer 1VAULT to staking vault
3. (optional) unstake_platform  → after lock_duration_secs
4. claim_staking_reward → claim funded rewards
```

### Fee discount tiers

Configured in `ProtocolConfig`:

| Tier | Default threshold | Default discount |
|------|------------------:|-----------------:|
| 0 | 0 | 0% |
| 1 | 100,000 | 10% |
| 2 | 500,000 | 25% |
| 3 | 1,000,000 | 50% |
| 4 | 5,000,000 | 75% |

Update via `update_staking_tiers`.

### Where discount applies

| Instruction | How staker is linked |
|-------------|---------------------|
| `withdraw` | Optional `staker` account on investor — reduces withdrawal fee |
| `accrue_fees` | Optional `staker` account on strategist — reduces performance fee |

---

## fund_staking_rewards

Protocol authority deposits 1VAULT into the reward pool for stakers to claim via `claim_staking_reward`.

---

## Comparison: Platform Staking vs Vault SOL Staking

| | Platform staking | Vault SOL staking |
|--|------------------|-------------------|
| **Token** | 1VAULT SPL | Native SOL |
| **Purpose** | Fee discounts for users | Vault yield / NAV boost |
| **Module** | `staking_ix.rs` | `vault_stake_ix.rs` |
| **Who** | Any platform user | Per-vault strategist |
| **Required?** | No | No (YieldStrategy::None default) |

Do not confuse these two modules.

---

## Pre-Launch Checklist (Token)

- [ ] Create 1VAULT SPL mint (fixed supply or mint authority plan documented)
- [ ] Record mint CA securely
- [ ] Distribute test tokens on devnet for license/staking QA
- [ ] Call `initialize_protocol` with CA (not before CA exists unless using test mint)
- [ ] Call `initialize_staking` with same CA
- [ ] Verify `lock_license` and `stake_platform` against devnet mint
- [ ] Set production `license_lock_amount` based on token decimals and target USD value
