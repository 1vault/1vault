# 1Vault TypeScript SDK

Lightweight helpers for **frontend** and **backend** — program ID, PDA derivation, NAV math, and Anchor client examples.

> Run `anchor build` first so `target/idl/onevault.json` exists.

## Install (in your app)

Copy this folder into your monorepo, or reference relatively:

```bash
# From frontend/
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

Link SDK:

```json
{
  "dependencies": {
    "@1vault/sdk": "file:../onevault-program/sdk"
  }
}
```

Or copy `constants.ts`, `pda.ts` directly into your app.

## Program ID

```typescript
import { ONEVAULT_PROGRAM_ID } from "@1vault/sdk";

console.log(ONEVAULT_PROGRAM_ID.toBase58());
// J1EpKCXNJL6JfePvNEkFLRhRRVTFZN46oeatYViqqk3G
```

See [docs/PROGRAM_ID.md](../docs/PROGRAM_ID.md) for build & keypair sync.

## PDA examples

```typescript
import { PublicKey } from "@solana/web3.js";
import { vaultPda, protocolConfigPda, investorConfigPda } from "@1vault/sdk";

const strategist = new PublicKey("...");
const [vault] = vaultPda(strategist, 1);
const [protocol] = protocolConfigPda();
const [config] = investorConfigPda(vault, investor);
```

## Anchor client

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorWallet } from "@coral-xyz/anchor";
import { createOneVaultProgram, fetchVault } from "@1vault/sdk";

const connection = new Connection(process.env.RPC_URL!);
const wallet = new AnchorWallet(Keypair.generate()); // or Phantom adapter

const program = createOneVaultProgram(connection, wallet);
const vault = await fetchVault(program, strategist, 1);
```

## Files

| File | Purpose |
|------|---------|
| `constants.ts` | Program ID, seeds, enums, external program IDs |
| `pda.ts` | All PDA derivations + NAV math |
| `client.ts` | Anchor Program factory + example tx builders |
| `index.ts` | Re-exports |

## IDL sync

After program changes:

```powershell
cd onevault-program
anchor build
```

Copy:

- `target/idl/onevault.json` → your frontend/backend
- `target/types/onevault.ts` → optional typed accounts

## Full integration guide

[docs/FRONTEND_BACKEND_INTEGRATION.md](../docs/FRONTEND_BACKEND_INTEGRATION.md)
