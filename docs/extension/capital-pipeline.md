# Capital pipeline

Home estimates how capital sits around the **active vault**: settled vs still in flight.

## Why it matters

A park can show up as **incoming** before it fully settles. The pipeline helps you avoid trading as if every pending park were already spendable inventory.

## Layers (what the numbers mean)

| Layer | Plain meaning |
|-------|----------------|
| **Committed** | Already settled on-chain for this role |
| **Incoming** | Parks still confirming / settling |
| **Mandated** | Amounts you are expected to park (policy / mandates) |
| **Projected** | Estimate if incoming lands |

Breakdown often splits **My Park** (strategist) · **Investor Park** · **Total Park**, plus wallet available.

## Where you see it

| Place | What shows |
|-------|------------|
| Home hero | Compact park stats + Committed / Incoming / Mandated bar |
| Home → **Capital** tab | Fuller pipeline (intents, buying power, breakdown) |
| Vault detail → **Capital** | Park breakdown for that vault |
| Incoming banner | “Capital in motion” when incoming > 0 |

## How to read it

1. Select an active vault on Home  
2. Glance at **My / Investor / Total Park**  
3. If **Incoming** is large, wait for confirms before sizing a big trade  
4. Treat **Projected** as an estimate - after confirm, trust the settled numbers  

### Buying power intuition

```text
What the vault can spend ≈ settled vault assets (+ incoming when counted)
```

Wallet SOL alone is **not** vault buying power.

## Refresh

Pipeline updates when you change vault and while you stay unlocked. After a park, return to Home or reopen Capital if numbers look stale.

## Empty / unavailable

| Message | Meaning |
|---------|---------|
| Select a vault to load capital pipeline | Nothing selected |
| Park breakdown unavailable | Data not ready - retry later |

Next: [Park SOL](/extension/park-and-capital) / [Home & Discover](/extension/home-and-discover) / [Concepts](/guide/concepts)
