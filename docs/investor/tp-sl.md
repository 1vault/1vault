# Take profit & stop loss (investor)

**TP / SL** are optional risk controls on your investor park. They do **not** let you pick tokens - the strategist still signs the shared book. When the product shows TP/SL fields (park or investor settings), you set how far price can move before your side wants out.

## What TP and SL mean

| Control | Idea |
|---------|------|
| **Take profit (TP)** | Prefer to exit / reduce when the book is up enough vs your entry |
| **Stop loss (SL)** | Prefer to exit / reduce when the book is down enough vs your entry |

Values are usually shown in **bps** (basis points): **100 bps = 1%**. Example defaults in product flows: TP **5000** (50%), SL **2500** (25%) - confirm what the UI shows for your build.

## Before you set them

| Check | Why |
|-------|-----|
| You already [parked](/investor/park-into-vault) or are about to | TP/SL attach to your investor side of that vault |
| Vault is **Active** | Closed vaults are winding down |
| You understand this is not a guaranteed fill | Markets move; triggers depend on product / on-chain path |

## Typical path

1. Open the vault on **Discover** → detail → **Park** (or open an existing park)  
2. If the UI shows **Take profit** / **Stop loss** (or TP / SL bps), set your levels  
3. Confirm park / save settings and approve signatures  
4. Ride the book - or [withdraw](/investor/withdraw) manually anytime the vault still allows redeem  

Strategists see aggregated TP/SL context on capital views (for example mandated investor rows). That is informational for the book operator - investors still only control **their** settings.

## What TP/SL do **not** do

- They do not turn 1Vault into per-wallet copy trading  
- They do not replace [Withdraw](/investor/withdraw) if you want out now  
- They do not unlock the strategist’s $1VAULTS  
- They do not guarantee a fill at exact price in a volatile memecoin book  

## Tips

- Start with conservative size, then tune TP/SL  
- Wider SL = more room for noise; tighter SL = earlier exit risk  
- Prefer reading [Safety & custody](/guide/safety-and-custody) before sizing up  

## Common questions

| Question | Answer |
|----------|--------|
| Must I set TP/SL? | No - optional where shown |
| Can I change later? | When the product allows editing investor settings for that vault |
| Strategist closed the vault? | You get close payout by **share weight**; TP/SL no longer matter for a Closed book |

Next: [Park into a vault](/investor/park-into-vault) / [Withdraw](/investor/withdraw) / [Fees](/guide/fees)
