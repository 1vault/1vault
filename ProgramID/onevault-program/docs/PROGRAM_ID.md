# Program ID & Build Reference

Single source of truth for the **1Vault on-chain program address** and how to build/sync it.

---

## Canonical Program ID

| Network | Program ID |
|---------|------------|
| **Localnet / Devnet / Mainnet (declared)** | `2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP` |

Defined in:

| File | Location |
|------|----------|
| Rust | `programs/1vault/src/lib.rs` → `declare_id!(...)` |
| Anchor | `Anchor.toml` → `[programs.*].onevault` |
| TypeScript SDK | `sdk/constants.ts` → `ONEVAULT_PROGRAM_ID` |

**Important:** The program only deploys to this address if you hold the matching **program keypair** (`target/deploy/onevault-keypair.json`). The private key must stay secret and backed up.

---

## First-Time Setup (Program Keypair)

### Option A — Use the declared ID (recommended for team)

If the team already has `onevault-keypair.json` for `J1EpKCXN...`:

```powershell
# Place keypair at:
# onevault-program/target/deploy/onevault-keypair.json

anchor keys sync
anchor build
```

### Option B — Generate a new program ID

If you do **not** have the keypair yet:

```powershell
cd onevault-program
.\scripts\sync-program-id.ps1 -GenerateNew
```

This will:

1. Generate `target/deploy/onevault-keypair.json`
2. Run `anchor keys sync` to update `lib.rs` + `Anchor.toml`
3. Print the new Program ID for `sdk/constants.ts`

Then commit the updated ID across Rust + TS + docs.

---

## Build Commands

### Prerequisites

- Rust (see `rust-toolchain.toml`)
- Anchor CLI **1.1.2** (`anchor --version`)
- Solana CLI **Agave 2.x+** with `cargo-build-sbf` (`solana-install init` or full Solana toolchain)

### Build program + IDL + TypeScript types

```powershell
cd onevault-program
anchor build
```

Outputs:

| Artifact | Path | Used by |
|----------|------|---------|
| Program binary | `target/deploy/onevault.so` | Deploy |
| Program keypair | `target/deploy/onevault-keypair.json` | Deploy authority |
| IDL (JSON) | `target/idl/onevault.json` | Frontend, backend, indexer |
| Anchor TS types | `target/types/onevault.ts` | Copy to app or import |

### Run unit tests (no SBF required)

```powershell
cargo test
```

### Deploy devnet

```powershell
.\scripts\deploy-devnet.ps1
```

---

## After Deploy — Verify Program ID

```powershell
solana program show 2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP --url devnet
```

Or in browser: `https://explorer.solana.com/address/2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP?cluster=devnet`

---

## Sync IDL to Frontend / Backend

After every program change:

```powershell
anchor build

# Copy IDL to your apps (adjust paths):
copy target\idl\onevault.json ..\frontend\src\idl\onevault.json
copy target\idl\onevault.json ..\backend\idl\onevault.json
copy target\types\onevault.ts ..\frontend\src\idl\onevault.ts
```

Or symlink in monorepo:

```
frontend/src/idl/onevault.json  →  ../../onevault-program/target/idl/onevault.json
```

---

## Environment Variables (Apps)

```env
# .env.local (frontend) / .env (backend)
NEXT_PUBLIC_ONEVAULT_PROGRAM_ID=2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
```

Use `mainnet-beta` and mainnet RPC for production.

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Program ID mismatch` | Run `anchor keys sync` or `anchor build --ignore-keys` (build only) |
| `no such command: build-sbf` | Install Solana CLI / Agave with SBF toolchain |
| `solana: not recognized` | Add Solana to PATH or use WSL |
| IDL out of date | Re-run `anchor build` and recopy IDL |

---

## Related Docs

- [Frontend & Backend Integration](./FRONTEND_BACKEND_INTEGRATION.md)
- [SDK README](../sdk/README.md)
- [Deployment](./DEPLOYMENT.md)
