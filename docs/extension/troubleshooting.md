# Troubleshooting

Side-panel messages and what to do. Success toasts disappear after a few seconds; errors stay until you dismiss them (×).

## Create / licence

| Message | Fix |
|---------|-----|
| Not enough $1VAULTS | Swap $1VAULTS into this wallet, refresh the licence step |
| Licence already active | Retry Create, or unlock after closing other vaults |
| Not enough SOL for fees and park | Add SOL |
| Could not read $1VAULTS balance | Unlock, refresh, retry |
| Agree to the terms to continue | Tick the checkbox on step 3 |
| Vault name must be 2–32 characters | Fix the name |

## Park / withdraw

| Symptom | Fix |
|---------|-----|
| Cannot park — vault is Closed / … | Pick an **Active** vault |
| Insufficient balance | Lower amount |
| Select a vault first | Select on Home / Discover |
| No parks yet | Park from the Park tab first |

## Trade / close

| Message | Fix |
|---------|-----|
| Must park first | [Park SOL](/extension/park-and-capital) |
| Vault still has open positions | Exit on **Trade**, then Close |
| Vault is already Closed | Nothing to close |
| Another transaction is still running | Wait or Cancel |
| Slippage / market moved | Retry with different size |

## Unlock $1VAULTS / fees

| Symptom | Fix |
|---------|-----|
| Unlock while vault Active | Close vault first |
| $1VAULTS not visible after unlock | Refresh panel / balance |
| Claim fees fails | Retry when fees have accrued - [Claim fees](/extension/claim-fees) |

## Connect X / verify

| Symptom | Fix |
|---------|-----|
| Connect does nothing | Allow the sign-in window; retry |
| Verify fails | Unlock wallet, confirm address, sign again |
| Badge missing | Verify wallet; refresh Discover |

## GMGN pill

| Symptom | Fix |
|---------|-----|
| No pill | Refresh tab; enable extension; use a Solana token page |
| Panel opens, no token | Paste / pick token on Trade |
| Trade fails after pill | Park + active vault |

## Wallet / network

| Symptom | Fix |
|---------|-----|
| Cannot reach 1Vault | Check network, reload extension, retry |
| Wallet is locked | Unlock |
| Wrong SOL balance | Reopen panel or unlock again |

## General checklist

1. Unlock the keyring  
2. Select the right **Active** vault  
3. Wait out / cancel a stuck processing banner  
4. Reload the extension if the UI looks frozen  
5. When asking for help: vault address + approximate time - **never** your seed  

More: [Safety](/guide/safety-and-custody) / [FAQ](/reference/faq)
