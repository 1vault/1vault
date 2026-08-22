#!/usr/bin/env bash
# 1Vault backend — one-shot API smoke scenario
#
# Usage:
#   ./scripts/smoke.sh
#   BASE_URL=http://localhost:3090 CLUSTER=devnet ./scripts/smoke.sh
#
# Exit 0 = no hard failures (SOFT warnings allowed). Exit 1 = one or more FAILs.

set -u
BASE_URL="${BASE_URL:-http://localhost:3090}"
CLUSTER="${CLUSTER:-devnet}"
WSOL="So11111111111111111111111111111111111111112"
SAMPLE_WALLET="5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
STRATEGIST_PK="9YajdkrkvyzDm57bPSijfy6sFNj9wuqQtYmuYUXZtPDx"
INVESTOR_PK="EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286"
TIMEOUT="${TIMEOUT:-25}"

PASS=0
SOFT=0
FAIL=0
SKIP=0
RESULTS=()

green()  { printf '\033[32m%s\033[0m' "$*"; }
yellow() { printf '\033[33m%s\033[0m' "$*"; }
red()    { printf '\033[31m%s\033[0m' "$*"; }
bold()   { printf '\033[1m%s\033[0m' "$*"; }

record() {
  local status="$1" name="$2" detail="${3:-}"
  case "$status" in
    PASS) PASS=$((PASS+1)); RESULTS+=("$(green PASS)  $name${detail:+ — $detail}") ;;
    SOFT) SOFT=$((SOFT+1)); RESULTS+=("$(yellow SOFT)  $name${detail:+ — $detail}") ;;
    FAIL) FAIL=$((FAIL+1)); RESULTS+=("$(red FAIL)  $name${detail:+ — $detail}") ;;
    SKIP) SKIP=$((SKIP+1)); RESULTS+=("SKIP  $name${detail:+ — $detail}") ;;
  esac
}

