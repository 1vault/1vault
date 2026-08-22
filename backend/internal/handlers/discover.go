package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/1vault/backend/internal/dex"
	"github.com/1vault/backend/internal/gmgn"
	"github.com/1vault/backend/internal/httpx"
	"github.com/go-chi/chi/v5"
)

func (a *API) dexClient() *dex.Client {
	if a.Dex != nil {
		return a.Dex
	}
	return dex.New(a.Cfg.DexBaseURL, a.Cfg.DexWSURL, nil)
}

func (a *API) writeDexErr(w http.ResponseWriter, r *http.Request, err error) {
	if _, ok := dex.AsRateLimit(err); ok {
		httpx.Fail(w, r, http.StatusTooManyRequests, "MARKET_RATE_LIMITED", "Market discovery rate limited", nil)
		return
	}
	if _, ok := dex.AsNotFound(err); ok {
		httpx.Fail(w, r, http.StatusNotFound, "NOT_FOUND", "Resource not found", nil)
		return
	}
	httpx.Fail(w, r, http.StatusBadGateway, "MARKET_ERROR", "Market discovery request failed", nil)
}

func (a *API) DiscoverMetaBySlug(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" || slug == "trending" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "slug required", nil)
		return
	}
	raw, err := a.dexClient().MetaBySlug(r.Context(), slug)
	if err != nil {
		a.writeDexErr(w, r, err)
		return
	}
	var meta map[string]any
	if err := json.Unmarshal(raw, &meta); err != nil {
		httpx.OK(w, r, map[string]any{"slug": slug, "chainId": dex.DefaultChain, "meta": json.RawMessage(raw)}, http.StatusOK)
		return
	}
	if pairsRaw, ok := meta["pairs"]; ok {
		b, _ := json.Marshal(pairsRaw)
		pairs := dex.SanitizePairs(dex.FilterPairsByChain(dex.ParsePairs(b), dex.DefaultChain))
		pairs = sortPairsByLiquidity(pairs)
		if len(pairs) > 20 {
			pairs = pairs[:20]
		}
		// Bound enrich time so the meta response never turns into a gateway timeout.
		enrichCtx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		pairs = a.enrichDiscoverItemsLite(enrichCtx, pairs, 8)
		cancel()
		meta["pairs"] = pairs
		meta["pairCount"] = len(pairs)
	} else {
		meta["pairs"] = []any{}
		meta["pairCount"] = 0
	}
	httpx.OK(w, r, map[string]any{"slug": slug, "chainId": dex.DefaultChain, "meta": meta}, http.StatusOK)
}

func (a *API) DiscoverProfilesLatest(w http.ResponseWriter, r *http.Request) {
	a.respondDiscoverList(w, r, "profiles", func(ctx context.Context) (json.RawMessage, error) {
		return a.dexClient().TokenProfilesLatest(ctx)
	})
}

func (a *API) DiscoverProfilesRecent(w http.ResponseWriter, r *http.Request) {
	a.respondDiscoverList(w, r, "profiles", func(ctx context.Context) (json.RawMessage, error) {
		return a.dexClient().TokenProfilesRecent(ctx)
	})
}

func (a *API) DiscoverTakeoversLatest(w http.ResponseWriter, r *http.Request) {
	a.respondDiscoverList(w, r, "takeovers", func(ctx context.Context) (json.RawMessage, error) {
		return a.dexClient().CommunityTakeoversLatest(ctx)
	})
}

func (a *API) DiscoverAdsLatest(w http.ResponseWriter, r *http.Request) {
	a.respondDiscoverList(w, r, "ads", func(ctx context.Context) (json.RawMessage, error) {
		return a.dexClient().AdsLatest(ctx)
	})
}

func (a *API) DiscoverBoostsLatest(w http.ResponseWriter, r *http.Request) {
	a.respondDiscoverList(w, r, "boosts", func(ctx context.Context) (json.RawMessage, error) {
		return a.dexClient().BoostsLatest(ctx)
	})
}

func (a *API) DiscoverBoostsTop(w http.ResponseWriter, r *http.Request) {
	a.respondDiscoverList(w, r, "boosts", func(ctx context.Context) (json.RawMessage, error) {
		return a.dexClient().BoostsTop(ctx)
	})
}

func (a *API) respondDiscoverList(w http.ResponseWriter, r *http.Request, key string, fetch func(context.Context) (json.RawMessage, error)) {
	cacheKey := "list:" + key + ":" + r.URL.Path
	a.okCachedDex(w, r, cacheKey, 30*time.Second, func() (any, error) {
		raw, err := fetch(r.Context())
		if err != nil {
			return nil, err
		}
		items := dex.FilterByChain(dex.ParseObjectList(raw), dex.DefaultChain)
		// Prefer cache-only enrich on the hot path; fill gaps with a short budget so payload stays complete.
		enrichCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		items = a.enrichDiscoverItemsLite(enrichCtx, items, 10)
		cancel()
		return map[string]any{
			"chainId": dex.DefaultChain,
			key:       items,
			"count":   len(items),
		}, nil
	})
}

