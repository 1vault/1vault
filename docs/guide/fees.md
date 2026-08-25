# Fees

What you pay today on 1Vault.

## Fee table

| Event | Fee | Where it goes |
|-------|-----|----------------|
| **Park / deposit** | **0** | - |
| **Withdraw to wallet** | **0** | - |
| **Eligible profit** (above high-water mark) | Performance fee (default **20%**) | To the strategist fee wallet |
| Referral / protocol cut of that fee | **Not in current product** | - |

## What you still pay

- Solana network fees on every signature  
- Market price impact and DEX fees inside the swap  
- Trading PnL on the shared book  

## Performance fee (simple)

1. Vault value rises above the **high-water mark (HWM)**  
2. A performance fee accrues on that **new** eligible profit (default **20%**)  
3. The strategist claims it with **Vault → Claim fees** - walkthrough: [Claim fees](/extension/claim-fees)  

### High-water mark example

HWM stops the strategist from charging **20% twice** on the same profit band.

| Step | Share price | What happens |
|------|-------------|--------------|
| Start | $1.00 | HWM = $1.00 |
| Book runs up | $1.50 | Profit = $0.50 / share → fee **20%** of that band accrues → HWM moves to **$1.50** |
| Pulls back | $1.20 | **No new fee** (below HWM) |
| Recovers to | $1.50 | Still **no new fee** (has not broken HWM) |
| New high | $1.80 | Fee only on the **$1.50 → $1.80** band |

Exact UI numbers are estimates until txs confirm. Investors are not charged a separate “park fee”; performance fee comes out of eligible book profit above HWM.

## Close is not a fee

Closing settles ownership by share weight. That is a payout rule, not a platform close fee.

## Licence is not a fee

Locking **$1VAULTS** is a bond to create a vault. It returns in full when the vault closes. See [$1VAULTS licence](/guide/license-1vaults).

Next: [Claim fees](/extension/claim-fees) / [$1VAULTS licence](/guide/license-1vaults) / [FAQ](/reference/faq)
