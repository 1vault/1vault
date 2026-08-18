# 1Vault live workflow simulator

n8n-style canvas for a **real Devnet** demo: import a degen (strategist) wallet and a retail (investor) wallet, then run two separate simulations.

Brand: `#093C5D` on a dark canvas.

## Run

```bash
cd simulator
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

RPC is loaded from `simulator/.env`, then `ProgramID/onevault-program/sdk/.env`, then `ProgramID/onevault-indexer/.env`. Copy `.env.example` if you need a local override.

## Two simulations (real txs)

1. **Degen wallet** — import JSON/base58 secret, or **Use CLI key** (`~/.config/solana/id.json`)
2. **Retail wallet** — import a second Devnet key with enough SOL to park funds plus fees
3. **Follow settings** — set auto-follow, copy size, max position, TP/SL, and park SOL
4. **Create vault** — license → new vault → retail joins *that* vault and parks funds. Does not open a position.
5. **Open position** — reuses the same vault. Degen buy (`request_trade` → `execute_trade` → `open_position`) → retail auto-follow → mark PnL → realize → accrue (calculate only) → retail exit → native SOL fees land on degen + platform wallets

Keys never leave this machine. They are not logged. Devnet only.

Degen should already hold the 1VAULT license (the CLI deployer key does). Retail only needs Devnet SOL.