func (a *API) DiscoverSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "q required", nil)
		return
	}
	raw, err := a.dexClient().Search(r.Context(), q)
	if err != nil {
		a.writeDexErr(w, r, err)
		return
	}
	pairs := dex.SanitizePairs(dex.FilterPairsByChain(dex.ParsePairs(raw), dex.DefaultChain))
	enrichCtx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	pairs = a.enrichDiscoverItemsLite(enrichCtx, pairs, 10)
	cancel()
	httpx.OK(w, r, map[string]any{
		"query":   q,
		"chainId": dex.DefaultChain,
		"pairs":   pairs,
		"count":   len(pairs),
	}, http.StatusOK)
}

func (a *API) DiscoverMetasTrending(w http.ResponseWriter, r *http.Request) {
	raw, err := a.dexClient().MetasTrending(r.Context())
	if err != nil {
		a.writeDexErr(w, r, err)
		return
	}
	httpx.OK(w, r, map[string]any{
		"chainId": dex.DefaultChain,
		"metas":   json.RawMessage(raw),
	}, http.StatusOK)
}

func (a *API) DiscoverPair(w http.ResponseWriter, r *http.Request) {
	chainID := chi.URLParam(r, "chainId")
	pairID := chi.URLParam(r, "pairId")
	if pairID == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "pairId required", nil)
		return
	}
	if chainID == "" {
		chainID = dex.DefaultChain
	}
	if !strings.EqualFold(chainID, dex.DefaultChain) {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "only solana chainId is supported", nil)
		return
	}
	raw, err := a.dexClient().Pair(r.Context(), dex.DefaultChain, pairID)
	if err != nil {
		a.writeDexErr(w, r, err)
		return
	}
	pairs := dex.SanitizePairs(dex.FilterPairsByChain(dex.ParsePairs(raw), dex.DefaultChain))
	enrichCtx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	pairs = a.enrichDiscoverItemsLite(enrichCtx, pairs, 5)
	cancel()
	httpx.OK(w, r, map[string]any{"chainId": dex.DefaultChain, "pairId": pairID, "pairs": pairs}, http.StatusOK)
}

func (a *API) TokenDetail(w http.ResponseWriter, r *http.Request) {
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	a.okCachedGMGN(w, r, "detail:"+mint, 20*time.Second, func() (any, error) {
		return a.buildTokenDetail(r.Context(), mint)
	})
}

func (a *API) TokenPairs(w http.ResponseWriter, r *http.Request) {
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	chainID := r.URL.Query().Get("chainId")
	if chainID == "" {
		chainID = dex.DefaultChain
	}
	if !strings.EqualFold(chainID, dex.DefaultChain) {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "only solana chainId is supported", nil)
		return
	}
	a.okCachedDex(w, r, "pairs:"+mint, 20*time.Second, func() (any, error) {
		raw, err := a.dexClient().TokenPairs(r.Context(), dex.DefaultChain, mint)
		if err != nil {
			return nil, err
		}
		rawPairs := dex.FilterPairsByChain(dex.ParsePairs(raw), dex.DefaultChain)
		return map[string]any{
			"mint":     mint,
			"chainId":  dex.DefaultChain,
			"pairs":    dex.SanitizePairs(rawPairs),
			"bestPair": dex.SanitizePair(dex.BestPair(rawPairs, dex.DefaultChain)),
		}, nil
	})
}

func (a *API) TokenOrders(w http.ResponseWriter, r *http.Request) {
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	chainID := r.URL.Query().Get("chainId")
	if chainID == "" {
		chainID = dex.DefaultChain
	}
	if !strings.EqualFold(chainID, dex.DefaultChain) {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "only solana chainId is supported", nil)
		return
	}
	a.okCachedDex(w, r, "orders:"+mint, 30*time.Second, func() (any, error) {
		raw, err := a.dexClient().Orders(r.Context(), dex.DefaultChain, mint)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"mint":    mint,
			"chainId": dex.DefaultChain,
			"orders":  json.RawMessage(raw),
		}, nil
	})
}

