package handlers

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/1vault/backend/internal/auth"
	"github.com/1vault/backend/internal/cluster"
	"github.com/1vault/backend/internal/httpx"
	"github.com/1vault/backend/internal/roles"
	"github.com/1vault/backend/internal/vaults"
	"github.com/1vault/backend/internal/wallets"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/errgroup"
)

func (a *API) Health(w http.ResponseWriter, r *http.Request) {
	// Liveness for Railway/load balancers: always 200 if the process is serving.
	// DB status is reported in the body; do not fail the probe on remote latency.
	dbOK := false
	dbDetail := "down"
	if a.Pool != nil {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		err := a.Pool.Ping(ctx)
		cancel()
		if err == nil {
			dbOK = true
			dbDetail = "up"
		} else if a.Pool.Stat().TotalConns() > 0 {
			dbOK = true
			dbDetail = "degraded"
		}
	}
	c := cluster.Cluster(a.Cfg.DefaultCluster)
	r = httpx.WithValue(r, httpx.KeyCluster, c)
	httpx.OK(w, r, map[string]any{
		"ok":             true,
		"service":        "1vault-backend",
		"version":        "v1",
		"runtime":        "go",
		"defaultCluster": a.Cfg.DefaultCluster,
		"database":       dbDetail,
		"databaseOk":     dbOK,
		"indexer":        a.indexerHealthDetail(),
		"clusterHint":    firstNonEmpty(r.URL.Query().Get("cluster"), a.Cfg.DefaultCluster),
	}, http.StatusOK)
}

func (a *API) Protocol(w http.ResponseWriter, r *http.Request) {
	cfg := a.addresses(r)
	httpx.OK(w, r, map[string]any{
		"cluster":             cfg.Cluster,
		"programId":           cfg.ProgramID,
		"protocolConfig":      cfg.ProtocolConfig,
		"platformWallet":      cfg.PlatformWallet,
		"strategiesFeeWallet": cfg.DegenFeeWallet,
		"licenseMint":         cfg.LicenseMint,
		"wsolMint":            cfg.WsolMint,
		"licenseLockAmount":   cfg.LicenseLockAmount,
		"performanceFeeBps":   cfg.PerformanceFeeBps,
		"rpcUrl":              cluster.RedactRPC(cfg.RPCURL),
		"allowedDexPrograms":  cfg.AllowedDexPrograms,
		"allowedDexProgram":   cfg.AllowedDexProgram,
		"dexPrograms":         cfg.DexPrograms,
	}, http.StatusOK)
}

func (a *API) ListVaults(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	filterType := ""
	if raw := r.URL.Query().Get("vaultType"); raw != "" {
		t, ok := vaults.Parse(raw)
		if !ok {
			httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "vaultType must be pooled|sliced", nil)
			return
		}
		filterType = string(t)
	}

	key := fmt.Sprintf("vaults:p=%d:ps=%d:t=%s", page, pageSize, filterType)
	a.okCachedDB(w, r, key, 12*time.Second, func() (any, error) {
		const listSQL = `
			SELECT v.*,
				COALESCE(NULLIF(r.vault_type,''), NULLIF(v.vault_type,''), 'pooled') AS resolved_vault_type,
				COUNT(*) OVER() AS _total
			FROM vaults v
			LEFT JOIN vault_type_registry r ON r.vault_pubkey = v.pubkey
			WHERE ($1::text = '' OR COALESCE(NULLIF(r.vault_type,''), NULLIF(v.vault_type,''), 'pooled') = $1)
			ORDER BY v.updated_at DESC
			LIMIT $2 OFFSET $3`
		items, err := queryMaps(r.Context(), a.Pool, listSQL, filterType, pageSize, offset)
		if err != nil {
			return nil, err
		}
		total := 0
		for _, it := range items {
			if total == 0 {
				total = intFromAny(it["_total"])
			}
			delete(it, "_total")
			vt := vaults.FromResolved(stringField(it, "resolved_vault_type"))
			delete(it, "resolved_vault_type")
			vaults.Attach(it, vt)
		}
		return map[string]any{"items": items, "page": page, "pageSize": pageSize, "total": total}, nil
	})
}

