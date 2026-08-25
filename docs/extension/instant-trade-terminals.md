# Instant trade terminals

Token sites like **GMGN** (and later **Axiom**) let you open vault trading without leaving the chart.

## Mental model

```text
Token page (GMGN / Axiom / …)
        ↓  click 1Vault pill
Side panel opens on Trade
        ↓  token may prefills
Park (if needed) → Open / exit positions
```

The pill is **not** a second wallet. It opens your **1Vault** side panel and uses your encrypted keyring + active vault.

---

## GMGN (available now)

### Where the pill appears

On GMGN Solana pages, a floating pill sits bottom-right:

| Page | Pill label |
|------|------------|
| Solana token page | **1vaults · Trade** |
| Other GMGN pages | **1vaults** |

Tooltip: open the 1Vault side panel.

### Step-by-step

1. [Install](/extension/install) and unlock 1Vault  
2. On Home, select an **Active** vault  
3. [Park](/extension/park-and-capital) if you have no shares yet  
4. Open a Solana token page on **GMGN**  
5. Click the floating pill  
6. Side panel opens on **Trade** (token context when available)  
7. Continue with [Trade & positions](/extension/trade-and-positions)  

### Checklist

| Check | |
|-------|--|
| Extension enabled on GMGN | |
| Wallet unlocked | |
| Active vault with park | |
| You are on a Solana token page | |

### If the pill is missing

1. Hard-refresh the GMGN tab  
2. Confirm the extension is enabled  
3. Confirm you are on a Solana token page  
4. Reload the extension from Chrome’s extensions page if needed  

### If the panel opens but no token is set

Open Trade and paste / pick the token yourself, then open the position.

---

## Axiom and other terminals

Same product pattern:

1. Detect the token on the page  
2. Show a **1Vault** pill  
3. Click → open side panel Trade  
4. Park / open / exit with the vault book  

| Terminal | Status |
|----------|--------|
| **GMGN** | Live |
| **Axiom** / others | Same UX as they ship |

---

## Safety on third-party sites

- Only trust the pill from the **official** 1Vault extension  
- Fake sites can draw a similar button - check you installed from the official download  
- Still verify token and size before you sign  

Next: [Trade & positions](/extension/trade-and-positions) / [Safety](/guide/safety-and-custody)
