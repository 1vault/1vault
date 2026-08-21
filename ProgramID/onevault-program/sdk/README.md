# 1Vault TypeScript SDK

Lightweight helpers for **frontend**, **simulator**, and **Devnet scripts** — program ID, PDA derivation, NAV math, and Anchor client examples.

> Run `anchor build` first so `target/idl/onevault.json` exists. Copy IDL to `sdk/idl/` and `simulator/idl/` after program changes.

## Install

```bash
cd ProgramID/onevault-program/sdk
npm install
```

In another app, link relatively:

```json
{
  "dependencies": {
    "@1vault/sdk": "file:../onevault-program/sdk"
  }
}
```

Or copy `constants.ts`, `pda.ts` directly.

## Devnet scripts

| Script | Command | Purpose |
|--------|---------|---------|
| Bootstrap | `npm run bootstrap:devnet` | 1VL mint, `initialize_protocol`, treasuries |
| Create vault | `npm run create-vault:devnet` | Strategist vault on Devnet |
| Product flow | `npm run product-flow:devnet` | End-to-end deposit / follow / trade |
| Fee demo | `npm run fee-demo:devnet` | Accrue + claim performance fee |

`initialize_protocol` args (MVP): `treasury`, `platform_token_mint`, `license_lock_amount`, `performance_fee_bps`, `allowed_dex_programs` — no withdrawal/referral/protocol-share/staking tier args.

## Program ID

```typescript
import { ONEVAULT_PROGRAM_ID } from "./constants";
// 2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP
```

## PDA examples

```typescript
import { PublicKey } from "@solana/web3.js";
import { vaultPda, protocolConfigPda, investorConfigPda } from "./pda";

const strategist = new PublicKey("...");
const [vault] = vaultPda(strategist, 1);
const [protocol] = protocolConfigPda();
const [config] = investorConfigPda(vault, investor);
```

Removed PDAs (pre-strip): `vaultRiskPda`, `referralPda`, `stakingPoolPda`, `stakerPda`.

## Anchor client

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorWallet } from "@coral-xyz/anchor";
import { createOneVaultProgram, fetchVault } from "./client";

const program = createOneVaultProgram(connection, wallet, idl);
const vault = await fetchVault(program, strategist, 1);
```

`withdraw` accounts: `investor`, `protocolConfig`, `vault`, share + token ATAs, `shareMint`, optional `investorConfig`, `tokenProgram`.

`mirror_position` / `auto_mirror_position`: pass `investorShareAccount`; `investorCapital` must equal `investorCapitalFromShares(vault, shareBalance)` (see `investorCapitalBn`).

`open_position`: `entryValue` / `outputAmount` must match `tradeRequest.executedInput` / `executedOutput` after `execute_trade`.

`request_trade`: requires `strategistShareAccount` (strategist must hold vault shares).

## Security upgrade helpers (2026-08)

```typescript
import {
  investorCapitalBn,
  buildMirrorPositionIx,
  buildWithdrawIx,
  openPositionAmountsFromTrade,
  fetchTradeRequest,
} from "@1vault/sdk";
```

## Files

| File | Purpose |
|------|---------|
| `constants.ts` | Program ID, seeds, enums, fee wallets |
| `pda.ts` | PDA derivations + NAV math |
| `idl.ts` | Load IDL from target or sdk/idl |
| `accounts.ts` | Share ATA helpers |
| `client.ts` | Anchor Program factory + tx builders |
| `bootstrap-devnet.ts` | Protocol + treasury bootstrap |
| `idl/onevault.json` | IDL copy (sync from `anchor build`) |

## IDL sync

```powershell
cd ProgramID/onevault-program
anchor build
copy target\idl\onevault.json sdk\idl\
copy target\idl\onevault.json ..\..\simulator\idl\
```

## Full integration guide

[docs/FRONTEND_BACKEND_INTEGRATION.md](../docs/FRONTEND_BACKEND_INTEGRATION.md)
