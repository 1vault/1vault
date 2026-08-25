# Claim fees

**Claim fees** moves accrued **performance fees** from the vault fee wallet into your (strategist) wallet. It is separate from park, withdraw, close, and unlock $1VAULTS.

Only the **strategist** claims. Investors do not claim fees - their share of book value is through shares / withdraw / close.

## Before you claim

| Need | Why |
|------|-----|
| Unlocked keyring | Signing required |
| Vault selected on **Home** | Vault tools need an active selection |
| Accrued fees | Nothing to claim if the book never beat the high-water mark |

How fees accrue: [Fees](/guide/fees).

---

## Step-by-step

1. Open the side panel and unlock  
2. On **Home**, select the vault you run  
3. Bottom nav → **Vault**  
4. Under **Vault tools**, tap **Claim fees** (CTA: **Claim**)  
5. Approve signatures when asked  
6. Wait for **Claiming fees…**  

On success: toast **Fees claimed**. Wallet / fee balance refresh after confirm.

---

## Claim vs other Vault tools

| Tool | What it does |
|------|----------------|
| **Claim fees** | Collect accrued performance fees |
| **Close vault** | Wind down the book; payout by share weight |
| **Unlock $1VAULTS** | Return licence tokens after the vault is **Closed** |

Claim does **not** close the vault and does **not** unlock $1VAULTS.

---

## When claim is empty or fails

| Symptom | Fix |
|---------|-----|
| Claim does nothing / no fees | Book has not accrued eligible profit above HWM yet |
| Button disabled | Select an Active vault on Home; unlock wallet |
| Flow errors mid-claim | Retry after the previous tx settles; see [Troubleshooting](/extension/troubleshooting) |

---

## Checklist

- [ ] Correct vault selected  
- [ ] You are the strategist for that vault  
- [ ] Fees have accrued (see Fees / HWM)  
- [ ] Claim succeeded - toast **Fees claimed**  

Next: [Fees](/guide/fees) / [Close vault & unlock](/extension/close-vault-and-unlock) / [Vault detail](/extension/vault-detail)
