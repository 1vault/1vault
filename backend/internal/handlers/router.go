package handlers

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/1vault/backend/internal/auth"
	"github.com/1vault/backend/internal/cache"
	"github.com/1vault/backend/internal/cluster"
	"github.com/1vault/backend/internal/config"
	"github.com/1vault/backend/internal/dex"
	"github.com/1vault/backend/internal/gmgn"
	"github.com/1vault/backend/internal/httpclient"
	"github.com/1vault/backend/internal/httpx"
	"github.com/1vault/backend/internal/indexer"
	"github.com/1vault/backend/internal/signing"
	"github.com/1vault/backend/internal/wallets"
	"github.com/gagliardetto/solana-go"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type API struct {
	Cfg  config.Config
	Pool *pgxpool.Pool

	GMGN    *gmgn.Client
	Dex     *dex.Client
	Indexer *indexer.Client
	Keeper  solana.PrivateKey

	MetaCache   *cache.TTL // token lite metadata by mint
	ListCache   *cache.TTL // discover list responses
	DBCache     *cache.TTL // vaults/leaderboard/protocol DB reads
	MarketCache *cache.TTL // GMGN/Dex full responses (SWR)
	VaultIndex  *wallets.VaultIndex
	enrichSem   chan struct{}
	limitMu     sync.Mutex
	authLimits  map[string]*simpleLimiter
	ledgerLimits map[string]*simpleLimiter
	marketLimits map[string]*simpleLimiter
}

// NewAPI wires shared HTTP clients, caches, and concurrency guards.
func NewAPI(cfg config.Config, pool *pgxpool.Pool) *API {
	httpC := httpclient.Shared(12 * time.Second)
	a := &API{
		Cfg:          cfg,
		Pool:         pool,
		MetaCache:    cache.NewTTL(60 * time.Second),
		ListCache:    cache.NewTTL(30 * time.Second),
		DBCache:      cache.NewTTL(15 * time.Second),
		MarketCache:  cache.NewTTL(20 * time.Second),
		VaultIndex:   wallets.NewVaultIndex(pool),
		enrichSem:    make(chan struct{}, 8),
		authLimits:   map[string]*simpleLimiter{},
		ledgerLimits: map[string]*simpleLimiter{},
		marketLimits: map[string]*simpleLimiter{},
	}
	wallets.DefaultIndex = a.VaultIndex
	if cfg.GMGNConfigured() {
		a.GMGN = gmgn.New(cfg.GMGNAPIKey, cfg.GMGNBaseURL, cfg.GMGNPrivateKey, cfg.GMGNPassphrase, httpC)
	}
	a.Dex = dex.New(cfg.DexBaseURL, cfg.DexWSURL, httpC)
	a.Indexer = indexer.New(cfg.IndexerIngestURL)
	if kp, err := signing.LoadKeeperKey(cfg.KeeperKeypair); err == nil {
		a.Keeper = kp
	}
	return a
}