func (a *API) GetVault(w http.ResponseWriter, r *http.Request) {
	pubkey := chi.URLParam(r, "pubkey")
	a.okCachedErr(w, r, a.DBCache, "vault:"+pubkey, 10*time.Second, func() (any, error) {
		ctx := r.Context()
		var vault any
		var resolvedType string
		err := a.Pool.QueryRow(ctx, `
			SELECT row_to_json(v),
				COALESCE(NULLIF(r.vault_type,''), NULLIF(v.vault_type,''), 'pooled')
			FROM vaults v
			LEFT JOIN vault_type_registry r ON r.vault_pubkey = v.pubkey
			WHERE v.pubkey=$1`, pubkey).Scan(&vault, &resolvedType)
		if err != nil {
			return nil, err
		}
		vt := vaults.FromResolved(resolvedType)
		if vm, ok := vault.(map[string]any); ok {
			vault = vaults.Attach(vm, vt)
		}
		var pnl, trades []map[string]any
		var eg errgroup.Group
		eg.Go(func() error {
			var e error
			pnl, e = queryMaps(ctx, a.Pool, `SELECT * FROM pnl_snapshots WHERE vault=$1 ORDER BY snapshot_at DESC LIMIT 100`, pubkey)
			return e
		})
		eg.Go(func() error {
			var e error
			trades, e = queryMaps(ctx, a.Pool, `SELECT * FROM trades WHERE vault=$1 ORDER BY block_time DESC LIMIT 50`, pubkey)
			return e
		})
		_ = eg.Wait()
		return vaults.Attach(withWalletKind(map[string]any{
			"vault":  vault,
			"pnl":    pnl,
			"trades": trades,
			"wallet": pubkey,
		}, wallets.KindPDA), vt), nil
	}, func(err error) bool {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, r, http.StatusNotFound, "VAULT_NOT_FOUND", "Vault not found", nil)
			return true
		}
		return false
	})
}

func (a *API) VaultHoldings(w http.ResponseWriter, r *http.Request) {
	pubkey := chi.URLParam(r, "pubkey")
	a.okCachedDB(w, r, "vault-holdings:"+pubkey, 10*time.Second, func() (any, error) {
		items, err := queryMaps(r.Context(), a.Pool, `SELECT * FROM vault_holder_book WHERE vault=$1 ORDER BY role ASC, deposited DESC`, pubkey)
		if err != nil {
			return nil, err
		}
		vt := vaults.Classify(r.Context(), a.Pool, pubkey)
		return vaults.Attach(withWalletKind(map[string]any{
			"wallet": pubkey,
			"items":  mapRoleFields(items),
		}, wallets.KindPDA), vt), nil
	})
}

func (a *API) VaultPositions(w http.ResponseWriter, r *http.Request) {
	pubkey := chi.URLParam(r, "pubkey")
	a.okCachedDB(w, r, "vault-pos:"+pubkey, 10*time.Second, func() (any, error) {
		ctx := r.Context()
		var vaultPos, inv []map[string]any
		var eg errgroup.Group
		eg.Go(func() error {
			var e error
			vaultPos, e = queryMaps(ctx, a.Pool, `SELECT * FROM vault_positions WHERE vault=$1 ORDER BY position_id DESC LIMIT 50`, pubkey)
			return e
		})
		eg.Go(func() error {
			var e error
			inv, e = queryMaps(ctx, a.Pool, `SELECT * FROM investor_positions WHERE vault=$1 ORDER BY opened_at DESC LIMIT 100`, pubkey)
			return e
		})
		if err := eg.Wait(); err != nil {
			return nil, err
		}
		vt := vaults.Classify(ctx, a.Pool, pubkey)
		return vaults.Attach(map[string]any{"vault": vaultPos, "investors": inv, "wallet": pubkey}, vt), nil
	})
}

func (a *API) VaultFees(w http.ResponseWriter, r *http.Request) {
	pk := chi.URLParam(r, "pubkey")
	a.okCachedDB(w, r, "vault-fees:"+pk, 15*time.Second, func() (any, error) {
		items, err := queryMaps(r.Context(), a.Pool, `SELECT * FROM fee_accruals WHERE vault=$1 ORDER BY created_at DESC LIMIT 100`, pk)
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items}, nil
	})
}

