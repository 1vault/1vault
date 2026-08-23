# Deploy onevault-indexer on Railway

Service root: **`ProgramID/onevault-indexer`** (bukan repo root, bukan `backend/`).

Entrypoint menjalankan: **migrate → poller + API** (health: `GET /health`).

---

## A) GitHub (disarankan)

1. Push kode ke GitHub (termasuk `Dockerfile`, `railway.toml`).
2. Railway → **New Project** → **Deploy from GitHub** → pilih repo.
3. **Root Directory** = `ProgramID/onevault-indexer`
4. Builder: Dockerfile (otomatis dari `railway.toml`).
5. Variables (sama DB dengan backend jika share Supabase):

```bash
# Railway dashboard → Variables, atau CLI di bawah
DATABASE_URL=postgresql://postgres.PROJECT:PASSWORD@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres
RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
PROGRAM_ID=2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP
CLUSTER=devnet
RUN_POLLER=1
DB_MAX_CONNS=5
# PORT di-set otomatis oleh Railway
```

6. Generate domain → buka `https://<service>.up.railway.app/health`

---

## B) CLI (`railway up`)

Dari mesin lokal (butuh [Railway CLI](https://docs.railway.com/guides/cli)):

```bash
# sekali
npm i -g @railway/cli
railway login

cd ProgramID/onevault-indexer

# buat service baru ATAU link ke project yang sudah ada
railway init
# atau: railway link

# set env (ganti nilai asli)
railway variables set \
  DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres" \
  RPC_URL="https://devnet.helius-rpc.com/?api-key=YOUR_KEY" \
  PROGRAM_ID="2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP" \
  CLUSTER="devnet" \
  RUN_POLLER="1" \
  DB_MAX_CONNS="5"

# deploy dari folder ini (root = indexer)
railway up
```

Setelah deploy:

```bash
railway domain          # buat public URL
railway logs
curl -s https://$(railway domain 2>/dev/null | head -1)/health
```

---

## C) Dua service terpisah (opsional)

| Service | Root Directory | `RUN_POLLER` | Catatan |
|---------|----------------|--------------|---------|
| indexer-api | `ProgramID/onevault-indexer` | `0` | hanya REST + migrate |
| indexer-poller | sama | `1` + start override | atau jalankan default gabungan di satu service |

Default **satu service** sudah cukup (`RUN_POLLER=1`).

---

## Smoke setelah live

```bash
curl -s https://YOUR-INDEXER.up.railway.app/health
curl -s https://YOUR-INDEXER.up.railway.app/api/stats
```

Backend Go (jika perlu ingest segera setelah submit):

```env
INDEXER_INGEST_URL=https://YOUR-INDEXER.up.railway.app/api/ingest
```

---

## Catatan Supabase

- Pakai pooler **`:6543`** (transaction), bukan `:5432`.
- Indexer auto-rewrite `:5432` → `:6543` jika lupa.
- Share `DATABASE_URL` dengan Go backend.
