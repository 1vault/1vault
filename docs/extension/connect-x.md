# Connect X

Linking **X (Twitter)** is **optional**, but it powers verified badges on Discover and profiles.

## Why connect

| Benefit | Detail |
|---------|--------|
| **Verified badge** | Others see a linked identity on your vaults |
| **Profile** | Avatar + display name in the panel |
| **Trust** | Helps investor pick who to park with |

You can still create and trade with only the keyring.

---

## Connect from the create wizard

On create **step 2**:

1. Tap **Connect X**  
2. Finish sign-in in the browser  
3. Return to the panel - chip updates to your display name  
4. Success note: signed in with X  

You can still tap **Next** without connecting.

---

## Verify wallet

Verification links **this Solana wallet** to your X account for verified vault badges.

### Open verify

- Account menu → **Verify wallet**  
- **Settings** → **Verify wallet**  
- Create wizard step 2 when connected but not verified  

### Modal steps

1. Title **Verify wallet**  
2. Read the short explanation  
3. Confirm the shown pubkey is correct  
4. Choose role: **Strategist** or **Investor**  
5. Tap **Sign & verify**  
6. Approve the signature  

If already verified: “This wallet is already verified.” → **Close**.

Verified vaults can show a chip like `✓ @handle` on detail.

---

## Logout vs lock

| Action | Effect |
|--------|--------|
| **Lock wallet** | Keyring locked; you must unlock to sign |
| **Logout** / **Logout X** | Clears X session (treat as leaving the signed-in state) |

They are separate. Locking does not always log out of X, and logout does not replace locking on a shared machine.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Connect window closes with no session | Retry Connect X; allow pop-ups for the flow |
| Verify fails | Unlock wallet, confirm pubkey, retry sign |
| Badge missing on Discover | Verify wallet; wait for list refresh |

Next: [Create vault & lock](/extension/create-vault-and-lock) / [Home & Discover](/extension/home-and-discover)