func (a *API) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(a.requestID)
	r.Use(a.cors)
	r.Use(a.recoverer)
	r.Use(a.requestTimeout)

	r.Get("/v1/health", a.Health)
	r.Get("/v1/openapi.json", a.OpenAPI)
	r.Get("/v1/docs", a.DocsIndex)
	r.Get("/v1/docs/*", a.DocsStatic)
	r.Get("/v1/test/create-vault", a.TestCreateVault)

	// Live market streams (WebSocket) — no cluster / no request timeout
	r.Get("/v1/stream/profiles/latest", a.streamHandler("/token-profiles/latest/v1"))
	r.Get("/v1/stream/profiles/recent", a.streamHandler("/token-profiles/recent-updates/v1"))
	r.Get("/v1/stream/takeovers/latest", a.streamHandler("/community-takeovers/latest/v1"))
	r.Get("/v1/stream/ads/latest", a.streamHandler("/ads/latest/v1"))
	r.Get("/v1/stream/boosts/latest", a.streamHandler("/token-boosts/latest/v1"))
	r.Get("/v1/stream/boosts/top", a.streamHandler("/token-boosts/top/v1"))

	r.Group(func(r chi.Router) {
		r.Use(a.requireCluster)
		r.Use(a.marketLimit)

		r.Get("/v1/protocol", a.Protocol)
		r.Get("/v1/protocol/state", a.ProtocolState)
		r.Get("/v1/vaults", a.ListVaults)
		r.Get("/v1/vaults/{pubkey}", a.GetVault)
		r.Get("/v1/vaults/{pubkey}/holdings", a.VaultHoldings)
		r.Get("/v1/vaults/{pubkey}/positions", a.VaultPositions)
		r.Get("/v1/vaults/{pubkey}/fees", a.VaultFees)
		r.Get("/v1/vaults/{pubkey}/trades", a.VaultTrades)
		r.Get("/v1/vaults/{pubkey}/nav", a.VaultNav)
		r.Get("/v1/vaults/{pubkey}/payouts", a.VaultPayouts)
		r.Get("/v1/vaults/{pubkey}/follows", a.VaultFollows)
		r.Get("/v1/trades", a.ListTrades)
		r.Get("/v1/strategists/{pubkey}", a.GetStrategist)
		r.Get("/v1/investors/{pubkey}", a.GetInvestor)
		r.Get("/v1/leaderboard", a.Leaderboard)
		r.Get("/v1/tokens/{mint}/price", a.TokenPrice)
		r.Get("/v1/tokens/{mint}/kline", a.TokenKline)
		r.Get("/v1/tokens/{mint}/analyze", a.TokenAnalyze)
		r.Get("/v1/tokens/{mint}/info", a.TokenInfo)
		r.Get("/v1/tokens/{mint}/security", a.TokenSecurity)
		r.Get("/v1/tokens/{mint}/pool", a.TokenPool)
		r.Get("/v1/tokens/{mint}/holders", a.TokenHolders)
		r.Get("/v1/tokens/{mint}/traders", a.TokenTraders)
		r.Get("/v1/tokens/{mint}/research", a.TokenResearch)
		r.Get("/v1/tokens/{mint}/holder-analysis", a.TokenHolderAnalysis)
		r.Get("/v1/tokens/{mint}/detail", a.TokenDetail)
		r.Get("/v1/tokens/{mint}/pairs", a.TokenPairs)
		r.Get("/v1/tokens/{mint}/orders", a.TokenOrders)

		r.Get("/v1/discover/profiles/latest", a.DiscoverProfilesLatest)
		r.Get("/v1/discover/profiles/recent", a.DiscoverProfilesRecent)
		r.Get("/v1/discover/takeovers/latest", a.DiscoverTakeoversLatest)
		r.Get("/v1/discover/ads/latest", a.DiscoverAdsLatest)
		r.Get("/v1/discover/boosts/latest", a.DiscoverBoostsLatest)
		r.Get("/v1/discover/boosts/top", a.DiscoverBoostsTop)
		r.Get("/v1/discover/search", a.DiscoverSearch)
		r.Get("/v1/discover/metas/trending", a.DiscoverMetasTrending)
		r.Get("/v1/discover/metas/{slug}", a.DiscoverMetaBySlug)
		r.Get("/v1/discover/pairs/{chainId}/{pairId}", a.DiscoverPair)

		r.Get("/v1/wallets/{walletAddress}/kind", a.WalletKind)
		r.Get("/v1/wallets/{walletAddress}/holdings", a.WalletHoldings)
		r.Get("/v1/wallets/{walletAddress}/activity", a.WalletActivity)
		r.Get("/v1/wallets/{walletAddress}/stats", a.WalletStats)
		r.Get("/v1/wallets/{walletAddress}/token-balance", a.WalletTokenBalance)
		r.Get("/v1/wallets/{walletAddress}/created-tokens", a.WalletCreatedTokens)
		r.Get("/v1/wallets/{walletAddress}/score", a.WalletScore)
		r.Post("/v1/wallets/profits", a.WalletProfits)

		r.Route("/v1/flows", func(r chi.Router) {
			r.Use(a.ledgerLimit)
			r.Post("/", a.StartFlow)
			r.Get("/", a.ListFlows)
			r.Get("/{id}", a.GetFlow)
			r.Post("/{id}/submit", a.SubmitFlow)
			r.Post("/{id}/refresh", a.RefreshFlow)
			r.Post("/{id}/retry", a.RetryFlow)
			r.Post("/{id}/cancel", a.CancelFlow)
		})

		r.Route("/v1/tx", func(r chi.Router) {
			r.Use(a.ledgerLimit)
			r.Post("/resolve-accounts", a.PrepResolveAccounts)
			r.Post("/register-strategist", a.PrepRegisterStrategist)
			r.Post("/lock-license", a.PrepLockLicense)
			r.Post("/create-vault", a.PrepCreateVault)
			r.With(a.requireAuth).Post("/park", a.PrepPark)
			r.Post("/park-guest", a.PrepPark)
			r.Post("/withdraw", a.PrepWithdraw)
			r.Post("/investor-config", a.PrepInvestorConfig)
			r.Post("/update-investor-config", a.PrepUpdateInvestorConfig)
			r.Post("/follow-on", a.PrepFollowOn)
			r.Post("/follow-off", a.PrepFollowOff)
			r.Post("/request-trade", a.PrepRequestTrade)
			r.Post("/execute-trade", a.PrepExecuteTrade)
			r.Post("/update-vault-risk", a.PrepUpdateVaultRisk)
			r.Post("/exit-position", a.PrepExitPosition)
			r.Post("/reduce-position", a.PrepReducePosition)
			r.Post("/open-position", a.PrepOpenPosition)
			r.Post("/close-position", a.PrepClosePosition)
			r.Post("/accrue-fees", a.PrepAccrueFees)
			r.Post("/claim-fees", a.PrepClaimFees)
			r.Post("/update-nav", a.PrepUpdateNav)
			r.Post("/keeper-refresh", a.PrepKeeperRefresh)
			r.Post("/initiate-close", a.PrepInitiateClose)
			r.Post("/close-vault", a.PrepCloseVault)
			r.Post("/unlock-license", a.PrepUnlockLicense)
			r.Post("/submit", a.TxSubmit)
			r.Get("/status/{signature}", a.TxStatus)
		})

		// STRIPPED / FUTURE write stubs + read-only caches
		r.Post("/v1/features/referral", a.StubReferral)
		r.Post("/v1/features/staking", a.StubStaking)
		r.Post("/v1/features/vault-stake", a.StubVaultStake)
		r.Post("/v1/features/mev", a.StubMEV)
		r.Post("/v1/features/dca", a.StubDCA)
		r.Post("/v1/features/early-exit-fee", a.StubEarlyExitFee)
		r.Post("/v1/features/withdraw-fee", a.StubWithdrawFee)
		r.Post("/v1/features/management-fee", a.StubManagementFee)
		r.Get("/v1/features/referral/rewards", a.ListReferralRewards)
		r.Get("/v1/features/staking/events", a.ListStakingEvents)

		r.Group(func(r chi.Router) {
			r.Use(a.ledgerLimit)
			r.With(a.requireAuth).Post("/v1/ledger/deposits", a.CreateDeposit)
			r.With(a.requireAuth).Post("/v1/ledger/deposits/{id}/submit", a.SubmitDeposit)
			r.With(a.requireAuth).Post("/v1/ledger/deposits/{id}/fail", a.FailDeposit)
			r.With(a.requireAuth).Get("/v1/ledger/deposits", a.ListDeposits)
			r.With(a.requireAuth).Post("/v1/ledger/mandates", a.UpsertMandate)
			r.With(a.requireAuth).Get("/v1/ledger/mandates", a.ListMandates)
			r.Post("/v1/ingest", a.Ingest)
		})
	})

	r.Group(func(r chi.Router) {
		r.Use(a.authLimit)
		r.Get("/v1/auth/twitter/start", a.TwitterStart)
		r.Get("/v1/auth/twitter/callback", a.TwitterCallback)
		r.Post("/v1/auth/refresh", a.Refresh)
		r.Post("/v1/auth/logout", a.Logout)
		r.With(a.requireAuth).Get("/v1/auth/me", a.Me)
		r.With(a.requireAuth).Get("/v1/me", a.Me)
		r.With(a.requireAuth).Get("/v1/wallets/nonce", a.WalletNonce)
		r.With(a.requireAuth).Post("/v1/wallets/bind", a.WalletBind)
	})

	return r
}

