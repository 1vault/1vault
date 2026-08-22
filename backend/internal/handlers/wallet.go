package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/1vault/backend/internal/gmgn"
	"github.com/1vault/backend/internal/httpx"
	"github.com/1vault/backend/internal/wallets"
	"github.com/go-chi/chi/v5"
)

func (a *API) walletKindFromRequest(r *http.Request, address string) wallets.Kind {
	explicit := r.URL.Query().Get("walletKind")
	if explicit == "" {
		explicit = r.URL.Query().Get("walletType") // alias
	}
	return wallets.Resolve(r.Context(), a.Pool, address, explicit)
}

func (a *API) requireWalletKindQuery(w http.ResponseWriter, r *http.Request) bool {
	raw := r.URL.Query().Get("walletKind")
	if raw == "" {
		raw = r.URL.Query().Get("walletType")
	}
	if raw == "" {
		return true
	}
	if _, ok := wallets.Parse(raw); ok {
		return true
	}
	httpx.Fail(w, r, 422, "VALIDATION_ERROR", "walletKind must be eoa (individual) or pda (vault)", nil)
	return false
}

func withWalletKind(payload map[string]any, kind wallets.Kind) map[string]any {
	for k, v := range wallets.Meta(kind) {
		payload[k] = v
	}
	return payload
}

// WalletKind classifies an address as pda (vault) or eoa (individual).
func (a *API) WalletKind(w http.ResponseWriter, r *http.Request) {
	if !a.requireWalletKindQuery(w, r) {
		return
	}
	wallet := chi.URLParam(r, "walletAddress")
	if wallet == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "walletAddress required", nil)
		return
	}
	kind := a.walletKindFromRequest(r, wallet)
	httpx.OK(w, r, withWalletKind(map[string]any{
		"wallet": wallet,
		"chain":  gmgn.DefaultChain,
	}, kind), http.StatusOK)
}

func (a *API) WalletHoldings(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	if !a.requireWalletKindQuery(w, r) {
		return
	}
	if !c.SigningEnabled() {
		httpx.Fail(w, r, http.StatusServiceUnavailable, "MARKET_SIGNING_REQUIRED", "Holdings require market signing key", nil)
		return
	}
	wallet := chi.URLParam(r, "walletAddress")
	if wallet == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "walletAddress required", nil)
		return
	}
	p := gmgn.WalletHoldingsParams{
		Cursor:    r.URL.Query().Get("cursor"),
		OrderBy:   r.URL.Query().Get("orderBy"),
		Direction: r.URL.Query().Get("direction"),
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			p.Limit = n
		}
	}
	p.HideAirdrop = r.URL.Query().Get("hideAirdrop") != "false"
	p.HideClosed = r.URL.Query().Get("hideClosed") != "false"
	p.HideAbnormal = r.URL.Query().Get("hideAbnormal") == "true"
	p.SellOut = r.URL.Query().Get("sellOut") == "true"
	raw, err := c.WalletHoldings(r.Context(), gmgn.DefaultChain, wallet, p)
	if err != nil {
		a.writeGMGNErr(w, r, err)
		return
	}
	kind := a.walletKindFromRequest(r, wallet)
	httpx.OK(w, r, withWalletKind(map[string]any{
		"wallet":   wallet,
		"chain":    gmgn.DefaultChain,
		"holdings": json.RawMessage(raw),
	}, kind), http.StatusOK)
}

func (a *API) WalletActivity(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	if !a.requireWalletKindQuery(w, r) {
		return
	}
	wallet := chi.URLParam(r, "walletAddress")
	if wallet == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "walletAddress required", nil)
		return
	}
	p := gmgn.WalletActivityParams{
		Token:  r.URL.Query().Get("token"),
		Cursor: r.URL.Query().Get("cursor"),
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			p.Limit = n
		}
	}
	if types := r.URL.Query()["type"]; len(types) > 0 {
		p.Types = types
	} else if t := r.URL.Query().Get("types"); t != "" {
		p.Types = strings.Split(t, ",")
	}
	key := "wactivity:" + wallet + ":" + p.Token + ":" + p.Cursor + ":" + strconv.Itoa(p.Limit) + ":" + strings.Join(p.Types, ",")
	a.okCachedGMGN(w, r, key, 12*time.Second, func() (any, error) {
		raw, err := c.WalletActivity(r.Context(), gmgn.DefaultChain, wallet, p)
		if err != nil {
			return nil, err
		}
		kind := a.walletKindFromRequest(r, wallet)
		return withWalletKind(map[string]any{
			"wallet":   wallet,
			"chain":    gmgn.DefaultChain,
			"activity": json.RawMessage(raw),
		}, kind), nil
	})
}

func (a *API) WalletStats(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	if !a.requireWalletKindQuery(w, r) {
		return
	}
	wallet := chi.URLParam(r, "walletAddress")
	if wallet == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "walletAddress required", nil)
		return
	}
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "7d"
	}
	addrs := []string{wallet}
	if extra := r.URL.Query()["wallet"]; len(extra) > 0 {
		addrs = append(addrs, extra...)
	}
	key := "wstats:" + period + ":" + strings.Join(addrs, ",")
	a.okCachedGMGN(w, r, key, 15*time.Second, func() (any, error) {
		raw, err := c.WalletStats(r.Context(), gmgn.DefaultChain, addrs, period)
		if err != nil {
			return nil, err
		}
		explicit := r.URL.Query().Get("walletKind")
		if explicit == "" {
			explicit = r.URL.Query().Get("walletType")
		}
		overrides := map[string]string{}
		if explicit != "" {
			overrides[wallet] = explicit
		}
		kinds := wallets.ResolveMany(r.Context(), a.Pool, addrs, overrides)
		primary := kinds[wallet]
		return withWalletKind(map[string]any{
			"wallets":     addrs,
			"walletKinds": wallets.MetaMap(kinds),
			"chain":       gmgn.DefaultChain,
			"period":      period,
			"stats":       json.RawMessage(raw),
		}, primary), nil
	})
}

