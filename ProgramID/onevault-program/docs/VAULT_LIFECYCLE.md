# Vault Lifecycle

End-to-end flow for creating, operating, and closing a vault — including **returning funds to retail investors** when the strategist closes.

---

## Lifecycle Overview

```
register_strategist
       │
       ▼
  lock_license (1VAULT)
       │
       ▼
  create_vault ─────────────────────────────────────┐
       │                                           │
       ▼                                           │
   Active ◄──► Paused                               │
       │                                           │
       │  deposit / withdraw / trade / follow      │
       │                                           │
       ▼                                           │
 initiate_vault_close                               │
       │                                           │
       ▼                                           │
   Closing ── retail withdraw (redeem all shares) ─┤
       │                                           │
       ▼                                           │
  close_vault (finalize)                            │
       │                                           │
       ▼                                           │
   Closed ── unlock_license ────────────────────────┘
```

---

## Step 1: Strategist Onboarding

| Step | Instruction | Notes |
|------|-------------|-------|
| 1 | `register_strategist` | One-time PDA per wallet |
| 2 | `lock_license` | Locks 1VAULT per `license_lock_amount` |
| 3 | `create_vault` | Requires active license |

Each strategist can operate multiple vaults (unique `vault_id` per vault).

---

## Step 2: Vault Creation

**Instruction:** `create_vault(vault_id, name, performance_fee_bps, risk)`

Creates atomically:
- `Vault` PDA
- `VaultFeeState` PDA
- `VaultRiskState` PDA
- Share mint (SPL, authority = vault PDA)
- Vault base token ATA

Initial status: **`Active`**

---

## Step 3: Normal Operation

### Retail deposits

**Instruction:** `deposit(amount)`  
- Vault must be `Active`
- Mints shares: `shares = amount × total_shares / NAV` (first deposit: 1:1)

### Strategist trading

1. `request_trade` → 2. `execute_trade` → 3. `open_position`  
Vault must be `Active` (`is_operational()`).

### Retail withdrawals

**Instruction:** `withdraw(shares)`  
- Allowed when status is `Active`, `Paused`, or **`Closing`**
- Blocked when `Closed`

### Pause

| Instruction | Transition |
|-------------|------------|
| `pause_vault` | Active → Paused |
| `resume_vault` | Paused → Active |

Paused vaults: no deposits, no trades; withdrawals still work.

---

## Step 4: Vault Closure (Retail Fund Return)

Product requirement: when the strategist closes, **retail investors must be able to get their money back**.

This is implemented as a **two-step close** with a `Closing` status.

### Phase A — Strategist prepares & initiates

**Preconditions before `initiate_vault_close`:**

| Check | Field / state |
|-------|---------------|
| All positions closed | `open_positions_count == 0`, `position_value == 0` |
| No pending trades | `pending_trades_count == 0` |
| SOL stake withdrawn (if used) | `staked_value == 0` |
| Liquid proceeds in vault ATA | Call `update_nav` so `total_assets` matches token balance |

**Instruction:** `initiate_vault_close`  
**Transition:** `Active` or `Paused` → **`Closing`**

**Effects:**
- Emits `VaultClosingInitiated` event (indexer should notify investors)
- Blocks new deposits and trades
- **Withdrawals remain open** for retail

### Phase B — Retail redeems shares

Each investor calls **`withdraw(shares)`** with their full share balance.

```
shares burned → base token transferred from vault ATA → investor wallet
                (minus withdrawal fee → treasury)
```

NAV pricing uses full formula: `total_assets + position_value + staked_value`.

During `Closing`, position and stake values should be zero — NAV equals liquid `total_assets`.

**Keeper/backend recommendation:** Monitor `VaultClosingInitiated` events and notify all share holders to redeem.

### Phase C — Strategist finalizes

**Preconditions for `close_vault`:**

| Check | Requirement |
|-------|-------------|
| Status | Must be `Closing` |
| Shares | `total_shares == 0` |
| Vault ATA | `vault_token_account.amount == 0` |
| Positions / trades / stake | All zero |

**Instruction:** `close_vault`  
**Transition:** `Closing` → **`Closed`**

**Effects:**
- Emits `VaultClosed`
- Decrements `strategist.active_vault_count`

### Phase D — License unlock

When **all vaults** are closed (`active_vault_count == 0`):

**Instruction:** `unlock_license`  
Returns locked 1VAULT to strategist.

---

## Vault Status Reference

| Status | Deposits | Trades | Withdrawals | Strategist can initiate close? |
|--------|:--------:|:------:|:-----------:|:------------------------------:|
| Active | ✅ | ✅ | ✅ | ✅ |
| Paused | ❌ | ❌ | ✅ | ✅ |
| Closing | ❌ | ❌ | ✅ | Already closing |
| Closed | ❌ | ❌ | ❌ | ❌ |

---

## Sequence Diagram (Closure)

```
Strategist          Program              Retail A           Retail B
    │                  │                     │                  │
    │ close positions  │                     │                  │
    │ update_nav       │                     │                  │
    │ initiate_close   │                     │                  │
    │─────────────────▶│ status=Closing      │                  │
    │                  │ emit VaultClosingInitiated             │
    │                  │                     │                  │
    │                  │◀──── withdraw ──────│                  │
    │                  │◀──────── withdraw ──────────────────────│
    │                  │ total_shares=0      │                  │
    │ close_vault      │                     │                  │
    │─────────────────▶│ status=Closed       │                  │
    │ unlock_license   │                     │                  │
    │─────────────────▶│ 1VAULT returned     │                  │
```

---

## Common Errors During Closure

| Error | Cause | Fix |
|-------|-------|-----|
| `VaultHasOpenPositions` | Positions or pending trades remain | Close all positions first |
| `VaultHasAssets` | staked_value > 0 or vault ATA not empty | Unstake SOL; wait for retail withdraw |
| `VaultHasShares` | Retail still holds shares | Investors must withdraw |
| `VaultNotClosing` | Called `close_vault` before initiate | Call `initiate_vault_close` first |
| `VaultClosed` | Withdraw after finalize | Funds already returned or too late |
| `ActiveVaultsRemain` | unlock_license with open vaults | Finalize all vault closes first |

---

## Indexer / Frontend Integration

Subscribe to these events:

| Event | Action |
|-------|--------|
| `VaultClosingInitiated` | Alert all share holders; show "Redeem now" UI |
| `InvestorWithdraw` | Track redemption progress |
| `VaultClosed` | Mark vault archived; disable all actions |

Poll `vault.total_shares` during `Closing` to show progress: `(initial_shares - current) / initial`.

---

## update_vault Restrictions During Close

- `update_vault` blocked when status is `Closing` or `Closed`
- `initiate_vault_close` blocked when already `Closing` or `Closed`

Strategist should finalize risk/fee config **before** initiating closure.