// enrichDiscoverItemsLite attaches compact tokenMetadata without heavy extras.
func (a *API) enrichDiscoverItemsLite(ctx context.Context, items []map[string]any, maxEnrich int) []map[string]any {
	if len(items) == 0 {
		return items
	}
	if maxEnrich <= 0 {
		maxEnrich = 10
	}
	const workers = 3

	seen := map[string]struct{}{}
	unique := make([]string, 0, maxEnrich)
	for _, item := range items {
		mint := dex.TokenAddressFromItem(item)
		if mint == "" {
			continue
		}
		if _, ok := seen[mint]; ok {
			continue
		}
		if len(unique) >= maxEnrich {
			break
		}
		seen[mint] = struct{}{}
		unique = append(unique, mint)
	}
	if len(unique) == 0 {
		return cloneDiscoverItems(items, nil)
	}

	local := make(map[string]any, len(unique))
	var mu sync.Mutex
	needFetch := make([]string, 0, len(unique))
	for _, mint := range unique {
		if a.MetaCache != nil {
			if hit, ok := a.MetaCache.Get("meta:" + mint); ok {
				local[mint] = hit
				continue
			}
		}
		needFetch = append(needFetch, mint)
	}

	sem := make(chan struct{}, workers)
	var wg sync.WaitGroup
	for _, mint := range needFetch {
		mint := mint
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			if a.enrichSem != nil {
				select {
				case a.enrichSem <- struct{}{}:
					defer func() { <-a.enrichSem }()
				case <-ctx.Done():
					return
				}
			}
			child, cancel := context.WithTimeout(ctx, 3*time.Second)
			meta := a.buildTokenMetadataLite(child, mint)
			cancel()
			if meta == nil {
				return
			}
			if a.MetaCache != nil {
				a.MetaCache.Set("meta:"+mint, meta)
			}
			mu.Lock()
			local[mint] = meta
			mu.Unlock()
		}()
	}
	wg.Wait()
	return cloneDiscoverItems(items, local)
}

func cloneDiscoverItems(items []map[string]any, cache map[string]any) []map[string]any {
	out := make([]map[string]any, len(items))
	for i, item := range items {
		cp := make(map[string]any, len(item)+1)
		for k, v := range item {
			if k == "url" {
				cp["chartUrl"] = v
				continue
			}
			cp[k] = v
		}
		if cache != nil {
			mint := dex.TokenAddressFromItem(item)
			if mint != "" {
				if meta, ok := cache[mint]; ok {
					cp["tokenMetadata"] = meta
				}
			}
		}
		out[i] = cp
	}
	return out
}

func sortPairsByLiquidity(pairs []map[string]any) []map[string]any {
	sort.SliceStable(pairs, func(i, j int) bool {
		return pairLiq(pairs[i]) > pairLiq(pairs[j])
	})
	return pairs
}

func pairLiq(p map[string]any) float64 {
	liq, _ := p["liquidity"].(map[string]any)
	if liq == nil {
		return 0
	}
	return asFloatAny(liq["usd"])
}

// buildTokenMetadataLite is used for discovery list enrichment — GMGN token info only.
func (a *API) buildTokenMetadataLite(ctx context.Context, mint string) map[string]any {
	c := a.gmgnClient()
	if c == nil {
		return nil
	}
	info, err := c.TokenInfoFull(ctx, gmgn.DefaultChain, mint)
	if err != nil || info == nil {
		return nil
	}
	return map[string]any{
		"mint":         mint,
		"chain":        gmgn.DefaultChain,
		"chainId":      dex.DefaultChain,
		"info":         info,
		"priceUsd":     info.Price.Price.Float(),
		"marketCapUsd": info.MarketCapUSD(),
		"liquidityUsd": info.Liquidity.Float(),
		"symbol":       info.Symbol,
		"name":         info.Name,
		"decimals":     info.Decimals.IntVal(),
	}
}

func (a *API) enrichDiscoverItems(ctx context.Context, items []map[string]any) []map[string]any {
	return a.enrichDiscoverItemsLite(ctx, items, 15)
}