func (a *API) WalletTokenBalance(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	if !a.requireWalletKindQuery(w, r) {
		return
	}
	wallet := chi.URLParam(r, "walletAddress")
	token := r.URL.Query().Get("token")
	if wallet == "" || token == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "walletAddress and token required", nil)
		return
	}
	raw, err := c.WalletTokenBalance(r.Context(), gmgn.DefaultChain, wallet, token)
	if err != nil {
		a.writeGMGNErr(w, r, err)
		return
	}
	kind := a.walletKindFromRequest(r, wallet)
	httpx.OK(w, r, withWalletKind(map[string]any{
		"wallet":  wallet,
		"token":   token,
		"chain":   gmgn.DefaultChain,
		"balance": json.RawMessage(raw),
	}, kind), http.StatusOK)
}

func (a *API) WalletCreatedTokens(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	if !a.requireWalletKindQuery(w, r) {
		return
	}
	wallet := chi.URLParam(r, "walletAddress")
	if wallet == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "walletAddress required", nil)
		return
	}
	p := gmgn.CreatedTokensParams{
		OrderBy:      r.URL.Query().Get("orderBy"),
		Direction:    r.URL.Query().Get("direction"),
		MigrateState: r.URL.Query().Get("migrateState"),
	}
	raw, err := c.CreatedTokens(r.Context(), gmgn.DefaultChain, wallet, p)
	if err != nil {
		a.writeGMGNErr(w, r, err)
		return
	}
	kind := a.walletKindFromRequest(r, wallet)
	httpx.OK(w, r, withWalletKind(map[string]any{
		"wallet": wallet,
		"chain":  gmgn.DefaultChain,
		"tokens": json.RawMessage(raw),
	}, kind), http.StatusOK)
}

func (a *API) WalletScore(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	if !a.requireWalletKindQuery(w, r) {
		return
	}
	wallet := chi.URLParam(r, "walletAddress")
	if wallet == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "walletAddress required", nil)
		return
	}
	p := gmgn.WalletScoreParams{}
	if v := r.URL.Query().Get("latency"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			p.LatencyS = n
		}
	}
	if v := r.URL.Query().Get("slippage"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			p.SlippagePct = n
		}
	}
	if v := r.URL.Query().Get("gas"); v != "" {
		if n, err := strconv.ParseFloat(v, 64); err == nil {
			p.GasUSD = n
		}
	}
	if v := r.URL.Query().Get("sample"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			p.Sample = n
		}
	}
	out, err := c.WalletScore(r.Context(), wallet, p)
	if err != nil {
		a.writeGMGNErr(w, r, err)
		return
	}
	kind := a.walletKindFromRequest(r, wallet)
	payload := map[string]any{
		"wallet": wallet,
		"score":  out,
	}
	httpx.OK(w, r, withWalletKind(payload, kind), http.StatusOK)
}

func (a *API) WalletProfits(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	var body struct {
		Wallets     []string          `json:"wallets"`
		Period      string            `json:"period"`
		WalletKind  string            `json:"walletKind"`  // default for all if set
		WalletKinds map[string]string `json:"walletKinds"` // per-address override
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json body", nil)
		return
	}
	if len(body.Wallets) == 0 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "wallets required", nil)
		return
	}
	if len(body.Wallets) > 100 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "max 100 wallets", nil)
		return
	}
	if body.Period == "" {
		body.Period = "7d"
	}
	if body.WalletKind != "" {
		if _, ok := wallets.Parse(body.WalletKind); !ok {
			httpx.Fail(w, r, 422, "VALIDATION_ERROR", "walletKind must be eoa (individual) or pda (vault)", nil)
			return
		}
	}
	for addr, k := range body.WalletKinds {
		if _, ok := wallets.Parse(k); !ok {
			httpx.Fail(w, r, 422, "VALIDATION_ERROR", "walletKinds["+addr+"] must be eoa or pda", nil)
			return
		}
	}
	raw, err := c.WalletProfits(r.Context(), gmgn.DefaultChain, body.Wallets, body.Period)
	if err != nil {
		a.writeGMGNErr(w, r, err)
		return
	}
	overrides := map[string]string{}
	if body.WalletKinds != nil {
		for k, v := range body.WalletKinds {
			overrides[k] = v
		}
	}
	if body.WalletKind != "" {
		for _, addr := range body.Wallets {
			if _, ok := overrides[addr]; !ok {
				overrides[addr] = body.WalletKind
			}
		}
	}
	kinds := wallets.ResolveMany(r.Context(), a.Pool, body.Wallets, overrides)
	httpx.OK(w, r, map[string]any{
		"wallets":     body.Wallets,
		"walletKinds": wallets.MetaMap(kinds),
		"chain":       gmgn.DefaultChain,
		"period":      body.Period,
		"profits":     json.RawMessage(raw),
	}, http.StatusOK)
}

func (a *API) TokenHolderAnalysis(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	a.okCachedGMGN(w, r, "holder-analysis:"+mint, 45*time.Second, func() (any, error) {
		return c.HolderAnalysis(r.Context(), mint)
	})
}
