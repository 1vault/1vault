# Trade & positions

Strategists open and exit positions from the **Trade** tab. The **vault** pays the market - investor does not co-sign.

## Before you trade

| Check | Why |
|-------|-----|
| Active vault selected on Home | Trade targets that vault |
| You have parked shares | No park → trade blocked |
| Wallet unlocked | You must approve signatures |

---

## Open the Trade tab

| Entry | Result |
|-------|--------|
| Bottom nav → **Trade** | Trade screen |
| Home → **Trade** | Often starts open-position flow |
| [GMGN pill](/extension/instant-trade-terminals) | Opens Trade, may prefill the token |

Header copy names the active vault (for example **Trade with vault**).

---

## Open a position

1. Confirm vault + park  
2. Tap **Open position**  
3. Approve each signature when prompted  
4. Wait for **Opening position…**  
5. Success toast: **Position opened**  

The new row appears under open positions.

### Optional token research

You can paste a token address (for example from GMGN) and run research before you size a trade. Treat it as a helper, not a guarantee.

---

## Exit a position

1. On Trade, find the open position  
2. Tap **Exit**  
3. Approve the flow (**Closing position…**)  
4. Success toast: **Position closed**  

Home → **Positions** is a read-only snapshot. **Exit lives on Trade.**

Exit **all** positions before [Close vault](/extension/close-vault-and-unlock).

---

## Empty states

| Message | Meaning |
|---------|---------|
| No open positions — open one first | Nothing to exit |
| Select a vault on Home | Pick a vault first |

---

## Common issues

| Issue | Fix |
|-------|-----|
| Must park first | [Park SOL](/extension/park-and-capital) |
| Another transaction running | Wait or Cancel on the banner |
| Slippage / market moved | Retry with a different size |
| Wrong vault | Select the correct vault on Home |

---

## After trading

- Check Home **Positions** / vault detail **Positions**  
- Review **History** for recent labels  
- When flat and done: [Close & unlock](/extension/close-vault-and-unlock)  

Next: [Instant trade terminals](/extension/instant-trade-terminals) / [Close vault](/extension/close-vault-and-unlock)
