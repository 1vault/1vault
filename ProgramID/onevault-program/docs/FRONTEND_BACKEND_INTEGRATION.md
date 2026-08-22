# Frontend & Backend Integration Guide

How to connect web apps, mobile clients, and backend services to the **1Vault** program.

> **REST-first (recommended):** Production app and simulator-v2 use the **Go backend** for unsigned tx prep and flows.
> See [backend/docs/FRONTEND_GUIDE.md](../../../backend/docs/FRONTEND_GUIDE.md) for vault types, 1vault Licence (1VL), withdraw bundles, and flow modes.
> This document covers **direct Anchor / PDA** usage when bypassing the backend.

---

## Quick reference

| Item | Value |
|------|-------|
| **Program ID** | `2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP` |
| **IDL** | `target/idl/onevault.json` (after `anchor build`) |
| **TS SDK** | `onevault-program/sdk/` |
| **PDA helpers** | `sdk/pda.ts` |
| **Anchor version** | 1.1.2 (program); client `@coral-xyz/anchor` 0.30+ |

---

## 1. Setup checklist

```
[ ] anchor build  →  generates IDL + types
[ ] Copy IDL to frontend/backend
[ ] Set env ONEVAULT_PROGRAM_ID + RPC URL
[ ] Install @coral-xyz/anchor @solana/web3.js @solana/spl-token
[ ] Import sdk/constants.ts + sdk/pda.ts (or link @1vault/sdk)
```

See [PROGRAM_ID.md](./PROGRAM_ID.md) for build & keypair details.

---

## 2. Environment variables

### Frontend (Next.js / Vite)

```env
NEXT_PUBLIC_ONEVAULT_PROGRAM_ID=2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
```

### Backend (Node / indexer / keeper)

```env
ONEVAULT_PROGRAM_ID=2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_CLUSTER=devnet
KEEPER_KEYPAIR_PATH=./keeper.json
```

---

## 3. Initialize Anchor Program

### Frontend (wallet adapter)

```typescript
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import idl from "@/idl/onevault.json";
import { ONEVAULT_PROGRAM_ID } from "@1vault/sdk";

export function useOneVaultProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();

  if (!wallet.publicKey || !wallet.signTransaction) return null;

  const provider = new AnchorProvider(connection, wallet as any, {
    commitment: "confirmed",
  });

  return new Program(idl as any, provider);
}
```

### Backend (keypair signer)

```typescript
import { Connection, Keypair } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import fs from "fs";
import idl from "./idl/onevault.json";
import { createOneVaultProgram } from "@1vault/sdk";

const connection = new Connection(process.env.SOLANA_RPC_URL!);
const keypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(process.env.KEEPER_KEYPAIR_PATH!, "utf8")))
);
const wallet = new Wallet(keypair);

const program = createOneVaultProgram(connection, wallet, idl as any);
```

---

## 4. Read on-chain state (no tx)

### Protocol config

```typescript
import { protocolConfigPda } from "@1vault/sdk";

const [pda] = protocolConfigPda();
const config = await program.account.protocolConfig.fetch(pda);

console.log({
  platformTokenMint: config.platformTokenMint.toBase58(),
  licenseLockAmount: config.licenseLockAmount.toString(),
  withdrawalFeeBps: config.withdrawalFeeBps,
  isPaused: config.isPaused,
});
```

### Vault + NAV

```typescript
import { vaultPda, calculateNav, calculateSharePrice } from "@1vault/sdk";

const [vaultPk] = vaultPda(strategist, vaultId);
const vault = await program.account.vault.fetch(vaultPk);

const nav = calculateNav({
  totalAssets: vault.totalAssets,
  positionValue: vault.positionValue,
  stakedValue: vault.stakedValue,
});
const sharePrice = calculateSharePrice(nav, BigInt(vault.totalShares.toString()));
```

### Vault status UI mapping

| `vault.status` | UI label | Actions enabled |
|----------------|----------|-----------------|
| `active` | Live | Deposit, withdraw, trade |
| `paused` | Paused | Withdraw only |
| `closing` | Closing — redeem now | Withdraw only |
| `closed` | Closed | None |

---

## 5. Common user flows (transactions)

### Retail: deposit

**Accounts:** see IDL `deposit` — derive PDAs with `sdk/pda.ts`.

```typescript
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { buildDepositIx } from "@1vault/sdk";

const [vaultPk] = vaultPda(strategist, vaultId);
const vault = await program.account.vault.fetch(vaultPk);

const investorAta = getAssociatedTokenAddressSync(vault.baseMint, investor);
const shareMint = vault.shareMint;
const investorShareAta = getAssociatedTokenAddressSync(shareMint, investor);

const tx = await buildDepositIx(program, {
  investor,
  vault: vaultPk,
  amount: new BN(1_000_000),
  investorTokenAccount: investorAta,
  vaultTokenAccount: vault.vaultTokenAccount,
  shareMint,
  investorShareAccount: investorShareAta,
}).rpc();
```

### Retail: withdraw

```typescript
const [protocolConfig] = protocolConfigPda();
const [treasuryAuth] = treasuryAuthorityPda();
const [treasuryAta] = treasuryTokenPda(vault.baseMint);

await program.methods
  .withdraw(new BN(shares))
  .accountsPartial({
    investor,
    protocolConfig,
    vault: vaultPk,
    investorShareAccount: investorShareAta,
    investorTokenAccount: investorAta,
    vaultTokenAccount: vault.vaultTokenAccount,
    shareMint: vault.shareMint,
    treasuryTokenAccount: treasuryAta,
    treasuryAuthority: treasuryAuth,
  })
  .rpc();
```

### Strategist: register → license → create vault

