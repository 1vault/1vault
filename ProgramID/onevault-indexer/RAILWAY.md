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

### Kenapa backend bilang `api: down` tapi `dev: up`?

- **`dev`** = poller menulis `indexer_heartbeat` di Postgres (jalan).
- **`api`** = backend harus HTTP `GET {INDEXER}/health`.
- URL publik `https://1vault-production.up.railway.app` saat ini sering **502** → domain tidak mengarah ke service indexer (atau Public Networking belum aktif).

**Perbaiki di Railway (service INDEXER):**

1. Buka service **indexer** (bukan backend)
2. **Settings → Networking → Public Networking → Generate Domain**
3. Pastikan domain itu yang dipakai di backend:

```env
INDEXER_INGEST_URL=https://<DOMAIN-INDEXER>.up.railway.app/api/ingest
```

4. Cek:

```bash
curl -s https://<DOMAIN-INDEXER>.up.railway.app/health
# harus {"ok":true,"service":"onevault-indexer-api",...}
```

Kalau backend & indexer satu project Railway, alternatif private:

```env
INDEXER_INGEST_URL=http://<nama-service-indexer>.railway.internal:8080/api/ingest
```

(`8080` = `PORT` di logs indexer.)

---

## Smoke setelah live

```bash
curl -s https://YOUR-INDEXER.up.railway.app/health
curl -s https://YOUR-INDEXER.up.railway.app/api/stats
```

Harus `{"ok":true,...}` — kalau **502 Application failed to respond**, service crash (cek `railway logs`: DB/RPC/migrate).

Backend Go harus mengarah ke indexer yang sama:

```env
INDEXER_INGEST_URL=https://YOUR-INDEXER.up.railway.app/api/ingest
```

Lalu `GET /v1/health` → `indexer.api` / `indexer.dev` harus `"up"`.

### 502 troubleshooting

1. Root Directory = `ProgramID/onevault-indexer` (bukan `backend/`)
2. Env: `DATABASE_URL` (:6543), `RPC_URL`, `PROGRAM_ID`, `CLUSTER`, `RUN_POLLER=1`
3. Logs harus ada: `[1vault-api] listening on http://0.0.0.0:<PORT>`
4. Redeploy setelah pull fix listen `0.0.0.0` + railway-start (poller crash tidak matikan API)
---

## Catatan Supabase

- Pakai pooler **`:6543`** (transaction), bukan `:5432`.
- Indexer auto-rewrite `:5432` → `:6543` jika lupa.
- Share `DATABASE_URL` dengan Go backend.
