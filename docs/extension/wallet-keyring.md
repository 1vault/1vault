# Wallet & keyring

Your signing key lives in a local **encrypted keyring** inside the extension - on this device, behind your password.

## First-time setup

When you open the panel with no keyring yet:

1. You see **Import wallet key**  
2. Paste your Solana secret key (JSON / base58 / hex - follow the field)  
3. Choose a password (**at least 8 characters**)  
4. Tap **Create keyring**  

On success you get a short confirmation, then the unlock screen.

::: tip
Use a dedicated trading wallet. Do not import a cold-storage seed you cannot afford to risk on a browser device.
:::

## Unlock

1. Enter your password  
2. Tap **Unlock**  

After unlock, the header shows your wallet (short address) and available SOL when loaded.

## Lock

From the account menu (when signed in with X) or **Settings**:

- Tap **Lock wallet**  
- Signing stops until you unlock again  

Do this on shared machines.

## Account chip (top left)

| What you see | Meaning |
|--------------|---------|
| Display name or “Not signed in” | X session vs wallet-only |
| Short wallet address | Your keyring pubkey |
| Role (Strategist / Investor) | After you verify wallet with X |

## Account menu (after Connect X)

| Item | What it does |
|------|----------------|
| Wallet + SOL | Your address and available balance |
| **Settings** | Account, verify, lock, logout |
| **Verify wallet** | Link this wallet to your X for verified badges |
| **Lock wallet** | Lock the keyring |
| **Logout** | Clear X session (and may clear local session - treat as leaving) |

## Settings screen

- Connected X account (or not signed in)  
- Wallet row + available SOL  
- **Verify wallet**, **Lock wallet**, **Logout X**  

## Security checklist

| Do | Don’t |
|----|-------|
| Strong password | Reuse your bank password |
| Lock when idle | Leave the panel unlocked on a shared PC |
| Keep a backup of the secret offline | Paste the seed into Discord / random sites |
| Read [Safety & custody](/guide/safety-and-custody) | Expect support to recover a lost password |

Losing the password without a backup of the secret means losing access to **that local keyring copy**.

## If something fails

| Symptom | What to try |
|---------|-------------|
| Create / park / trade “cannot reach” | Check network, reload the extension, retry |
| Unlock rejected | Re-check password |
| Wrong balance | Unlock again or reopen the panel |

Next: [Connect X](/extension/connect-x) / [Home & Discover](/extension/home-and-discover)
