# Concepts

Core ideas behind Capital in Motion.

## Shared book

One vault = one shared inventory plus open positions. The strategist signs; the **vault** pays. Investor holds **shares** of that book - not a separate copy of each trade.

## Park and shares

**Park** deposits SOL and gives you vault shares.

- Later parks get shares based on deposit vs current vault value  
- Park and withdraw are **free** on the current product  

## Close by share weight

When the vault closes (after positions are flat):

```text
payout ≈ your shares / all remaining shares × leftover value
```

**Not** a 50/50 split with the strategist.

### Example

| Holder | Shares | Leftover 9 SOL |
|--------|--------|----------------|
| Strategist | 2 | ~1.8 SOL |
| Investor | 8 | ~7.2 SOL |

## $1VAULTS licence

Creating a vault locks **1,000,000 $1VAULTS** until the vault is **Closed**. On close, $1VAULTS returns **in full**. Details: [$1VAULTS licence](/guide/license-1vaults).

## Capital layers (Home)

| Layer | Meaning |
|-------|---------|
| **Committed** | Already parked on-chain |
| **Incoming** | Parks still settling |
| **Mandated** | Amounts you are expected to park |
| **Projected** | Book value including incoming |

More: [Capital pipeline](/extension/capital-pipeline).

## Positions

- **Positions** - open exposure after trades  
- Closing the vault needs **no open positions**  

Next: [Fees](/guide/fees) / [Safety](/guide/safety-and-custody)
