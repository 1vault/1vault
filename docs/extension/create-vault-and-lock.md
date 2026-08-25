# Create vault & lock $1VAULTS

This is the full strategist create path: name the vault, optional X, terms, licence check, then create with **$1VAULTS locked**.

## Before you start

| Need | Why |
|------|-----|
| Unlocked keyring | [Wallet & keyring](/extension/wallet-keyring) |
| SOL | Initial park + network fees |
| **$1VAULTS** | **1,000,000 $1VAULTS** locked on create - [$1VAULTS licence](/guide/license-1vaults) |

Open from **Home → Create**. Step indicator shows **1 · 2 · 3 · 4**.

---

## Step 1 - Name your vault

Subtitle: this name shows on Discover and your vault profile.

| Field | Rules |
|-------|--------|
| **Vault name** | 2–32 characters (example: `Night Runner`) |
| **Type** | **Pooled** (shared book) or **Sliced** (future-style badge; shipping book is pooled) |
| **Initial park (SOL)** | Must be **greater than 0** (default often `0.1`) |

Buttons: **Cancel** · **Next**

| If you see… | Fix |
|-------------|-----|
| Vault name must be 2–32 characters | Shorten or lengthen the name |
| Initial park must be greater than 0 SOL | Enter a positive amount |

---

## Step 2 - X connection (optional)

Linking X helps trust on Discover. You **can create without it**.

| State | What you see |
|-------|----------------|
| Not connected | Prompt to connect + **Connect X** |
| Connected, wallet not verified | **Verify wallet** |
| Connected + verified | Green note that the vault can show as verified, with your handle |

Your shortened wallet address is shown for clarity.

Buttons: **Previous** · **Next** (Next always allowed).

More: [Connect X](/extension/connect-x).

---

## Step 3 - Terms

You see a short summary, for example:

> Creating **{name}** ({type}) with {park} SOL initial park

Bullets cover:

- Risk of losing parked SOL  
- Locking $1VAULTS to create  
- Others may follow the book; close by share weight  
- You are responsible for fees and confirms  
- Licence returns in full when the vault is closed  

Check **I agree to the terms and conditions**, then **Next**.

| If you see… | Fix |
|-------------|-----|
| Agree to the terms to continue | Tick the checkbox |

---

## Step 4 - $1VAULTS licence (required)

Creation **locks** $1VAULTS into the vault. It returns **in full** when the vault is closed.

### Balance panel

| Stat | Meaning |
|------|---------|
| **Required lock** | Usually **1,000,000 $1VAULTS** |
| **Your balance** | $1VAULTS in this wallet (enough = ready, short = warning) |

### Not enough $1VAULTS

1. Read the shortfall message  
2. Tap **Go to Swap** - buy $1VAULTS into the **same** wallet as the extension  
3. Return to the panel → **Refresh balance**  
4. When balance ≥ required, the confirm block appears  

**Create vault** stays disabled until you have enough **and** confirm the lock.

### Enough $1VAULTS

Confirm copy explains:

- You will lock **{amount} $1VAULTS** into this vault  
- **On close, the full locked amount returns to your wallet**  

Check the confirmation box, optionally **Refresh balance**, then **Create vault**.

| If you see… | Fix |
|-------------|-----|
| Could not read $1VAULTS balance | Unlock wallet, refresh, retry |
| Unlock your wallet to check $1VAULTS | Unlock keyring first |

While creating, a processing banner shows (**Creating vault…**). You can **Cancel** if the UI allows.

On success: toast **Vault created**, vault appears under Home, usually selected as active.

---

## What just happened (plain language)

1. Vault is created and listed as yours  
2. **$1VAULTS** is locked for this vault  
3. Your **initial park** SOL is deposited as shares  
4. You can add more park, then trade  

$1VAULTS stays locked until [Close & unlock](/extension/close-vault-and-unlock).

---

## After create - checklist

1. Confirm the vault on **Home → Vaults** (status **Active**)  
2. Check capital / **My Park** looks right  
3. Add size with [Park](/extension/park-and-capital) if needed  
4. Open [Trade](/extension/trade-and-positions) when ready  

---

## If create fails

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Not enough $1VAULTS | Short licence | Swap + refresh step 4 |
| Not enough SOL | Fees + park | Add SOL |
| Licence already active | Another open licence path | Retry; or unlock after closing other vaults |
| Cannot reach 1Vault | Network | Retry later |
| Wallet locked | Keyring locked | Unlock |
| Another transaction running | Concurrent flow | Wait or Cancel |

Next: [Park SOL](/extension/park-and-capital) / [Trade](/extension/trade-and-positions) / [$1VAULTS licence](/guide/license-1vaults)
