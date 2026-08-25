# FAQ

Quick answers about 1Vault. Tap a question to expand.

::: tip Looking for steps?
Product walkthroughs live in [Quick start](/guide/quick-start) and [Roles](/guide/roles). Fix a stuck panel in [Troubleshooting](/extension/troubleshooting).
:::

## Roles

::: details Who is the Strategist?
The **Strategist** creates and runs the vault: locks **$1VAULTS**, parks SOL, signs trades, exits positions, closes the vault, then unlocks $1VAULTS. Full breakdown: [Roles](/guide/roles#who-is-the-strategist).
:::

::: details Who is the Investor?
The **Investor** parks SOL into a **public** vault and rides the shared book. They do not sign vault swaps or unlock the strategist’s $1VAULTS. Guide: [Park into a vault](/investor/park-into-vault).
:::

::: details Can one wallet be both Strategist and Investor?
Yes. The same keyring can create/run your own vault (strategist) and park into someone else’s vault (investor). When you verify with X you pick a role **label**; it does not permanently lock you out of the other flow.
:::

::: details Do I need $1VAULTS to park as an Investor?
No. **$1VAULTS** is required to **create** a vault. Investors only need SOL (plus network fees).
:::

::: details Do I need X (Twitter) to use 1Vault?
No. X is optional. Connecting and verifying helps with a verified badge on Discover / profiles. You can create and trade with the keyring alone.
:::

## Product

::: details What is 1Vault in one sentence?
A non-custodial **pooled trading vault** on Solana: strategist and investor park into the **same** book; the strategist signs; the vault pays; close settles by **share weight**.
:::

::: details Is 1Vault copy trading?
No. It is a **shared book** - one vault inventory - not a per-wallet mirror of each fill. Investors hold **shares** of that book.
:::

::: details Is close 50/50 with the strategist?
No. Close pays **by share weight**. Example: strategist 2 shares + investor 8 shares, leftover 9 SOL → about 1.8 / 7.2. See [Concepts](/guide/concepts#close-by-share-weight).
:::

::: details Are park and withdraw free?
Yes on the current product (no platform park / withdraw fee). You still pay Solana network fees and trading PnL / slippage inside swaps.
:::

::: details What is $1VAULTS?
**$1VAULTS**. Strategists lock **1,000,000 $1VAULTS** to create a vault. It returns **in full** when the vault is closed and unlocked. Details: [$1VAULTS licence](/guide/license-1vaults).
:::

::: details When do I get $1VAULTS back?
After the vault is **Closed** (positions flat → close succeeds), use **Vault → Unlock $1VAULTS**. Unlock while the vault is still Active will fail.
:::

::: details What is NAV?
A display of vault value (assets + open positions). Share value moves with NAV. Treat UI numbers as helpful estimates; settled on-chain results matter after confirms.
:::

::: details Pooled vs Sliced?
**Pooled** is the shared book shipping today. **Sliced** is a future-style mode for earlier per-investor exits. Prefer Active **Pooled** vaults unless you know otherwise.
:::

::: details Who gets performance fees?
On eligible profit above the high-water mark, a performance fee (default **20%**) can accrue to the strategist fee wallet. Investors do not “pay a separate park fee.” See [Fees](/guide/fees). Strategists collect with [Claim fees](/extension/claim-fees).
:::

::: details What is the high-water mark?
The highest share-price band already charged. Fee only accrues on **new** highs above that mark, so the same profit is not charged twice. Numeric walkthrough: [Fees](/guide/fees#high-water-mark-example).
:::

::: details What fees do I still pay?
Network fees on every signature, DEX / market impact inside trades, and trading PnL on the shared book. Park and withdraw have no platform fee on the current product.
:::

## Extension

::: details Where do I download the extension?
The public download link will appear on [Install](/extension/install) when mainnet shipping is ready. Until then the page shows “Coming soon.”
:::

::: details What are the bottom tabs?
**Home** (your vaults + capital) · **Discover** (public vaults) · **Trade** (open / exit) · **History** · **Vault** (claim fees, close, unlock $1VAULTS). Overview: [Home & Discover](/extension/home-and-discover).
:::

::: details Why can’t I trade?
Usually: you have not parked yet, no Active vault selected, keyring locked, or another transaction is still running. Park first, then open Trade.
:::

::: details Why can’t I close?
Open positions or pending trades. **Exit** everything on Trade, then Close. See [Close vault & unlock](/extension/close-vault-and-unlock).
:::

::: details Why is Park disabled?
The vault must be **Active**. Closed / closing vaults cannot take new parks. Select another Active vault or create a new one.
:::

::: details What does “Incoming” capital mean?
Parks that are still settling. Wait for confirms before treating that size as fully ready. More: [Capital pipeline](/extension/capital-pipeline).
:::

::: details GMGN pill missing?
Refresh the GMGN tab, confirm the extension is enabled, and open a Solana token page. Guide: [Instant trade terminals](/extension/instant-trade-terminals).
:::

::: details Pill opens Trade but no token is set?
Paste or pick the token on the Trade screen, then open the position. The pill still opened your panel correctly.
:::

::: details Create says not enough $1VAULTS?
Use **Go to Swap**, buy $1VAULTS into the **same** wallet as the extension, then **Refresh balance** on step 4. See [Create vault & lock](/extension/create-vault-and-lock).
:::

::: details Wallet locked / cannot sign?
Unlock the keyring with your password. Lock and X logout are different - locking stops signing until you unlock again.
:::

::: details Forgot keyring password?
1Vault cannot recover it. You need a backup of the secret key. Without that, that local keyring copy is not recoverable. Read [Safety & custody](/guide/safety-and-custody).
:::

## Investor

::: details How do I find a vault to park into?
Open **Discover**, search or browse, open detail, check status **Active**, then **Park SOL**. Guide: [Park into a vault](/investor/park-into-vault).
:::

::: details Can I withdraw before the strategist closes?
Yes, while the vault still allows redeem - use Park → **My parks** → **Withdraw**, or Holdings when shown. Guide: [Withdraw](/investor/withdraw).
:::

::: details What are TP and SL?
Optional **take profit** / **stop loss** on your investor side when the UI shows them. They do not pick tokens for you. Guide: [TP & SL](/investor/tp-sl).
:::

::: details What happens to me if the strategist closes?
You receive close payout by **share weight**. You do not unlock their $1VAULTS. New parks stop once the vault is closed.
:::

::: details Do I pick the tokens the strategist trades?
No (pooled book). You choose vault and size; the strategist signs trades for the shared inventory.
:::

## Risk & safety

::: details Can I lose parked SOL?
Yes. Trading and market risk apply. Memecoins and launchpads are volatile. Only park what you can afford to lose. [Safety & custody](/guide/safety-and-custody).
:::

::: details Does 1Vault custody my key?
No. Your keyring stays encrypted on your device. Vault funds sit in on-chain vault accounts. Never share your seed or password.
:::

::: details Is this safe / guaranteed yield?
No. 1Vault does not promise safe yield, guaranteed returns, or a 50/50 close. It is trading risk on a shared book.
:::

::: details Any hygiene tips?
Use a dedicated trading wallet, lock when idle, confirm vault and strategist before parking, exit positions before close, install only from the official download when published.
:::

## Still stuck?

::: details Where should I look next?
1. [Troubleshooting](/extension/troubleshooting) for message-by-message fixes  
2. [Glossary](/reference/glossary) for terms  
3. [Roles](/guide/roles) if you are unsure Strategist vs Investor  

When asking for help, share vault address + approximate time - **never** your seed phrase.
:::
