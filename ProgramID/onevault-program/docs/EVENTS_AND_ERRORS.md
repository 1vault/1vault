# Events and Errors

Reference for indexers, frontends, and debugging.

---

## Anchor Events

All events are defined in `programs/1vault/src/events.rs`.

### Protocol & Vault

| Event | Key fields | When emitted |
|-------|------------|--------------|
| `ProtocolInitialized` | authority, treasury, platform_token_mint | After protocol init |
| `VaultCreated` | vault, strategist, vault_id, base_mint, performance_fee_bps | After create_vault |
| `VaultClosingInitiated` | vault, strategist, total_shares, nav | initiate_vault_close |
| `VaultClosed` | vault, strategist | close_vault finalize |

### Investor

| Event | Key fields | When emitted |
|-------|------------|--------------|
| `InvestorDeposit` | vault, investor, amount, shares_minted, nav | deposit |
| `InvestorWithdraw` | vault, investor, shares_burned, gross_amount, net_amount, fee_amount | withdraw |

### Trading & Positions

| Event | Key fields | When emitted |
|-------|------------|--------------|
| `TradeRequested` | vault, trade_id, action, input_mint, output_mint, amount | request_trade |
| `TradeExecuted` | vault, trade_id, received, dex_program | execute_trade |
| `PositionOpened` | vault, position_id, entry_value | open_position |
| `PositionUpdated` | vault, position_id, old_value, new_value | update_position_value |
| `PositionClosed` | vault, position_id, proceeds | close_position |
| `TpSlTriggered` | vault, position_id, trigger, current_value | trigger_tp_sl_close |

### Fees & Referrals

| Event | Key fields | When emitted |
|-------|------------|--------------|
| `FeeAccrued` | vault, performance_fee, protocol_fee, share_price | accrue_fees |
| `ReferralRewardAccrued` | user, referrer, amount | Referral accrual paths |

### Copy Trading

| Event | Key fields | When emitted |
|-------|------------|--------------|
| `InvestorMirrored` | vault, investor, position_id, allocation, auto_by_keeper | mirror / auto_mirror |

### Staking

| Event | Key fields | When emitted |
|-------|------------|--------------|
| `PlatformStaked` | owner, amount, total_staked, tier | stake_platform |
| `PlatformUnstaked` | owner, amount | unstake_platform |
| `VaultSolStaked` | vault, lamports, validator | stake_vault_sol |
| `VaultSolUnstaked` | vault, lamports | withdraw_vault_stake |

### Risk

| Event | Key fields | When emitted |
|-------|------------|--------------|
| `RiskCircuitBreakerTripped` | vault, reason, drawdown_bps | Risk limit breach |

### Upgrade Multisig

| Event | Key fields |
|-------|------------|
| `UpgradeProposalCreated` | multisig, proposal_id, proposer, program_buffer, version_label, expires_at |
| `UpgradeProposalApproved` | multisig, proposal_id, member, approval_count, threshold |
| `UpgradeProposalReady` | multisig, proposal_id, program_buffer, version_label |
| `UpgradeProposalCancelled` | multisig, proposal_id, cancelled_by |
| `UpgradeProposalExecuted` | multisig, proposal_id, program_buffer, version_label |

---

## Parsing Events (TypeScript)

After fetching transaction logs with Anchor:

```typescript
const events = await program.addEventListener("VaultClosingInitiated", (event) => {
  console.log("Vault entering closure:", event.vault.toBase58());
  console.log("Shares outstanding:", event.totalShares.toString());
  console.log("NAV:", event.nav.toString());
});
```

For the off-chain indexer, see `onevault-indexer/src/events.ts` and `parser.ts`.

---

## Error Codes

All errors are in `programs/1vault/src/error.rs` as `OneVaultError`.

### Protocol & Auth

| Code | Message | Typical cause |
|------|---------|---------------|
| `ProtocolPaused` | Protocol is paused | Global pause active |
| `Unauthorized` | Unauthorized | Wrong signer |
| `InvalidFeeConfig` | Invalid fee configuration | Fee bps > 10000 |

