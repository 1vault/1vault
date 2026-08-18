# 1Vault On-Chain Documentation

Complete developer and operator documentation for the **1Vault** Solana program (`onevault`).

| Item | Value |
|------|-------|
| **Product name** | 1Vault |
| **Crate / module** | `onevault` |
| **Program ID** | `J1EpKCXNJL6JfePvNEkFLRhRRVTFZN46oeatYViqqk3G` |
| **Framework** | Anchor (Rust) |
| **Source root** | `programs/1vault/src/` |
| **TypeScript SDK** | `../sdk/` |
| **IDL (after build)** | `../target/idl/onevault.json` |

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [PROGRAM_ID.md](./PROGRAM_ID.md) | **Program ID, build, IDL sync, keypair** |
| [FRONTEND_BACKEND_INTEGRATION.md](./FRONTEND_BACKEND_INTEGRATION.md) | **Frontend & backend integration** |
| [../sdk/README.md](../sdk/README.md) | TypeScript SDK (PDAs, constants, client) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System overview, modules, user flows, design principles |
| [SOURCE_MAP.md](./SOURCE_MAP.md) | Every source file and what it contains |
| [ACCOUNTS_AND_PDAS.md](./ACCOUNTS_AND_PDAS.md) | On-chain accounts, PDA seeds, state enums |
| [INSTRUCTIONS_REFERENCE.md](./INSTRUCTIONS_REFERENCE.md) | Full catalog of all program instructions |
| [ADMIN_CONFIGURATION.md](./ADMIN_CONFIGURATION.md) | **How to update fees, license lock, DEX lists, tiers, treasury, etc.** |
| [TOKEN_LICENSE_AND_STAKING.md](./TOKEN_LICENSE_AND_STAKING.md) | 1VAULT token CA, license lock, platform staking |
| [VAULT_LIFECYCLE.md](./VAULT_LIFECYCLE.md) | Create → trade → close flow; retail fund return |
| [NAV_FEES_AND_ACCOUNTING.md](./NAV_FEES_AND_ACCOUNTING.md) | NAV math, fee formulas, high-water mark |
| [EVENTS_AND_ERRORS.md](./EVENTS_AND_ERRORS.md) | Anchor events and error codes for indexers |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Build, deploy, bootstrap sequence |
| [LAUNCHPAD_TRADING.md](./LAUNCHPAD_TRADING.md) | Pump.fun pre-bond & any-mint trading |
| [UPGRADE_MULTISIG.md](./UPGRADE_MULTISIG.md) | Program upgrade multisig (Squads integration) |

---

## Quick Start (Operator)

After deploying the program:

1. Launch the **1VAULT SPL token** and note its mint address (CA).
2. Call `initialize_protocol` with the CA as `platform_token_mint`.
3. Call `initialize_treasury` for each base mint used by vaults (e.g. USDC).
4. Call `initialize_staking` with the same 1VAULT CA.
5. Strategists: `register_strategist` → `lock_license` → `create_vault`.

See [ADMIN_CONFIGURATION.md](./ADMIN_CONFIGURATION.md) for every updatable parameter and [DEPLOYMENT.md](./DEPLOYMENT.md) for the full bootstrap checklist.

---

## Related Repositories

| Path | Role |
|------|------|
| `onevault-program/` | This Anchor program (on-chain) |
| `onevault-indexer/` | PostgreSQL indexer + REST API (off-chain Phase 4) |
| `product 1vault.md` | Product specification (source of truth for business rules) |