func (a *API) requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" {
			id = uuid.NewString()
		}
		if len(id) > 64 {
			id = id[:64]
		}
		next.ServeHTTP(w, httpx.WithValue(r, httpx.KeyRequestID, id))
	})
}

func (a *API) cors(next http.Handler) http.Handler {
	allowed := map[string]struct{}{}
	for _, o := range a.Cfg.CORSOrigins {
		allowed[o] = struct{}{}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			if len(allowed) == 0 {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			} else if _, ok := allowed[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-1Vault-Cluster, X-Request-Id, X-Admin-Key")
			w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				httpx.Fail(w, r, http.StatusInternalServerError, "INTERNAL_ERROR", "Internal server error", nil)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// requestTimeout bounds REST handlers; WebSocket streams are excluded.
func (a *API) requestTimeout(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/v1/stream/") {
			next.ServeHTTP(w, r)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (a *API) requireCluster(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := r.URL.Query().Get("cluster")
		if raw == "" {
			raw = r.Header.Get("X-1Vault-Cluster")
		}
		if raw == "" {
			httpx.Fail(w, r, http.StatusBadRequest, "CLUSTER_REQUIRED", "Pass ?cluster=devnet|mainnet-beta or X-1Vault-Cluster header", nil)
			return
		}
		c, ok := cluster.Parse(raw)
		if !ok {
			httpx.Fail(w, r, http.StatusBadRequest, "CLUSTER_INVALID", "cluster must be devnet or mainnet-beta", nil)
			return
		}
		next.ServeHTTP(w, httpx.WithValue(r, httpx.KeyCluster, c))
	})
}

func (a *API) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := r.Header.Get("Authorization")
		if !strings.HasPrefix(strings.ToLower(h), "bearer ") {
			httpx.Fail(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "Missing Bearer access token", nil)
			return
		}
		token := strings.TrimSpace(h[7:])
		claims, err := auth.ParseAccess(a.Cfg.JWTSecret, token)
		if err != nil {
			httpx.Fail(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid or expired access token", nil)
			return
		}
		r = httpx.WithValue(r, httpx.KeyUserID, claims.Subject)
		r = httpx.WithValue(r, httpx.KeyTwitterID, claims.TwitterID)
		next.ServeHTTP(w, r)
	})
}