func (a *API) VaultTrades(w http.ResponseWriter, r *http.Request) {
	pk := chi.URLParam(r, "pubkey")
	a.okCachedDB(w, r, "vault-trades:"+pk, 10*time.Second, func() (any, error) {
		items, err := queryMaps(r.Context(), a.Pool, `SELECT * FROM trades WHERE vault=$1 ORDER BY block_time DESC LIMIT 100`, pk)
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items}, nil
	})
}

func (a *API) Leaderboard(w http.ResponseWriter, r *http.Request) {
	// Top 10 vaults by realized performance (return_pct = profit %), highest first.
	const limit = 10
	a.okCachedDB(w, r, "leaderboard:top10:return_pct", 15*time.Second, func() (any, error) {
		items, err := queryMaps(r.Context(), a.Pool, `
			SELECT * FROM vault_leaderboard
			ORDER BY return_pct DESC NULLS LAST, nav DESC NULLS LAST
			LIMIT $1`, limit)
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items, "limit": limit, "orderBy": "return_pct"}, nil
	})
}

func (a *API) allowedReturnTo(raw string) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return false
	}
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return false
	}
	// Open CORS mode: any http(s) returnTo is allowed.
	if len(a.Cfg.CORSOrigins) == 0 {
		return true
	}
	origin := u.Scheme + "://" + u.Host
	allowed := append([]string{}, a.Cfg.CORSOrigins...)
	if fb := strings.TrimSpace(a.Cfg.FrontendURL); fb != "" {
		allowed = append(allowed, fb)
	}
	for _, o := range allowed {
		o = strings.TrimSuffix(strings.TrimSpace(o), "/")
		if o == origin {
			return true
		}
	}
	return false
}

func (a *API) TwitterStart(w http.ResponseWriter, r *http.Request) {
	if !a.Cfg.TwitterConfigured() {
		httpx.Fail(w, r, http.StatusServiceUnavailable, "TWITTER_NOT_CONFIGURED", "Set TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET", nil)
		return
	}
	state, err := auth.RandomURL(24)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	verifier, challenge, err := auth.PKCE()
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	expires := time.Now().Add(10 * time.Minute)
	returnTo := strings.TrimSpace(r.URL.Query().Get("returnTo"))
	if returnTo != "" && !a.allowedReturnTo(returnTo) {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "returnTo origin not allowed (set CORS_ORIGINS)", map[string]any{"returnTo": returnTo})
		return
	}
	var returnArg any
	if returnTo != "" {
		returnArg = returnTo
	}
	_, err = a.Pool.Exec(r.Context(), `INSERT INTO auth_states (state, code_verifier, expires_at, return_to) VALUES ($1,$2,$3,$4)`, state, verifier, expires, returnArg)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	url := auth.BuildTwitterAuthURL(a.Cfg.TwitterClientID, a.Cfg.TwitterCallback, state, challenge)
	c := cluster.Cluster(a.Cfg.DefaultCluster)
	r = httpx.WithValue(r, httpx.KeyCluster, c)
	httpx.OK(w, r, map[string]any{"url": url, "state": state}, http.StatusOK)
}

