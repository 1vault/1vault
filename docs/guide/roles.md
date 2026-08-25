# Roles

On 1Vault there are two people around one vault book: the **Strategist** and the **Investor**.

They park into the **same** vault. The strategist decides and signs trades. The vault pays. Investors ride that book with shares - they do not co-sign each swap.

When you verify your wallet with X, the extension asks you to pick **Strategist** or **Investor** as your role label. You can still use both flows with the same keyring (for example create as strategist, or park into someone else’s vault as investor).

---

## Who is the Strategist?

The **Strategist** is the vault operator - the trader who creates the vault, puts skin in the game with **$1VAULTS**, parks SOL, and signs every trade the vault executes.

### Who typically fits

| You are a strategist if… |
|--------------------------|
| You want to run a public trading vault others can park into |
| You are comfortable signing trades and managing open positions |
| You can lock **1,000,000 $1VAULTS** to create, and hold SOL for park + fees |
| You will close the vault cleanly when you are done (flat positions → close → unlock $1VAULTS) |

### What the strategist does

| Action | Why |
|--------|-----|
| Lock **$1VAULTS** and **create** a vault | Opens a book others can join |
| **Park** SOL into that vault | Required before any trade; adds your own weight |
| **Sign** trades (Trade tab / GMGN pill) | Vault inventory pays the market |
| **Exit** positions | Flatten before close |
| **Claim fees** | Collect performance fees when available ([guide](/extension/claim-fees)) |
| **Close** the vault | Settle leftover SOL by share weight for everyone |
| **Unlock $1VAULTS** | Get the licence back in full after close |

### What the strategist does **not** do

- Hold or control investor private keys  
- Guarantee profit  
- Skip the $1VAULTS lock  
- Split close 50/50 with investors (close is **share weight**)  
- Trade with zero park (you must have shares first)  

### Typical path

```text
Create + lock $1VAULTS → Park → Trade → Exit → Close → Unlock $1VAULTS
```

Guides: [Create vault & lock](/extension/create-vault-and-lock) · [Trade](/extension/trade-and-positions) · [Close & unlock](/extension/close-vault-and-unlock)

---

## Who is the Investor?

The **Investor** parks SOL into a **public** vault and rides the shared book. They choose size and timing; they do **not** pick every token or sign the vault’s swaps.

### Who typically fits

| You are an investor if… |
|-------------------------|
| You want exposure to a strategist’s book without running the vault |
| You pick vaults on **Discover** and park what you can afford to risk |
| You may withdraw early, or wait for vault close payout by share weight |
| You do not need $1VAULTS to park ($1VAULTS is for creating vaults) |

### What the investor does

| Action | Why |
|--------|-----|
| Browse **Discover** | Find Active public vaults |
| Review vault detail | NAV, status, strategist, verified badge |
| **Park SOL** | Receive vault **shares** |
| **Ride** | Stay in the book while the strategist trades |
| Set [TP / SL](/investor/tp-sl) where the product shows it | Optional risk controls on your side |
| **Withdraw** shares | Exit early while the vault still allows redeem |
| Receive **close** payout | If the strategist closes, paid by share weight |

### What the investor does **not** do

- Sign the vault’s market swaps  
- Pick every mint the strategist trades (pooled book)  
- Unlock the strategist’s $1VAULTS  
- Close someone else’s vault  
- Custody the vault wallet  

### Typical path

```text
Discover → Park → Ride → Withdraw  OR  wait for Close
```

Guides: [Park into a vault](/investor/park-into-vault) · [TP & SL](/investor/tp-sl) · [Withdraw](/investor/withdraw)

---

## Side by side

| | **Strategist** | **Investor** |
|--|----------------|--------------|
| Creates vault | Yes (locks $1VAULTS) | No |
| Parks into vault | Yes (own vault; required to trade) | Yes (public vaults) |
| Signs trades | Yes | No |
| Needs $1VAULTS to start | Yes, to create | No |
| Can withdraw shares | Yes (own shares) | Yes |
| Closes vault | Yes | No |
| Unlocks $1VAULTS | Yes, after close | No |
| Close payout | By share weight | By share weight |

---

## Who parks where

Both roles park into the **same** vault inventory. Shares track ownership for value and close.

```text
Strategist park  ─┐
                  ├──► same vault book (shared inventory + positions)
Investor park   ─┘
```

Example at close (leftover **9 SOL**):

| Holder | Shares | Payout |
|--------|--------|--------|
| Strategist | 2 | ~1.8 SOL |
| Investor | 8 | ~7.2 SOL |

Not 50/50. More: [Concepts](/guide/concepts#close-by-share-weight).

---

## Which path should you open?

| Goal | Start here |
|------|------------|
| Run a vault and trade | [Quick start - Strategist path](/guide/quick-start#strategist-path-create--trade) |
| Follow a public vault | [Quick start - Investor path](/guide/quick-start#investor-path-park--ride) |
| Understand fees / licence | [Fees](/guide/fees) · [$1VAULTS licence](/guide/license-1vaults) |

Next: [Concepts](/guide/concepts) / [Create vault & lock](/extension/create-vault-and-lock) / [Park into a vault](/investor/park-into-vault)
