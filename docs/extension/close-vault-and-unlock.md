# Close vault & unlock $1VAULTS

Closing ends the vault as an Active book: settle leftover SOL **by share weight**, return **$1VAULTS** to the strategist, and stop new parks / trades.

## Correct order

```text
1. Exit every open position on Trade
2. Close vault
3. Unlock $1VAULTS
```

Skipping exits fails close. Unlock while the vault is still Active also fails.

---

## Step 1 - Exit positions

1. Open **Trade**  
2. **Exit** each open position  
3. Confirm the list is empty (Home **Positions** should also be clear)  

Details: [Trade & positions](/extension/trade-and-positions).

---

## Step 2 - Close vault

### From Home

Tap **Close** in quick actions (enabled when close is allowed).

### From Vault tab

1. Select the vault on Home  
2. Bottom nav → **Vault**  
3. Under Vault tools → **Close**  

Subcopy: wind down and settle by share weight.

Processing banner: **Closing vault…**  
Success toast: **Vault closed**

### Close payout rule

```text
payout ≈ your shares / all remaining shares × leftover value
```

Example: strategist 2 + investor 8 shares, leftover **9 SOL** → ~**1.8** / ~**7.2**. **Not** 50/50.

### Why Close might be blocked

| Message | What to do |
|---------|------------|
| Vault is already Closed | Nothing to close |
| Vault still has N open position(s) | Exit on Trade first |
| Cannot close this vault right now | Retry later; confirm you are the vault owner |
| Legacy / missing account style message | Use a new vault for new activity |

---

## Step 3 - Unlock $1VAULTS

After the vault is **Closed**:

1. **Vault** tab → **Unlock $1VAULTS**  
2. Approve signatures  
3. Success toast: **$1VAULTS licence unlocked**  

Locked amount (typically **1,000,000 $1VAULTS**) returns **in full** to your wallet. This is separate from SOL close payout.

Details: [$1VAULTS licence](/guide/license-1vaults).

---

## Claim fees (related)

On the same **Vault tools** list you can **Claim fees** anytime fees have accrued - you do not need to close first. Full walkthrough: [Claim fees](/extension/claim-fees).

| Tool | Purpose |
|------|---------|
| **Claim fees** | Collect accrued performance fees to your wallet |
| **Close vault** | Settle the book |
| **Unlock $1VAULTS** | Release licence after close |

Claim is not the same as unlock. Success toast: **Fees claimed**.

---

## Checklist

- [ ] All positions exited on Trade  
- [ ] Close vault succeeded / status Closed  
- [ ] Unlock $1VAULTS confirmed in wallet balance  
- [ ] Investor knows the book no longer accepts parks  

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Close says open positions | Exit all on Trade, refresh |
| Unlock fails while Active | Close first |
| $1VAULTS not visible after unlock | Refresh / reopen panel |
| Fees claim fails | Retry when fees are accrued |

Next: [Create vault & lock](/extension/create-vault-and-lock) / [Troubleshooting](/extension/troubleshooting) / [Fees](/guide/fees)