func (a *API) buildTokenDetail(ctx context.Context, mint string) (map[string]any, error) {
	dx := a.dexClient()
	chainID := dex.DefaultChain

	type rawRes struct {
		raw json.RawMessage
		err error
	}
	type infoRes struct {
		info *gmgn.TokenInfoFull
		err  error
	}

	pairCh := make(chan rawRes, 1)
	orderCh := make(chan rawRes, 1)
	infoCh := make(chan infoRes, 1)
	secCh := make(chan rawRes, 1)
	poolCh := make(chan rawRes, 1)

	go func() {
		raw, err := dx.TokenPairs(ctx, chainID, mint)
		pairCh <- rawRes{raw, err}
	}()
	go func() {
		raw, err := dx.Orders(ctx, chainID, mint)
		orderCh <- rawRes{raw, err}
	}()

	c := a.gmgnClient()
	if c != nil {
		go func() {
			info, err := c.TokenInfoFull(ctx, gmgn.DefaultChain, mint)
			infoCh <- infoRes{info, err}
		}()
		go func() {
			raw, err := c.TokenSecurity(ctx, gmgn.DefaultChain, mint)
			secCh <- rawRes{raw, err}
		}()
		go func() {
			raw, err := c.TokenPool(ctx, gmgn.DefaultChain, mint)
			poolCh <- rawRes{raw, err}
		}()
	}

	out := map[string]any{
		"mint":    mint,
		"chain":   gmgn.DefaultChain,
		"chainId": chainID,
	}

	var researchErr error
	if c == nil {
		researchErr = gmgn.ErrNotConfigured
	} else {
		ir := <-infoCh
		if ir.err != nil {
			researchErr = ir.err
		} else if ir.info != nil {
			info := ir.info
			out["info"] = info
			out["priceUsd"] = info.Price.Price.Float()
			out["marketCapUsd"] = info.MarketCapUSD()
			out["liquidityUsd"] = info.Liquidity.Float()
			out["symbol"] = info.Symbol
			out["name"] = info.Name
			out["decimals"] = info.Decimals.IntVal()
			if len(info.Pool) > 0 {
				out["pool"] = json.RawMessage(info.Pool)
			}
		}
		if sec := <-secCh; sec.err == nil {
			out["security"] = json.RawMessage(sec.raw)
		}
		if pool := <-poolCh; pool.err == nil {
			out["pool"] = json.RawMessage(pool.raw)
		}
	}

	pr := <-pairCh
	or := <-orderCh

	var pairs []map[string]any
	if pr.err == nil {
		rawPairs := dex.FilterPairsByChain(dex.ParsePairs(pr.raw), chainID)
		pairs = dex.SanitizePairs(rawPairs)
		best := dex.BestPair(rawPairs, chainID)
		if best != nil {
			out["bestPair"] = dex.SanitizePair(best)
			if asFloatAny(out["priceUsd"]) <= 0 {
				if px := dex.PairPriceUSD(best); px > 0 {
					out["priceUsd"] = px
				}
			}
			if asFloatAny(out["marketCapUsd"]) <= 0 {
				if mc := dex.PairMarketCapUSD(best); mc > 0 {
					out["marketCapUsd"] = mc
				}
			}
			if asFloatAny(out["liquidityUsd"]) <= 0 {
				if liq, _ := best["liquidity"].(map[string]any); liq != nil {
					if v := asFloatAny(liq["usd"]); v > 0 {
						out["liquidityUsd"] = v
					}
				}
			}
			if info, _ := best["info"].(map[string]any); info != nil {
				out["media"] = info
			}
			if bt, _ := best["baseToken"].(map[string]any); bt != nil {
				if out["symbol"] == nil || out["symbol"] == "" {
					out["symbol"] = bt["symbol"]
				}
				if out["name"] == nil || out["name"] == "" {
					out["name"] = bt["name"]
				}
			}
		}
		out["pairs"] = pairs
		out["pairCount"] = len(pairs)
	} else {
		out["pairs"] = []any{}
	}

	if or.err == nil {
		out["orders"] = json.RawMessage(or.raw)
	}

	if researchErr != nil && len(pairs) == 0 {
		return nil, researchErr
	}
	if researchErr != nil {
		out["researchPartial"] = true
	}
	return out, nil
}

func asFloatAny(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case int:
		return float64(t)
	case json.Number:
		f, _ := t.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f
	default:
		return 0
	}
}

func (a *API) streamHandler(upstreamPath string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		dx := a.dexClient()
		if !dex.IsWebSocketUpgrade(r) {
			// Swagger / curl without Upgrade headers previously got a bare "400 Bad Request".
			// Return a clear JSON guide + optional REST snapshot of the same feed.
			host := r.Host
			scheme := "ws"
			if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
				scheme = "wss"
			}
			wsURL := scheme + "://" + host + r.URL.Path
			payload := map[string]any{
				"transport": "websocket",
				"wsUrl":     wsURL,
				"how":       "Connect with a WebSocket client (not plain HTTP). Example: new WebSocket(wsUrl)",
				"note":      "HTTP GET without Upgrade returns this guide; live data requires WebSocket.",
			}
			if snap, err := dx.StreamSnapshot(r.Context(), upstreamPath); err == nil {
				items := dex.FilterByChain(dex.ParseObjectList(snap), dex.DefaultChain)
				payload["snapshot"] = map[string]any{
					"chainId": dex.DefaultChain,
					"items":   items,
					"count":   len(items),
				}
			}
			httpx.OK(w, r, payload, http.StatusOK)
			return
		}
		if err := dx.ProxyWebSocket(w, r, upstreamPath); err != nil {
			// Upgrade already wrote a response on handshake failure; only log-worthy otherwise.
			return
		}
	}
}
