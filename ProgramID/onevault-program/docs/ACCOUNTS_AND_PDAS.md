# Accounts and PDAs

All program-derived addresses (PDAs) and their account structs.

---

## PDA Seed Reference

| Seed(s) | Account | Authority / notes |
|---------|---------|-------------------|
| `["protocol"]` | `ProtocolConfig` | Protocol authority |
| `["strategist", strategist_pubkey]` | `Strategist` | Strategist wallet |
| `["license", strategist_pubkey]` | `License` | Closed on unlock |
| `["license_vault", strategist_pubkey]` | Token ATA | Holds locked 1VAULT; authority = `License` PDA |
| `["vault", strategist_pubkey, vault_id_le]` | `Vault` | Vault PDA is share mint authority |
| `["share_mint", vault_pubkey]` | SPL Mint | Vault share token |
| `["vault_fee", vault_pubkey]` | `VaultFeeState` | Fee accrual ledger |
| `["vault_risk", vault_pubkey]` | `VaultRiskState` | Risk / circuit breaker |
| `["vault_stake", vault_pubkey]` | `VaultStakeState` | SOL stake metadata |
| `["vault_stake_account", vault_pubkey]` | Stake account | Native stake program |
| `["investor_config", vault_pubkey, investor_pubkey]` | `InvestorVaultConfig` | Follow settings |
| `["trade", vault_pubkey, trade_id_le]` | `TradeRequest` | Per-trade record |
| `["vault_position", vault_pubkey, position_id_le]` | `VaultPosition` | Strategist position |
| `["investor_position", vault_pubkey, investor_pubkey, position_id_le]` | `InvestorPosition` | Mirrored position |
| `["referral", user_pubkey]` | `ReferralAccount` | Referral rewards |
| `["treasury"]` | UncheckedAccount | Treasury PDA authority |
| `["treasury", mint_pubkey]` | Token ATA | Protocol fee collection per mint |
| `["staking_pool"]` | `StakingPool` | Platform staking |
| `["staking_pool", b"vault"]` | Token ATA | Holds staked 1VAULT |
| `["staker", owner_pubkey]` | `StakerAccount` | Per-user staking record |
| `["upgrade_multisig"]` | `UpgradeMultisig` | Upgrade governance |
| `["upgrade_proposal", multisig_pubkey, proposal_id_le]` | `UpgradeProposal` | Single upgrade vote |

`vault_id`, `trade_id`, `position_id`, `proposal_id` are **little-endian `u64`** byte arrays in seeds.

---

## ProtocolConfig

**PDA:** `["protocol"]`

| Field | Type | Description |
|-------|------|-------------|
| `authority` | Pubkey | Admin signer for protocol updates |
| `treasury` | Pubkey | Off-chain treasury wallet (metadata) |
| `platform_token_mint` | Pubkey | **1VAULT token CA** — license + staking |
| `license_lock_amount` | u64 | Amount of 1VAULT required to lock license |
| `withdrawal_fee_bps` | u16 | Protocol withdrawal fee (basis points) |
| `referral_fee_share_bps` | u16 | Share of withdrawal fee to referrer |
| `performance_fee_bps` | u16 | Default protocol-level performance fee cap reference |
| `protocol_fee_share_bps` | u16 | Share of performance fee to protocol |
| `is_paused` | bool | Global emergency pause |
| `allowed_dex_count` | u8 | Count of standard DEX programs |
| `allowed_dex_programs` | [Pubkey; 5] | Standard route allowlist |
| `protected_dex_count` | u8 | Count of MEV-protected DEX programs |
| `protected_dex_programs` | [Pubkey; 5] | Protected route allowlist |
| `tier_thresholds` | [u64; 5] | 1VAULT stake tiers for fee discount |
| `tier_discounts_bps` | [u16; 5] | Discount per tier (bps) |
| `upgrade_multisig` | Pubkey | Linked multisig account |
| `multisig_enabled` | bool | Whether upgrade multisig is active |
| `bump` | u8 | PDA bump |

---

## Vault

**PDA:** `["vault", strategist, vault_id]`