func (a *API) TwitterCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	c := cluster.Cluster(a.Cfg.DefaultCluster)
	r = httpx.WithValue(r, httpx.KeyCluster, c)
	if code == "" || state == "" {
		httpx.Fail(w, r, http.StatusBadRequest, "OAUTH_INVALID", "code and state are required", nil)
		return
	}
	var verifier string
	var returnTo sql.NullString
	err := a.Pool.QueryRow(r.Context(), `SELECT code_verifier, return_to FROM auth_states WHERE state=$1 AND expires_at > NOW()`, state).Scan(&verifier, &returnTo)
	_, _ = a.Pool.Exec(r.Context(), `DELETE FROM auth_states WHERE state=$1`, state)
	if err != nil {
		httpx.Fail(w, r, http.StatusBadRequest, "OAUTH_STATE_INVALID", "OAuth state expired or unknown", nil)
		return
	}
	token, err := auth.ExchangeTwitterCode(a.Cfg.TwitterClientID, a.Cfg.TwitterSecret, a.Cfg.TwitterCallback, code, verifier)
	if err != nil {
		httpx.Fail(w, r, http.StatusBadGateway, "TWITTER_TOKEN_FAILED", err.Error(), nil)
		return
	}
	me, err := auth.FetchTwitterMe(token)
	if err != nil {
		httpx.Fail(w, r, http.StatusBadGateway, "TWITTER_ME_FAILED", err.Error(), nil)
		return
	}
	var userID, handle, displayName, avatar string
	var twitterID string
	err = a.Pool.QueryRow(r.Context(), `
		INSERT INTO users (twitter_id, handle, display_name, avatar_url, updated_at)
		VALUES ($1,$2,$3,$4,NOW())
		ON CONFLICT (twitter_id) DO UPDATE SET
			handle=EXCLUDED.handle, display_name=EXCLUDED.display_name, avatar_url=EXCLUDED.avatar_url, updated_at=NOW()
		RETURNING id::text, twitter_id, handle, COALESCE(display_name,''), COALESCE(avatar_url,'')`,
		me.ID, me.Username, me.Name, nullIfEmpty(me.ProfileImageURL),
	).Scan(&userID, &twitterID, &handle, &displayName, &avatar)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	access, err := auth.SignAccess(a.Cfg.JWTSecret, a.Cfg.JWTAccessTTL, userID, twitterID, handle)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	refresh, err := auth.NewRefreshToken()
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	exp := time.Now().AddDate(0, 0, a.Cfg.JWTRefreshTTLDays)
	_, err = a.Pool.Exec(r.Context(), `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1::uuid,$2,$3)`, userID, auth.HashToken(refresh), exp)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	if strings.Contains(r.Header.Get("Accept"), "text/html") || (returnTo.Valid && returnTo.String != "") {
		target := strings.TrimSuffix(a.Cfg.FrontendURL, "/") + "/auth/callback"
		if returnTo.Valid && returnTo.String != "" {
			target = strings.TrimSuffix(returnTo.String, "/")
		}
		http.Redirect(w, r, target+"#accessToken="+url.QueryEscape(access)+"&refreshToken="+url.QueryEscape(refresh), http.StatusFound)
		return
	}
	httpx.OK(w, r, map[string]any{
		"accessToken":  access,
		"refreshToken": refresh,
		"user": map[string]any{
			"id": userID, "twitterId": twitterID, "handle": handle,
			"displayName": displayName, "avatarUrl": avatar,
		},
	}, http.StatusOK)
}

func (a *API) Refresh(w http.ResponseWriter, r *http.Request) {
	c := cluster.Cluster(a.Cfg.DefaultCluster)
	r = httpx.WithValue(r, httpx.KeyCluster, c)
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.RefreshToken) < 20 {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "refreshToken required", nil)
		return
	}
	hashed := auth.HashToken(body.RefreshToken)
	var userID, twitterID, handle, tokenID string
	err := a.Pool.QueryRow(r.Context(), `
		SELECT rt.id::text, rt.user_id::text, u.twitter_id, u.handle
		FROM refresh_tokens rt JOIN users u ON u.id=rt.user_id
		WHERE rt.token_hash=$1 AND rt.revoked_at IS NULL AND rt.expires_at > NOW()`, hashed,
	).Scan(&tokenID, &userID, &twitterID, &handle)
	if err != nil {
		httpx.Fail(w, r, http.StatusUnauthorized, "REFRESH_INVALID", "Refresh token invalid or expired", nil)
		return
	}
	_, _ = a.Pool.Exec(r.Context(), `UPDATE refresh_tokens SET revoked_at=NOW() WHERE id=$1::uuid`, tokenID)
	access, err := auth.SignAccess(a.Cfg.JWTSecret, a.Cfg.JWTAccessTTL, userID, twitterID, handle)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	refresh, err := auth.NewRefreshToken()
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	exp := time.Now().AddDate(0, 0, a.Cfg.JWTRefreshTTLDays)
	_, err = a.Pool.Exec(r.Context(), `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1::uuid,$2,$3)`, userID, auth.HashToken(refresh), exp)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, map[string]any{"accessToken": access, "refreshToken": refresh}, http.StatusOK)
}