### Strategist & License

| Code | Message | Typical cause |
|------|---------|---------------|
| `StrategistAlreadyRegistered` | Strategist already registered | Duplicate register |
| `StrategistNotRegistered` | Strategist not registered | Missing PDA |
| `LicenseAlreadyActive` | License already active | Duplicate lock |
| `LicenseNotActive` | License not active | create_vault without license |
| `InsufficientLicenseBalance` | Insufficient platform token balance | Not enough 1VAULT |
| `ActiveVaultsRemain` | Strategist still has active vaults | unlock_license too early |

### Vault Status

| Code | Message | Typical cause |
|------|---------|---------------|
| `VaultPaused` | Vault is paused | Action requires Active |
| `VaultClosed` | Vault is closed | Withdraw/deposit on closed vault |
| `VaultClosing` | Vault is closing | update_vault during closure |
| `VaultNotClosing` | Vault is not in closing state | close_vault without initiate |
| `VaultNotClosed` | Vault is not closed | Wrong state transition |
| `VaultHasShares` | Vault still has outstanding shares | close_vault before full redeem |
| `VaultHasAssets` | Vault still has assets | Non-zero ATA or staked_value |
| `VaultHasOpenPositions` | Vault still has open positions | initiate/close with positions |
| `VaultHasPendingTrades` | Vault still has pending trades | Trades not cleared |

### Investor

| Code | Message | Typical cause |
|------|---------|---------------|
| `ZeroDeposit` | Deposit amount must be greater than zero | amount = 0 |
| `ZeroWithdraw` | Withdraw amount must be greater than zero | shares = 0 |
| `InsufficientShares` | Insufficient shares | Burn more than balance |
| `InsufficientLiquidity` | Insufficient vault liquidity | Vault ATA < gross withdraw |

### Trading & Risk

| Code | Message |
|------|---------|
| `InvalidTrade` | Invalid trade request |
| `TradeNotPending` | Trade not pending |
| `PositionNotOpen` | Position not open |
| `PositionNotFound` | Position not found |
| `MaxOpenPositions` | Max open positions reached |
| `MaxExposureExceeded` | Max exposure exceeded |
| `MaxPositionExceeded` | Max position size exceeded |
| `SlippageExceeded` | Slippage exceeded |
| `DexNotAllowed` | DEX program not allowed |
| `CircuitBreakerActive` | Risk circuit breaker active |
| `TpSlNotTriggered` | Take profit or stop loss not triggered |

### MEV

| Code | Message |
|------|---------|
| `MevProtectedRouteRequired` | MEV protected route required |
| `StandardRouteRequired` | Standard route required for vault MEV mode |

### Staking

| Code | Message |
|------|---------|
| `StakeLocked` | Stake lock not expired |
| `NothingToClaim` | Nothing to claim |

### Multisig

| Code | Message |
|------|---------|
| `MultisigNotEnabled` | Multisig not enabled |
| `InvalidMultisigConfig` | Invalid multisig configuration |
| `NotMultisigMember` | Not a multisig member |
| `ProposalNotPending` | Proposal not pending |
| `ProposalNotApproved` | Proposal not approved |
| `ProposalExpired` | Proposal expired |
| `AlreadyApproved` | Member already approved |

### General

| Code | Message |
|------|---------|
| `MathOverflow` | Math overflow |
| `InvalidAmount` | Invalid amount |
| `InvalidVaultName` | Invalid vault name |
| `AssetNotAccepted` | Asset mint not accepted by vault |
| `SelfReferral` | Self-referral is not allowed |
| `ReferralAlreadyRegistered` | Referral already registered |

---

## Debugging Tips

1. **Simulate first** — use `anchor simulate` or client `.simulate()` to see exact error code.
2. **Check vault status** — many failures are status-gated (`Active`, `Closing`, etc.).
3. **Fetch ProtocolConfig** — verify pause flag and fee settings.
4. **Verify PDAs** — wrong seeds produce `AccountNotInitialized` or constraint failures.
5. **1VAULT mint mismatch** — license/staking token account mint must equal configured CA.
