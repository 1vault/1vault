#!/usr/bin/env bash
# Cross-compile 1vault-api for Railway (Linux amd64, static).
# Usage (from backend/):
#   ./scripts/build-linux.sh
#   ./scripts/build-linux.sh arm64   # Railway arm64 machines
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ARCH="${1:-amd64}"
case "$ARCH" in
  amd64|arm64) ;;
  *)
    echo "usage: $0 [amd64|arm64]" >&2
    exit 1
    ;;
esac

OUT_DIR="${ROOT}/bin/railway"
mkdir -p "$OUT_DIR"

echo "==> building linux/${ARCH} (CGO_ENABLED=0)…"
GOOS=linux GOARCH="$ARCH" CGO_ENABLED=0 go build \
  -trimpath \
  -ldflags="-s -w" \
  -o "${OUT_DIR}/1vault-api" \
  ./cmd/api

echo "==> packaging migrations + docs…"
rm -rf "${OUT_DIR}/migrations" "${OUT_DIR}/docs"
cp -R migrations "${OUT_DIR}/migrations"
mkdir -p "${OUT_DIR}/docs"
cp docs/openapi.yaml docs/idl.json "${OUT_DIR}/docs/" 2>/dev/null || cp docs/openapi.yaml "${OUT_DIR}/docs/"

# Railway / Docker: binary + assets in same directory (findRoot looks for migrations/docs)
cat > "${OUT_DIR}/Procfile" <<'EOF'
web: ./1vault-api
EOF

SIZE="$(wc -c < "${OUT_DIR}/1vault-api" | tr -d ' ')"
echo "==> ok ${OUT_DIR}/1vault-api (${SIZE} bytes)"
echo "    layout:"
echo "      ${OUT_DIR}/1vault-api"
echo "      ${OUT_DIR}/migrations/"
echo "      ${OUT_DIR}/docs/"
echo "      ${OUT_DIR}/Procfile"
echo ""
echo "Railway env (minimum): DATABASE_URL, JWT_SECRET, PORT (auto)"
echo "Optional: TWITTER_*, CORS_ORIGINS, DEVNET_RPC_URL, …"