needs_cluster() {
  case "$1" in
    /v1/health|/v1/docs|/v1/openapi.json) return 1 ;;
    /v1/stream/*|/v1/auth/*) return 1 ;;
    *) return 0 ;;
  esac
}

# call NAME METHOD PATH [BODY] [expect=soft|ok|stub|stream]
call() {
  local name="$1" method="$2" path="$3" body="${4:-}" expect="${5:-soft}"
  local url path_only q
  path_only="${path%%\?*}"
  q=""
  if [[ "$path" == *"?"* ]]; then
    q="${path#*\?}"
  fi

  if needs_cluster "$path_only"; then
    if [[ -n "$q" ]]; then
      url="${BASE_URL}${path_only}?${q}&cluster=${CLUSTER}"
    else
      url="${BASE_URL}${path_only}?cluster=${CLUSTER}"
    fi
  else
    url="${BASE_URL}${path}"
  fi

  local tmp code
  tmp="$(mktemp)"
  local args=(-sS -o "$tmp" -w "%{http_code}" --max-time "$TIMEOUT" -X "$method" -H "Accept: application/json")
  if [[ -n "$body" ]]; then
    args+=(-H "Content-Type: application/json" -d "$body")
  fi

  code="$(curl "${args[@]}" "$url" 2>/dev/null || echo "000")"
  local body_txt
  body_txt="$(cat "$tmp" 2>/dev/null || true)"
  rm -f "$tmp"

  if [[ "$code" =~ ^2 ]]; then
    if echo "$body_txt" | grep -E '"role"[[:space:]]*:[[:space:]]*"(degen|retail)"' >/dev/null 2>&1 \
      || echo "$body_txt" | grep -E '"rolePreference"[[:space:]]*:[[:space:]]*"(degen|retail)"' >/dev/null 2>&1 \
      || echo "$body_txt" | grep -E '"degenFeeWallet"' >/dev/null 2>&1; then
      record FAIL "$name" "HTTP $code legacy degen/retail still present"
      return
    fi
  fi

  case "$expect" in
    ok)
      if [[ "$code" =~ ^2 ]]; then record PASS "$name" "HTTP $code"
      else record FAIL "$name" "HTTP $code"
      fi
      ;;
    stub)
      if [[ "$code" == "501" ]] && echo "$body_txt" | grep -q FEATURE_NOT_ON_CHAIN; then
        record PASS "$name" "501 FEATURE_NOT_ON_CHAIN"
      elif [[ "$code" =~ ^2 ]]; then
        record PASS "$name" "HTTP $code"
      else
        record FAIL "$name" "HTTP $code (want 501 FEATURE_NOT_ON_CHAIN)"
      fi
      ;;
    stream)
      if [[ "$code" == "200" ]] && echo "$body_txt" | grep -Eqi 'websocket|wsUrl|snapshot'; then
        record PASS "$name" "HTTP 200 stream guide"
      else
        record FAIL "$name" "HTTP $code (want 200 WS guide JSON)"
      fi
      ;;
    soft|*)
      if [[ "$code" =~ ^2 ]]; then
        record PASS "$name" "HTTP $code"
      elif [[ "$code" =~ ^(404|422|429|503)$ ]]; then
        local errc
        errc="$(printf '%s' "$body_txt" | python3 -c 'import sys,json
try:
 d=json.load(sys.stdin); e=d.get("error") or {}; print(e.get("code") or "")
except Exception:
 print("")' 2>/dev/null || true)"
        record SOFT "$name" "HTTP $code ${errc}"
      elif [[ "$code" == "000" ]]; then
        record FAIL "$name" "connection failed — is API up at ${BASE_URL}?"
      else
        record FAIL "$name" "HTTP $code"
      fi
      ;;
  esac
}

echo "$(bold "1Vault API smoke")"
echo "  BASE_URL=$BASE_URL  CLUSTER=$CLUSTER"
echo

# ── System
call "health"                GET "/v1/health" "" soft
call "openapi.json"          GET "/v1/openapi.json" "" ok
call "docs"                  GET "/v1/docs" "" ok

# ── Protocol / vaults / actors
call "protocol"              GET "/v1/protocol" "" ok
call "protocol.state"        GET "/v1/protocol/state" "" soft
call "vaults.list"           GET "/v1/vaults" "" soft
call "vaults.list.pooled"    GET "/v1/vaults?vaultType=pooled" "" soft
call "vaults.list.sliced"    GET "/v1/vaults?vaultType=sliced" "" soft
call "leaderboard"           GET "/v1/leaderboard" "" soft

VAULT_PK="$(curl -sS --max-time 15 "${BASE_URL}/v1/vaults?cluster=${CLUSTER}" 2>/dev/null \
  | python3 -c 'import sys,json
try:
 d=json.load(sys.stdin); items=(d.get("data") or {}).get("items") or []
 print((items[0].get("pubkey") or items[0].get("Pubkey") or "") if items else "")
except Exception:
 print("")' || true)"

# Assert vaultType fields when list returns items
python3 - <<'PY' || true
import json,os,urllib.request
base=os.environ.get("BASE_URL","http://localhost:3090")
cluster=os.environ.get("CLUSTER","devnet")
try:
  with urllib.request.urlopen(f"{base}/v1/vaults?cluster={cluster}", timeout=15) as r:
    d=json.load(r)
  items=(d.get("data") or {}).get("items") or []
  if not items:
    open("/tmp/1vault_vaulttype_assert","w").write("skip")
  elif all(i.get("vaultType") in ("pooled","sliced") and i.get("vaultTypeLabel") for i in items[:5]):
    open("/tmp/1vault_vaulttype_assert","w").write("pass")
  else:
    open("/tmp/1vault_vaulttype_assert","w").write("fail")
except Exception:
  open("/tmp/1vault_vaulttype_assert","w").write("soft")
PY
case "$(cat /tmp/1vault_vaulttype_assert 2>/dev/null || echo soft)" in
  pass) record PASS "vaults.list.vaultType" "fields present" ;;
  fail) record FAIL "vaults.list.vaultType" "missing vaultType on items" ;;
  skip) record SKIP "vaults.list.vaultType" "no indexed vaults" ;;
  *) record SOFT "vaults.list.vaultType" "could not assert" ;;
esac

if [[ -n "${VAULT_PK}" ]]; then
  call "vault.get"           GET "/v1/vaults/${VAULT_PK}" "" soft
  # Assert get includes vaultType
  get_body="$(curl -sS --max-time 15 "${BASE_URL}/v1/vaults/${VAULT_PK}?cluster=${CLUSTER}" 2>/dev/null || true)"
  if echo "$get_body" | grep -q '"vaultType"'; then
    record PASS "vault.get.vaultType" "present"
  else
    record FAIL "vault.get.vaultType" "missing"
  fi
  call "vault.holdings"      GET "/v1/vaults/${VAULT_PK}/holdings" "" soft
  call "vault.positions"     GET "/v1/vaults/${VAULT_PK}/positions" "" soft
  call "vault.fees"          GET "/v1/vaults/${VAULT_PK}/fees" "" soft
  call "vault.trades"        GET "/v1/vaults/${VAULT_PK}/trades" "" soft
  call "vault.nav"           GET "/v1/vaults/${VAULT_PK}/nav" "" soft
  call "vault.payouts"       GET "/v1/vaults/${VAULT_PK}/payouts" "" soft
  call "vault.follows"       GET "/v1/vaults/${VAULT_PK}/follows" "" soft
  call "trades.list"         GET "/v1/trades?vault=${VAULT_PK}" "" soft
else
  record SKIP "vault.*" "no indexed vaults"
  call "trades.list"         GET "/v1/trades" "" soft
fi

call "strategist.get"        GET "/v1/strategists/${STRATEGIST_PK}" "" soft
call "investor.get"          GET "/v1/investors/${INVESTOR_PK}" "" soft

# ── Token market / research
# ── Token market / research (brief pause to reduce upstream rate limits)
sleep_market() { sleep "${MARKET_SLEEP:-0.35}"; }

call "token.price"           GET "/v1/tokens/${WSOL}/price" "" soft; sleep_market
call "token.kline"           GET "/v1/tokens/${WSOL}/kline?resolution=1m" "" soft; sleep_market
call "token.analyze"         GET "/v1/tokens/${WSOL}/analyze" "" soft; sleep_market
call "token.info"            GET "/v1/tokens/${WSOL}/info" "" soft; sleep_market
call "token.security"        GET "/v1/tokens/${WSOL}/security" "" soft; sleep_market
call "token.pool"            GET "/v1/tokens/${WSOL}/pool" "" soft; sleep_market
call "token.holders"         GET "/v1/tokens/${WSOL}/holders?limit=10" "" soft; sleep_market
call "token.traders"         GET "/v1/tokens/${WSOL}/traders" "" soft; sleep_market
call "token.research"        GET "/v1/tokens/${WSOL}/research" "" soft; sleep_market
call "token.holder-analysis" GET "/v1/tokens/${WSOL}/holder-analysis" "" soft; sleep_market
call "token.detail"          GET "/v1/tokens/${WSOL}/detail" "" soft; sleep_market
call "token.pairs"           GET "/v1/tokens/${WSOL}/pairs" "" soft; sleep_market
call "token.orders"          GET "/v1/tokens/${WSOL}/orders" "" soft; sleep_market

# ── Discover
call "discover.profiles.latest" GET "/v1/discover/profiles/latest" "" soft
call "discover.profiles.recent" GET "/v1/discover/profiles/recent" "" soft
call "discover.takeovers"       GET "/v1/discover/takeovers/latest" "" soft
call "discover.ads"             GET "/v1/discover/ads/latest" "" soft
call "discover.boosts.latest"   GET "/v1/discover/boosts/latest" "" soft
call "discover.boosts.top"      GET "/v1/discover/boosts/top" "" soft
call "discover.search"          GET "/v1/discover/search?q=SOL" "" soft
call "discover.metas.trending"  GET "/v1/discover/metas/trending" "" soft
call "discover.metas.slug"      GET "/v1/discover/metas/ai" "" soft

# ── Stream HTTP guide
call "stream.profiles.latest" GET "/v1/stream/profiles/latest" "" stream
call "stream.profiles.recent" GET "/v1/stream/profiles/recent" "" stream
call "stream.takeovers"       GET "/v1/stream/takeovers/latest" "" stream
call "stream.ads"             GET "/v1/stream/ads/latest" "" stream
call "stream.boosts.latest"   GET "/v1/stream/boosts/latest" "" stream
call "stream.boosts.top"      GET "/v1/stream/boosts/top" "" stream

# ── Wallet analytics
call "wallet.kind"            GET "/v1/wallets/${SAMPLE_WALLET}/kind" "" soft
call "wallet.kind.eoa"        GET "/v1/wallets/${SAMPLE_WALLET}/kind?walletKind=eoa" "" soft
call "wallet.activity"        GET "/v1/wallets/${SAMPLE_WALLET}/activity?limit=5" "" soft
call "wallet.stats"           GET "/v1/wallets/${SAMPLE_WALLET}/stats?period=7d" "" soft
call "wallet.token-balance"   GET "/v1/wallets/${SAMPLE_WALLET}/token-balance?token=${WSOL}" "" soft
call "wallet.created-tokens"  GET "/v1/wallets/${SAMPLE_WALLET}/created-tokens" "" soft
call "wallet.score"           GET "/v1/wallets/${SAMPLE_WALLET}/score" "" soft
call "wallet.holdings"        GET "/v1/wallets/${SAMPLE_WALLET}/holdings?limit=5" "" soft
call "wallet.profits"         POST "/v1/wallets/profits" \
  "{\"wallets\":[\"${SAMPLE_WALLET}\"],\"period\":\"7d\",\"walletKind\":\"eoa\"}" soft

# ── Tx prep
call "tx.resolve-accounts"    POST "/v1/tx/resolve-accounts" \
  "{\"strategist\":\"${STRATEGIST_PK}\",\"investor\":\"${INVESTOR_PK}\",\"vaultId\":1}" soft
call "tx.register-strategist" POST "/v1/tx/register-strategist" \
  "{\"strategist\":\"${STRATEGIST_PK}\"}" soft
call "tx.lock-license"        POST "/v1/tx/lock-license" \
  "{\"strategist\":\"${STRATEGIST_PK}\"}" soft
call "tx.create-vault"        POST "/v1/tx/create-vault" \
  "{\"strategist\":\"${STRATEGIST_PK}\",\"vaultTokenAccount\":\"${WSOL}\",\"vaultId\":999001,\"name\":\"Smoke Vault\",\"vaultType\":\"sliced\"}" soft
call "tx.create-vault.pooled" POST "/v1/tx/create-vault" \
  "{\"strategist\":\"${STRATEGIST_PK}\",\"vaultTokenAccount\":\"${WSOL}\",\"vaultId\":999002,\"name\":\"Smoke Pooled\",\"vaultType\":\"pooled\"}" soft
call "tx.investor-config"     POST "/v1/tx/investor-config" \
  "{\"investor\":\"${INVESTOR_PK}\",\"strategist\":\"${STRATEGIST_PK}\",\"vaultId\":1}" soft
call "tx.park-guest"          POST "/v1/tx/park-guest" \
  "{\"investor\":\"${INVESTOR_PK}\",\"strategist\":\"${STRATEGIST_PK}\",\"vaultId\":1,\"vaultTokenAccount\":\"${WSOL}\",\"lamports\":1000000,\"role\":\"investors\"}" soft
call "tx.accrue-fees"         POST "/v1/tx/accrue-fees" \
  "{\"strategist\":\"${STRATEGIST_PK}\",\"vaultId\":1}" soft
call "tx.status"              GET "/v1/tx/status/1111111111111111111111111111111111111111111111111111111111111111" "" soft

# ── Flows / features / auth
call "flows.list"             GET "/v1/flows" "" soft
call "features.referral"      POST "/v1/features/referral" "{}" stub
call "features.staking"       POST "/v1/features/staking" "{}" stub
call "features.vault-stake"   POST "/v1/features/vault-stake" "{}" stub
call "features.mev"           POST "/v1/features/mev" "{}" stub
call "features.dca"           POST "/v1/features/dca" "{}" stub
call "features.early-exit-fee" POST "/v1/features/early-exit-fee" "{}" stub
call "features.withdraw-fee"  POST "/v1/features/withdraw-fee" "{}" stub
call "features.management-fee" POST "/v1/features/management-fee" "{}" stub
call "features.referral.rewards" GET "/v1/features/referral/rewards" "" soft
call "features.staking.events"   GET "/v1/features/staking/events" "" soft
call "auth.twitter.start"     GET "/v1/auth/twitter/start" "" soft
call "auth.refresh"           POST "/v1/auth/refresh" '{"refreshToken":"invalid"}' soft

echo
echo "$(bold "Results")"
for line in "${RESULTS[@]}"; do
  echo "  $line"
done
echo
TOTAL=$((PASS+SOFT+FAIL+SKIP))
echo "$(bold "Summary"): $(green "$PASS pass") · $(yellow "$SOFT soft") · $(red "$FAIL fail") · $SKIP skip  (n=$TOTAL)"
if [[ -n "${VAULT_PK}" ]]; then
  echo "  vault sample: $VAULT_PK"
else
  echo "  vault sample: (none indexed)"
fi

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "$(red "Smoke FAILED")"
  exit 1
fi
echo
echo "$(green "Smoke OK")"
exit 0
