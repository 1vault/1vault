# 1Vault — Production frontend (Next.js)

Next.js app for the 1Vault product UI.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Backend integration

Do **not** guess tx account order or flow steps from the on-chain IDL alone — use the Go backend as the source of truth for unsigned transactions.

| Resource | What you need |
|----------|----------------|
| **[backend/docs/FRONTEND_GUIDE.md](../backend/docs/FRONTEND_GUIDE.md)** | **Start here** — roles, licence (1VL), vault types, withdraw, flows, errors |
| [backend/docs/openapi.yaml](../backend/docs/openapi.yaml) | OpenAPI / Swagger (`http://localhost:3090/v1/docs`) |
| [backend/README.md](../backend/README.md) | Run API, smoke test, tx examples |
| [simulator-v2/README.md](../simulator-v2/README.md) | Reference canvas UI (working integration) |
| [ProgramID/onevault-program/docs/FRONTEND_BACKEND_INTEGRATION.md](../ProgramID/onevault-program/docs/FRONTEND_BACKEND_INTEGRATION.md) | Direct Anchor / PDA (advanced) |

## Key product rules (MVP)

- **Strategist** (`strategies` / degen): register → lock licence → create vault (**1M 1VL** locked per vault).
- **Investor** (`investors` / retail): park SOL, auto-follow, **free withdraw** (redeem shares → native SOL).
- **Vault type:** `pooled` (shared book) or `sliced` (slice books + management fee bps) — pass on create vault.
- **Withdraw:** investor signs one bundled tx per vault; cap by liquid wSOL; 9-account `withdraw` layout includes `investor_config`.
- **Wallet kind:** `eoa` (personal) vs `pda` (vault pubkey) on analytics endpoints.

## Environment

Use cluster-scoped backend URL and Solana RPC. See `FRONTEND_GUIDE.md` §2 and program docs for `NEXT_PUBLIC_*` variables.

## Local stack

```bash
# Terminal 1 — backend
cd backend && go run ./cmd/api

# Terminal 2 — indexer (for vault list / holdings cache)
cd ProgramID/onevault-indexer && npm run api && npm run dev

# Terminal 3 — this app
cd frontend && npm run dev

# Optional — integration reference UI
cd simulator-v2 && npm run dev   # :5174
```