type simpleLimiter struct {
	tokens float64
	last   time.Time
	rate   float64
	burst  float64
}

func newLimiter(rps float64, burst float64) *simpleLimiter {
	return &simpleLimiter{tokens: burst, last: time.Now(), rate: rps, burst: burst}
}

func (l *simpleLimiter) allow() bool {
	now := time.Now()
	elapsed := now.Sub(l.last).Seconds()
	l.last = now
	l.tokens += elapsed * l.rate
	if l.tokens > l.burst {
		l.tokens = l.burst
	}
	if l.tokens < 1 {
		return false
	}
	l.tokens--
	return true
}

func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.TrimSpace(strings.Split(xff, ",")[0])
	}
	host := r.RemoteAddr
	if i := strings.LastIndex(host, ":"); i >= 0 {
		return host[:i]
	}
	return host
}

func (a *API) authLimit(next http.Handler) http.Handler {
	return a.limitMW(&a.authLimits, 60.0/900.0, 60, next)
}

func (a *API) ledgerLimit(next http.Handler) http.Handler {
	return a.limitMW(&a.ledgerLimits, 30.0/60.0, 30, next)
}

func (a *API) marketLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if strings.HasPrefix(path, "/v1/tokens/") ||
			strings.HasPrefix(path, "/v1/discover/") ||
			strings.HasPrefix(path, "/v1/wallets/") {
			a.limitMW(&a.marketLimits, 120.0/60.0, 40, next).ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) limitMW(store *map[string]*simpleLimiter, rps, burst float64, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := clientIP(r)
		a.limitMu.Lock()
		lim, ok := (*store)[ip]
		if !ok {
			lim = newLimiter(rps, burst)
			(*store)[ip] = lim
			// Bound map growth: prune when large (lazy).
			if len(*store) > 10_000 {
				*store = map[string]*simpleLimiter{ip: lim}
			}
		}
		okAllow := lim.allow()
		a.limitMu.Unlock()
		if !okAllow {
			httpx.Fail(w, r, http.StatusTooManyRequests, "RATE_LIMITED", "Too many requests", nil)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) addresses(r *http.Request) cluster.Addresses {
	return cluster.AddressesFor(httpx.ClusterFrom(r), a.Cfg.DevnetRPCURL, a.Cfg.MainnetRPCURL)
}
