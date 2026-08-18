# Launchpad & Permissionless Token Trading

Vaults can trade **any SPL mint** — including Pump.fun **pre-bonding** tokens — not only vault `accepted_mints`.

## Summary

| Change | Description |
|--------|-------------|
| **Any mint trading** | Buy any token with base mint; sell any token back to base |
| **Launchpad allowlist** | Pump.fun + PumpSwap default; authority can update |
| **`TradeVenue::Launchpad`** | Use on `request_trade` for bonding-curve CPI |
| **`ensure_vault_token_ata`** | Create vault ATA for new meme mint before first buy |

## Flow (Pump.fun pre-bond)

```
1. ensure_vault_token_ata(meme_mint)     // once per new token
2. request_trade(..., trade_venue: Launchpad)
3. execute_trade(swap_data, remaining_accounts)  // Pump.fun buy ix + accounts
4. open_position(...)
```

## Allowlist

Default launchpads (`constants.rs`):

- **Pump.fun:** `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`
- **PumpSwap:** `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`

Update: `update_allowed_launchpads` (protocol authority).

## Client responsibilities

- Build Pump.fun / launchpad instruction data and pass all accounts in `remaining_accounts`
- Set `min_amount_out` tightly (bonding curve slippage)
- Launchpad trades require vault `MevMode::Standard`

## Limitations

- **Token-2022** mints: use standard SPL ATAs today; Token-2022 support may require a follow-up
- **Security**: permissionless mint trading increases rug/honeypot risk — use off-chain filters

See [ADMIN_CONFIGURATION.md](./ADMIN_CONFIGURATION.md) for `update_allowed_launchpads`.