func (a *API) Logout(w http.ResponseWriter, r *http.Request) {
	c := cluster.Cluster(a.Cfg.DefaultCluster)
	r = httpx.WithValue(r, httpx.KeyCluster, c)
	var body struct {
		RefreshToken string `json:"refreshToken"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.RefreshToken) < 20 {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "refreshToken required", nil)
		return
	}
	_, _ = a.Pool.Exec(r.Context(), `UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1 AND revoked_at IS NULL`, auth.HashToken(body.RefreshToken))
	httpx.OK(w, r, map[string]any{"loggedOut": true}, http.StatusOK)
}

func (a *API) Me(w http.ResponseWriter, r *http.Request) {
	c := cluster.Cluster(a.Cfg.DefaultCluster)
	r = httpx.WithValue(r, httpx.KeyCluster, c)
	userID := httpx.UserID(r)
	var id, twitterID, handle, displayName, avatar string
	var createdAt time.Time
	err := a.Pool.QueryRow(r.Context(), `
		SELECT id::text, twitter_id, handle, COALESCE(display_name,''), COALESCE(avatar_url,''), created_at
		FROM users WHERE id=$1::uuid`, userID).Scan(&id, &twitterID, &handle, &displayName, &avatar, &createdAt)
	if err != nil {
		httpx.Fail(w, r, http.StatusNotFound, "USER_NOT_FOUND", "User not found", nil)
		return
	}
	walletsRows, _ := queryMaps(r.Context(), a.Pool, `
		SELECT pubkey, role_preference AS "rolePreference", is_primary AS "isPrimary", verified_at AS "verifiedAt"
		FROM user_wallets WHERE user_id=$1::uuid ORDER BY is_primary DESC, created_at ASC`, userID)
	for i := range walletsRows {
		if rp, ok := walletsRows[i]["rolePreference"].(string); ok {
			apiRole := roles.FromDB(rp)
			walletsRows[i]["rolePreference"] = apiRole
			walletsRows[i]["rolePreferenceLabel"] = roles.Label(apiRole)
		}
		// Bound account wallets are always individual EOAs (not vault PDAs).
		walletsRows[i]["walletKind"] = string(wallets.KindEOA)
		walletsRows[i]["walletKindLabel"] = wallets.KindEOA.Label()
		walletsRows[i]["walletKindMeaning"] = wallets.KindEOA.Description()
	}
	httpx.OK(w, r, map[string]any{
		"id": id, "twitterId": twitterID, "handle": handle,
		"displayName": displayName, "avatarUrl": avatar, "createdAt": createdAt, "wallets": walletsRows,
	}, http.StatusOK)
}

func (a *API) WalletNonce(w http.ResponseWriter, r *http.Request) {
	c := cluster.Cluster(a.Cfg.DefaultCluster)
	r = httpx.WithValue(r, httpx.KeyCluster, c)
	pubkey := strings.TrimSpace(r.URL.Query().Get("pubkey"))
	if len(pubkey) < 32 {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "pubkey query required", nil)
		return
	}
	nonce, err := auth.RandomURL(16)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	issuedAt := time.Now().UTC().Format(time.RFC3339)
	domain := r.Host
	if i := strings.Index(domain, ":"); i >= 0 {
		domain = domain[:i]
	}
	msg := auth.BuildBindMessage(domain, pubkey, nonce, issuedAt)
	expires := time.Now().Add(10 * time.Minute)
	_, err = a.Pool.Exec(r.Context(), `INSERT INTO wallet_nonces (user_id, nonce, message, expires_at) VALUES ($1::uuid,$2,$3,$4)`, httpx.UserID(r), nonce, msg, expires)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, map[string]any{"nonce": nonce, "message": msg, "expiresAt": expires.UTC().Format(time.RFC3339)}, http.StatusOK)
}

func (a *API) WalletBind(w http.ResponseWriter, r *http.Request) {
	c := cluster.Cluster(a.Cfg.DefaultCluster)
	r = httpx.WithValue(r, httpx.KeyCluster, c)
	var body struct {
		Pubkey         string `json:"pubkey"`
		Signature      string `json:"signature"`
		Nonce          string `json:"nonce"`
		RolePreference string `json:"rolePreference"`
		Primary        bool   `json:"primary"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Pubkey) < 32 || body.Signature == "" || body.Nonce == "" {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Invalid bind payload", nil)
		return
	}
	if body.RolePreference == "" {
		body.RolePreference = roles.DefaultAPI()
	}
	apiRole, ok := roles.ParseAPI(body.RolePreference)
	if !ok {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "rolePreference must be strategies|investors", nil)
		return
	}
	dbRole := roles.ToDB(apiRole)
	// Account bind is for individual EOAs only — vault PDAs cannot be bound as user wallets.
	if wallets.Classify(r.Context(), a.Pool, body.Pubkey) == wallets.KindPDA {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "WALLET_KIND_INVALID", "Cannot bind a vault PDA; use an individual (EOA) wallet", map[string]any{
			"walletKind":        string(wallets.KindPDA),
			"walletKindLabel":   wallets.KindPDA.Label(),
			"walletKindMeaning": wallets.KindPDA.Description(),
		})
		return
	}
	var nonceID, message string
	err := a.Pool.QueryRow(r.Context(), `
		SELECT id::text, message FROM wallet_nonces
		WHERE user_id=$1::uuid AND nonce=$2 AND used_at IS NULL AND expires_at > NOW()`,
		httpx.UserID(r), body.Nonce).Scan(&nonceID, &message)
	if err != nil {
		httpx.Fail(w, r, http.StatusBadRequest, "NONCE_INVALID", "Nonce expired or already used", nil)
		return
	}
	if !strings.Contains(message, body.Pubkey) {
		httpx.Fail(w, r, http.StatusBadRequest, "NONCE_MISMATCH", "Nonce was issued for a different pubkey", nil)
		return
	}
	if !auth.VerifyWalletSignature(body.Pubkey, message, body.Signature) {
		httpx.Fail(w, r, http.StatusUnauthorized, "SIGNATURE_INVALID", "Wallet signature verification failed", nil)
		return
	}
	_, _ = a.Pool.Exec(r.Context(), `UPDATE wallet_nonces SET used_at=NOW() WHERE id=$1::uuid`, nonceID)
	var count int
	_ = a.Pool.QueryRow(r.Context(), `SELECT COUNT(*)::int FROM user_wallets WHERE user_id=$1::uuid`, httpx.UserID(r)).Scan(&count)
	makePrimary := body.Primary || count == 0
	if makePrimary {
		_, _ = a.Pool.Exec(r.Context(), `UPDATE user_wallets SET is_primary=FALSE WHERE user_id=$1::uuid`, httpx.UserID(r))
	}
	row := a.Pool.QueryRow(r.Context(), `
		INSERT INTO user_wallets (user_id, pubkey, role_preference, is_primary, verified_at)
		VALUES ($1::uuid,$2,$3,$4,NOW())
		ON CONFLICT (user_id, pubkey) DO UPDATE SET
			role_preference=EXCLUDED.role_preference, is_primary=EXCLUDED.is_primary, verified_at=NOW()
		RETURNING pubkey, role_preference, is_primary, verified_at`,
		httpx.UserID(r), body.Pubkey, dbRole, makePrimary)
	var pubkey, role string
	var primary bool
	var verified time.Time
	if err := row.Scan(&pubkey, &role, &primary, &verified); err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	outRole := roles.FromDB(role)
	httpx.OK(w, r, map[string]any{
		"wallet": withWalletKind(map[string]any{
			"pubkey": pubkey, "rolePreference": outRole, "rolePreferenceLabel": roles.Label(outRole),
			"isPrimary": primary, "verifiedAt": verified,
		}, wallets.KindEOA),
	}, http.StatusOK)
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func stringField(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return t
	default:
		return fmt.Sprint(t)
	}
}

func intFromAny(v any) int {
	switch n := v.(type) {
	case int64:
		return int(n)
	case int32:
		return int(n)
	case int:
		return n
	case float64:
		return int(n)
	default:
		return 0
	}
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
