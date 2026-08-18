# Deployment and Bootstrap Guide

Step-by-step guide to deploy the 1Vault program and initialize all required on-chain state.

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Rust + `cargo` | Build program |
| Solana CLI | Deploy, airdrop, config |
| Anchor CLI | Build, deploy, IDL |
| Node.js (optional) | Client scripts / tests |

**Program ID:** `J1EpKCXNJL6JfePvNEkFLRhRRVTFZN46oeatYViqqk3G`  
Defined in `programs/1vault/src/lib.rs` and `Anchor.toml`.

---

## Build

```powershell
cd onevault-program
anchor build
```

Run tests:

```powershell
cargo test
```

---

## Deploy to Devnet

Use the provided script:

```powershell
.\scripts\deploy-devnet.ps1
```

Or manually:

```powershell
solana config set --url devnet
solana airdrop 2
anchor deploy --provider.cluster devnet
```

---

## Bootstrap Sequence (Mainnet / Devnet)

Execute in this order. **Do not skip steps.**

### Phase 0 — Token launch (when ready)

1. Create **1VAULT SPL token** on Solana.
2. Save mint address (CA): `ONEVAULT_MINT`.
3. Mint distribution plan for strategists / staking tests.

> If token is not launched yet, stop here. Deploy the program binary only, then continue after CA exists.

---

### Phase 1 — Protocol core

#### 1.1 `initialize_protocol`

**Signer:** protocol authority (cold wallet / multisig)

| Argument | Recommended | Notes |
|----------|-------------|-------|
| `treasury` | Treasury pubkey | Receives protocol fee metadata |
| `platform_token_mint` | `ONEVAULT_MINT` | **1VAULT CA — permanent** |
| `license_lock_amount` | `1_000_000` | Adjust for token decimals |
| `withdrawal_fee_bps` | `50` | 0.5% |
| `referral_fee_share_bps` | `2000` | 20% of withdrawal fee |
| `performance_fee_bps` | `2000` | Protocol default reference |
| `protocol_fee_share_bps` | `500` | 5% of performance fees |
| `allowed_dex_programs` | `[JUPITER_V6, ...]` | Max 5 |

Creates PDA: `["protocol"]`

#### 1.2 `initialize_treasury` (per base mint)

Repeat for each asset vaults will use (e.g. USDC, wSOL):

```
mint = USDC_MINT
→ creates ["treasury", USDC_MINT] token ATA
```

Required before withdrawals collect fees in that mint.

#### 1.3 Optional: `initialize_upgrade_multisig`

See [UPGRADE_MULTISIG.md](./UPGRADE_MULTISIG.md).

---

### Phase 2 — Platform staking

#### 2.1 `initialize_staking`

**Signer:** protocol authority  
**Critical:** `platform_token_mint` must equal `ProtocolConfig.platform_token_mint`

Creates:
- `["staking_pool"]`
- `["staking_pool", b"vault"]`

---

### Phase 3 — Strategist onboarding (per degen)

| Step | Instruction |
|------|-------------|
| 1 | `register_strategist` |
| 2 | `lock_license` (requires 1VAULT balance ≥ license_lock_amount) |
| 3 | `create_vault(vault_id, name, performance_fee_bps, risk)` |

Each vault gets its own share mint and base token ATA.

---

### Phase 4 — Investor flow

| Step | Instruction |
|------|-------------|
| 1 | `create_investor_config` (optional but recommended) |
| 2 | `deposit` |
| 3 | `follow_on` / mirror settings |
| 4 | `withdraw` when exiting |

---

## Post-Deploy Configuration Updates

All live updates documented in [ADMIN_CONFIGURATION.md](./ADMIN_CONFIGURATION.md).

Quick reference:

```typescript
// Update withdrawal fee to 0.75%
await program.methods.updateProtocolConfig(null, null, 75, null, null, null).rpc();

// Update license lock to 2M raw units
await program.methods.updateProtocolConfig(null, new BN(2_000_000), null, null, null, null).rpc();

// Update staking tiers
await program.methods.updateStakingTiers(thresholds, discounts).rpc();

// Pause protocol
await program.methods.pauseProtocol(true).rpc();
```

---

## Environment Checklist

### Devnet testing (before token launch)

- [ ] Deploy program
- [ ] Create **test SPL mint** as stand-in 1VAULT
- [ ] `initialize_protocol` with test mint
- [ ] `initialize_staking` with test mint
- [ ] Full flow: license → vault → deposit → withdraw → close

### Mainnet production

- [ ] Audit program
- [ ] Launch real 1VAULT token
- [ ] `initialize_protocol` with production CA
- [ ] `initialize_treasury` for all supported base mints
- [ ] `initialize_staking` with production CA
- [ ] Set upgrade authority to multisig
- [ ] Verify Jupiter DEX program ID for target cluster
- [ ] Document authority key custody

---

## Known Program IDs (Reference)

From `constants.rs`:

| Program | Pubkey |
|---------|--------|
| Jupiter v6 | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` |
| Raydium AMM v4 | `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8` |
| Orca Whirlpool | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` |
| Stake program | `Stake11111111111111111111111111111111111111` |

Always verify cluster-specific IDs before mainnet.

---

## Upgrade Path

1. Build new program buffer
2. `create_upgrade_proposal` on multisig
3. Members `approve_upgrade_proposal`
4. Execute BPF upgrade via Squads / CLI
5. `mark_upgrade_executed`

Details: [UPGRADE_MULTISIG.md](./UPGRADE_MULTISIG.md)

---

## Related Projects

| Project | Path | Role |
|---------|------|------|
| Indexer + API | `../onevault-indexer/` | Event indexing, leaderboard |
| Product spec | `../product 1vault.md` | Business requirements |

After deploy, point the indexer RPC at your cluster and ingest events listed in [EVENTS_AND_ERRORS.md](./EVENTS_AND_ERRORS.md).
