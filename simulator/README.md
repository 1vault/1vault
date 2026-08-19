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

There is **no `DATABASE_URL` in the simulator**. Postgres is only on the indexer (`ProgramID/onevault-indexer/.env`). The simulator reaches it through `INDEXER_API=http://127.0.0.1:3001` — start that API first (`cd ProgramID/onevault-indexer && npm run api`).

After the **MVP program upgrade**, re-bootstrap protocol on Devnet (`cd ProgramID/onevault-program/sdk && npm run bootstrap:devnet`) and create a **new vault** from the simulator — old vault PDAs use the pre-strip account layout.

## Two simulations (real txs)

1. **Degen wallet** — import JSON/base58 secret, or **Use CLI key** (`~/.config/solana/id.json`)
2. **Retail wallet** — import a second Devnet key with enough SOL to park funds plus fees
3. **Follow settings** — auto-follow, copy size, max position, TP/SL, park SOL (no DCA toggles)
4. **Create vault** — license → new vault → retail joins *that* vault and parks funds. Does not open a position.
5. **Open position** — reuses the same vault. Degen buy (`request_trade` → `execute_trade` → `open_position`) → retail auto-follow → mark PnL → close position → accrue/claim performance fee to degen wallet → optional retail withdraw to wallet (**free**, no flat platform fee)

Keys never leave this machine. They are not logged. Devnet only.

Degen should already hold the 1VAULT license (the CLI deployer key does). Retail only needs Devnet SOL.

## MVP vs simulator

| On-chain (MVP) | Simulator behavior |
|----------------|-------------------|
| Free park & redeem | Withdraw sends wSOL then unwraps to native SOL; `fee_amount = 0` |
| No referral / staking / risk PDAs | Accounts omitted from tx builders |
| Performance fee → degen wallet | Accrue + claim after marked PnL |
| DEX allowlist only (no MEV mode) | `TRADE_EXECUTION=demo` injects PnL; use `live` for real Jupiter swaps |
