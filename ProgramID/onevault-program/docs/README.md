# 1Vault On-Chain Documentation

Developer and operator documentation for the **1Vault** Solana program (`onevault`).

| Item | Value |
|------|-------|
| **Product name** | 1Vault |
| **Crate / module** | `onevault` |
| **Program ID** | `2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP` |
| **Framework** | Anchor (Rust) |
| **Source root** | `programs/1vault/src/` |
| **TypeScript SDK** | `../sdk/` |
| **IDL (after build)** | `../target/idl/onevault.json` |

> **MVP note:** Several docs below were written for the pre-strip program (referral, staking, risk, DCA, MEV). For the current instruction set and account layouts, prefer **[../README.md](../README.md)**, the IDL, and `programs/1vault/src/`.

---

## Documentation index

| Document | Description |
|----------|-------------|
| [PROGRAM_ID.md](./PROGRAM_ID.md) | Program ID, build, IDL sync, keypair |
| [FRONTEND_BACKEND_INTEGRATION.md](./FRONTEND_BACKEND_INTEGRATION.md) | Frontend & backend integration |
| [../sdk/README.md](../sdk/README.md) | TypeScript SDK |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System overview *(may reference removed modules)* |
| [ACCOUNTS_AND_PDAS.md](./ACCOUNTS_AND_PDAS.md) | Accounts & PDAs *(verify against IDL)* |
| [INSTRUCTIONS_REFERENCE.md](./INSTRUCTIONS_REFERENCE.md) | Full ix catalog *(pre-strip; ~69 → ~47 MVP)* |
| [ADMIN_CONFIGURATION.md](./ADMIN_CONFIGURATION.md) | Admin params *(tiers/referral fees removed)* |
| [VAULT_LIFECYCLE.md](./VAULT_LIFECYCLE.md) | Create → trade → close |
| [NAV_FEES_AND_ACCOUNTING.md](./NAV_FEES_AND_ACCOUNTING.md) | NAV & fees *(no `staked_value` in NAV)* |
| [EVENTS_AND_ERRORS.md](./EVENTS_AND_ERRORS.md) | Events & errors for indexers |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Build, deploy, bootstrap |
| [LAUNCHPAD_TRADING.md](./LAUNCHPAD_TRADING.md) | Launchpad trading |
| [UPGRADE_MULTISIG.md](./UPGRADE_MULTISIG.md) | Upgrade multisig |

---

## Quick start (operator, MVP)

After deploying the program:

1. Launch the **1VAULT SPL token** and note its mint (CA).
2. Call `initialize_protocol` with treasury, CA, `license_lock_amount`, `performance_fee_bps`, and DEX allowlist.
3. Call `initialize_treasury` for each base mint (e.g. wSOL).
4. Strategists: `register_strategist` → `lock_license` → `create_vault` (locks 1M 1VL into `vault_license`).

Or use `sdk/bootstrap-devnet.ts` on Devnet.

**No longer required:** `initialize_staking`, `init_vault_risk`, referral registration.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full checklist.

---

## Related paths

| Path | Role |
|------|------|
| `onevault-program/` | Anchor program (on-chain MVP) |
| `onevault-indexer/` | PostgreSQL indexer + REST API |
| `simulator/` | Devnet workflow UI |
