# Park SOL

**Park** deposits SOL into a vault and gives you **shares**. Strategist and investor park into the **same** book. Park is **free** (no platform park fee) - you still pay network fees.

## Why the strategist must park

If the strategist has **zero shares**, trades are blocked. Always park (or keep your initial create park) before [Trade](/extension/trade-and-positions).

---

## How to open Park

| From | What happens |
|------|----------------|
| Home → **Park** | Parks into your **selected** vault (title **Park SOL**) |
| Vault detail → **Park SOL** | Parks into that vault (title **Park into vault** for others’ vaults) |
| Discover → detail → Park | Same investor / guest path |

Park is blocked if the vault is not **Active** (for example Closed). Tooltip / message: vault must be Active.

---

## Park tab - step by step

1. Confirm the vault label (name · short address)  
2. Check **Available** SOL  
3. Enter amount, or use presets (**0.1 / 0.5 / 1**) or **Max**  
4. Tap **Park**  
5. Approve signatures when asked  
6. Wait for the processing banner (**Parking SOL…**)  

On success: toast **SOL parked**. Capital / holdings refresh.

### Validation

| Message | Fix |
|---------|-----|
| Amount must be greater than 0 | Enter a positive amount |
| Insufficient balance | Lower amount or add SOL |
| Select a vault first | Pick a vault on Home / Discover |
| Cannot park — vault is … | Choose an **Active** vault |

Leave a little SOL in the wallet for network fees (Max usually keeps a small buffer).

---

## My parks tab

Subcopy: withdraw parked SOL back to your wallet.

| You see | Action |
|---------|--------|
| Rows with parked amount + vault | Tap **Withdraw** on a row |
| Empty | “No parks yet — park SOL from the Park tab.” |
| Locked wallet | “Unlock wallet to view parks.” |

Withdraw details: [Withdraw](/investor/withdraw).

---

## After a successful park

| Check | Where |
|-------|--------|
| **Committed** capital up | Home capital / [pipeline](/extension/capital-pipeline) |
| Shares / holdings updated | Home **Holdings** or vault detail |
| Strategist can trade | [Trade](/extension/trade-and-positions) |
| Investor can ride or withdraw later | [Withdraw](/investor/withdraw) |

If **Incoming** is still high, wait for settlement before assuming full size is ready to trade.

---

## Strategist vs investor

| Role | Typical entry | Same book? |
|------|---------------|------------|
| Strategist | Home → Park on your vault | Yes |
| Investor | Discover → detail → Park | Yes |

Investor walkthrough: [Park into a vault](/investor/park-into-vault).

Next: [Capital pipeline](/extension/capital-pipeline) / [Trade](/extension/trade-and-positions)
