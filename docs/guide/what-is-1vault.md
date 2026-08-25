# What is 1Vault

**1Vault** is a non-custodial **pooled trading vault** on Solana. Tagline: **Capital in Motion**.

## One-liner

Strategist and investor park SOL into the **same vault**. The strategist signs trades. The vault pays. Investor chooses how much to park. When the vault closes, leftover SOL is paid **by share weight** - not an equal split.

## What it is not

| Myth | Reality |
|------|---------|
| “Copy trading bot” | One shared book - not a per-wallet mirror of each fill |
| “They hold your keys” | Non-custodial - you sign; vault funds stay on-chain |
| “50/50 close with the strategist” | Close pays by share weight |
| “Passive yield” | Trading risk - parked SOL can go down |

## Product verbs

| Verb | Meaning |
|------|---------|
| **Park** | Deposit SOL into the vault |
| **Sign** | Strategist authorizes a trade the vault pays for |
| **Ride** | Investor stays in the book while the strategist trades |
| **Close** | Wind down the vault; settle by share weight; return $1VAULTS |

Do **not** treat this as safe, guaranteed, or passive income.

## Brand

| Layer | Copy |
|-------|------|
| Tagline | Capital in Motion |
| Subline | Same vault. Strategist signs. Vault pays. |
| Product line | Park. They trade. You ride. |
| Trust line | Close pays by share weight. Not 50/50. |

## How capital moves

```text
Wallet SOL  →  Park (shares)  →  Vault inventory
                                    ↓
                              Strategist signs trade
                                    ↓
                              Vault pays the market
                                    ↓
                              Positions + value update
                                    ↓
                         Withdraw shares  OR  Close vault
```

## Where you use it

| Surface | Role |
|---------|------|
| **Chrome extension** | Create, park, trade, close, GMGN shortcut |
| **Discover** | Browse public vaults |

Next: [Roles](/guide/roles) / [Concepts](/guide/concepts) / [Install](/extension/install)
