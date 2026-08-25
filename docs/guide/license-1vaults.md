# $1VAULTS licence

**$1VAULTS** is the licence token required to **create** a vault. It is a lock / bond - not a create fee you burn forever.

::: tip Contract address
Token CA will be published here when it is live. Until then, treat the ticker as **$1VAULTS**.
:::

## Spec

| Item | Value |
|------|-------|
| Name | $1VAULTS |
| Ticker | **$1VAULTS** |
| Lock on create | **1,000,000 $1VAULTS** |
| Until | Vault is **Closed** |
| On close | Returned **in full** to your wallet |
| Contract address (CA) | Coming soon |

## Lifecycle

1. Hold enough **$1VAULTS** in the **same** wallet as the extension  
2. Create vault → wizard licence step locks **1,000,000 $1VAULTS**  
3. Park / trade while the vault is Active  
4. Exit positions → **Close vault**  
5. **Unlock $1VAULTS** → full amount back  

## In the extension

Documented end-to-end: [Create vault & lock $1VAULTS](/extension/create-vault-and-lock).

| UI | Behaviour |
|----|-----------|
| Required lock vs Your balance | Shows if you can create |
| **Go to Swap** | Buy $1VAULTS when short |
| **Refresh balance** | Re-read wallet after swap |
| Confirm checkbox | Required before **Create vault** |

## Unlock path

After close: **Vault** tab → **Unlock $1VAULTS**. Details: [Close vault & unlock](/extension/close-vault-and-unlock).

## Why it exists

The lock makes spam vaults costly and ties the strategist to a stake that only frees when the vault is closed properly.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Create without $1VAULTS | Swap first, refresh the licence step |
| Expect unlock while Active | Close the vault first (positions flat) |
| Mix unlock with withdraw SOL | Unlock returns **$1VAULTS**; SOL comes from shares / close |
| Swap into a different wallet | Fund the **same** pubkey as the keyring |

Next: [Create vault & lock](/extension/create-vault-and-lock) / [Close & unlock](/extension/close-vault-and-unlock)