```typescript
// 1. register_strategist
await program.methods.registerStrategist().accountsPartial({ strategist }).rpc();

// 2. lock_license (needs 1VAULT in wallet)
const [license] = licensePda(strategist);
const [licenseVault] = licenseVaultPda(strategist);
// ... pass strategist 1VAULT ATA, platform_token_mint from protocol config

// 3. create_vault
await program.methods
  .createVault(new BN(1), "My Vault", 2000, riskParams)
  .accountsPartial({ strategist, /* vault accounts from IDL */ })
  .rpc();
```

### Launchpad snipe (Pump.fun pre-bond)

```typescript
import { buildLaunchpadBuyRequestIx } from "@1vault/sdk";
import { EXTERNAL_PROGRAMS } from "@1vault/sdk";

// Step 0: ensure vault ATA for meme mint
await program.methods
  .ensureVaultTokenAta()
  .accountsPartial({ payer: strategist, vault: vaultPk, mint: memeMint })
  .rpc();

// Step 1: request_trade (venue = launchpad)
await buildLaunchpadBuyRequestIx(program, {
  strategist,
  vault: vaultPk,
  tradeId: vault.nextTradeId.toNumber(),
  baseMint: vault.baseMint,
  memeMint,
  amount: new BN(solAmount),
  minAmountOut: new BN(minTokens),
}).rpc();

// Step 2: execute_trade — pass Pump.fun ix data + accounts as remainingAccounts
await program.methods
  .executeTrade(pumpBuyInstructionData)
  .accountsPartial({
    strategist,
    dexProgram: EXTERNAL_PROGRAMS.pumpFun,
    vaultInputToken: vaultBaseAta,
    vaultOutputToken: vaultMemeAta,
    // trade_request, vault, license, protocol_config...
  })
  .remainingAccounts(pumpFunAccounts)
  .rpc();
```

Pump.fun account layout changes — build ix off-chain with their SDK or API; program only validates allowlist + CPI.

---

## 6. Backend / indexer patterns

### Parse transaction logs

```typescript
const tx = await connection.getTransaction(signature, {
  maxSupportedTransactionVersion: 0,
});

if (!tx?.meta?.logMessages) return;

// Anchor events appear as "Program data: <base64>"
// Prefer: program.addEventListener in long-running worker
// Or use onevault-indexer (PostgreSQL + REST API)
```

### Event subscriptions (live)

```typescript
import { onVaultClosingInitiated } from "@1vault/sdk";

const subId = onVaultClosingInitiated(program, (e) => {
  // Notify all share holders: vault is closing
  notifyInvestors(e.vault, e.totalShares, e.nav);
});

// cleanup: program.removeEventListener(subId);
```

Key events for backend:

| Event | Use |
|-------|-----|
| `investorDeposit` | TVL, leaderboard |
| `investorWithdraw` | TVL, alerts |
| `vaultClosingInitiated` | Push notification to retail |
| `tradeExecuted` | Trade history |
| `positionOpened` / `positionClosed` | PnL |

Full list: [EVENTS_AND_ERRORS.md](./EVENTS_AND_ERRORS.md)

---

## 7. Error handling

Map Anchor errors to user messages:

```typescript
try {
  await tx.rpc();
} catch (e: any) {
  const code = e?.error?.errorCode?.code;
  switch (code) {
    case "VaultClosed": return "Vault is closed";
    case "InsufficientShares": return "Not enough shares";
    case "DexNotAllowed": return "Trading route not allowed";
    case "ProtocolPaused": return "Protocol maintenance";
    default: throw e;
  }
}
```

---

## 8. Account address cheat sheet

| Account | PDA function |
|---------|--------------|
| Protocol | `protocolConfigPda()` |
| Vault | `vaultPda(strategist, vaultId)` |
| Share mint | `shareMintPda(vault)` |
| Investor config | `investorConfigPda(vault, investor)` |
| Trade request | `tradeRequestPda(vault, tradeId)` |
| License | `licensePda(strategist)` |
| Treasury ATA | `treasuryTokenPda(baseMint)` |

Full table: [ACCOUNTS_AND_PDAS.md](./ACCOUNTS_AND_PDAS.md)

---

## 9. Recommended project structure

```
your-app/
├── src/
│   ├── idl/
│   │   └── onevault.json          ← copy from target/idl after build
│   ├── lib/
│   │   └── onevault/
│   │       ├── program.ts         ← useOneVaultProgram hook
│   │       ├── pdas.ts            ← re-export from @1vault/sdk
│   │       └── transactions/
│   │           ├── deposit.ts
│   │           ├── withdraw.ts
│   │           └── launchpad.ts
│   └── hooks/
│       └── useVaultNav.ts
└── .env.local
```

```
your-backend/
├── idl/onevault.json
├── src/
│   ├── onevault/client.ts
│   ├── keeper/refreshNav.ts
│   └── indexer/parseEvents.ts     ← or use onevault-indexer/
└── .env
```

---

## 10. Devnet vs mainnet

| | Devnet | Mainnet |
|--|--------|---------|
| Program ID | Same declared ID after deploy | Same |
| RPC | `api.devnet.solana.com` | Helius / QuickNode recommended |
| 1VAULT mint | Your test SPL mint | Real token CA |
| Pump.fun | Limited / use mocks | Full support |

Always pass cluster-specific RPC; program ID stays the same if deployed to same keypair address.

---

## Related

- [PROGRAM_ID.md](./PROGRAM_ID.md) — build & deploy
- [sdk/README.md](../sdk/README.md) — SDK package
- [INSTRUCTIONS_REFERENCE.md](./INSTRUCTIONS_REFERENCE.md) — all instructions
- [LAUNCHPAD_TRADING.md](./LAUNCHPAD_TRADING.md) — Pump.fun flow