| Field | Type | Description |
|-------|------|-------------|
| `strategist` | Pubkey | Owner strategist |
| `vault_id` | u64 | Unique ID per strategist |
| `name` | String (max 64) | Display name |
| `description` | String (max 128) | Strategy description |
| `strategy_type` | enum | Momentum, Dca, Arbitrage, Custom |
| `yield_strategy` | enum | None, NativeSolStake |
| `base_mint` | Pubkey | Deposit/withdraw asset mint |
| `accepted_mint_count` | u8 | Trading mint allowlist size |
| `accepted_mints` | [Pubkey; 5] | Mints strategist may trade |
| `share_mint` | Pubkey | Vault share SPL mint |
| `vault_token_account` | Pubkey | Vault base token ATA |
| `total_shares` | u64 | Outstanding share supply |
| `total_assets` | u64 | Liquid base token (NAV component) |
| `position_value` | u64 | Open position mark-to-market |
| `staked_value` | u64 | SOL stake NAV component |
| `high_water_mark` | u64 | Performance fee HWM (share price scale) |
| `performance_fee_bps` | u16 | Vault-level performance fee |
| `status` | VaultStatus | Active, Paused, Closing, Closed |
| `mev_mode` | enum | Standard or Protected |
| `max_position_bps` | u16 | Max single position size |
| `max_exposure_bps` | u16 | Max total exposure |
| `max_open_positions` | u8 | Position count limit |
| `max_slippage_bps` | u16 | Default slippage cap |
| `dca_enabled` | bool | DCA strategy flag |
| `dca_count` | u8 | Planned DCA entries |
| `dca_allocation_bps` | u16 | DCA size per entry |
| `open_positions_count` | u8 | Live open positions |
| `pending_trades_count` | u8 | Pending trade requests |
| `active_followers` | u32 | Follower count estimate |
| `estimated_follower_capital` | u64 | Follower TVL estimate |
| `next_trade_id` | u64 | Trade ID counter |
| `next_position_id` | u64 | Position ID counter |

### Vault helper methods (`state/vault.rs`)

| Method | Returns true when |
|--------|-------------------|
| `is_operational()` | Status == `Active` (trading allowed) |
| `accepts_deposits()` | Status == `Active` |
| `accepts_withdrawals()` | Status != `Closed` |
| `is_liquid_for_close()` | No open positions, pending trades, position_value, or staked_value |

---

## VaultStatus Enum

```rust
enum VaultStatus {
    Active,   // Normal operation
    Paused,   // No deposits/trades; withdrawals allowed
    Closing,  // Strategist initiated closure; retail redeems
    Closed,   // Terminal state
}
```

---

## License

**PDA:** `["license", strategist]`

| Field | Type | Description |
|-------|------|-------------|
| `strategist` | Pubkey | License owner |
| `locked_amount` | u64 | 1VAULT locked at lock time |
| `is_active` | bool | Must be true for `create_vault` |
| `bump` | u8 | PDA bump |

Tokens sit in `["license_vault", strategist]` token account.

---

## StakingPool & StakerAccount

**Pool PDA:** `["staking_pool"]`  
**Vault ATA:** `["staking_pool", b"vault"]`

| StakingPool field | Description |
|-------------------|-------------|
| `platform_token_mint` | Must match `ProtocolConfig.platform_token_mint` |
| `total_staked` | Aggregate staked 1VAULT |
| `reward_per_token` | Reward accumulator |

| StakerAccount field | Description |
|---------------------|-------------|
| `staked_amount` | User's staked 1VAULT |
| `fee_discount_bps` | Current withdrawal/performance fee discount |
| `tier` | Staking tier index (0–4) |
| `lock_duration_secs` | Optional lock period |

---

## VaultFeeState

**PDA:** `["vault_fee", vault]`

Tracks accrued vs claimed performance and protocol fees per vault.

---

## InvestorVaultConfig

**PDA:** `["investor_config", vault, investor]`

Controls auto-follow, allocation mode, per-investor risk caps, DCA/exit preferences.

---

## Deriving PDAs (TypeScript example)

```typescript
import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("J1EpKCXNJL6JfePvNEkFLRhRRVTFZN46oeatYViqqk3G");

function vaultPda(strategist: PublicKey, vaultId: bigint): [PublicKey, number] {
  const idBuf = Buffer.alloc(8);
  idBuf.writeBigUInt64LE(vaultId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), strategist.toBuffer(), idBuf],
    PROGRAM_ID
  );
}
```

---

## Reading On-Chain Config

Use any Solana RPC client or Anchor:

```typescript
const [protocolPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("protocol")],
  PROGRAM_ID
);
const config = await program.account.protocolConfig.fetch(protocolPda);
console.log("1VAULT mint:", config.platformTokenMint.toBase58());
console.log("License lock:", config.licenseLockAmount.toString());
console.log("Withdrawal fee bps:", config.withdrawalFeeBps);
```
