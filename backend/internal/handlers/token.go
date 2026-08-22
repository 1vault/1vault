package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/1vault/backend/internal/dex"
	"github.com/1vault/backend/internal/gmgn"
	"github.com/1vault/backend/internal/httpx"
	"github.com/go-chi/chi/v5"
)

func (a *API) TokenInfo(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	a.okCachedGMGN(w, r, "info:"+mint, 20*time.Second, func() (any, error) {
		info, err := c.TokenInfoFull(r.Context(), gmgn.DefaultChain, mint)
		if err != nil {
			return nil, err
		}
		resp := map[string]any{
			"mint":         mint,
			"chain":        gmgn.DefaultChain,
			"info":         info,
			"priceUsd":     info.Price.Price.Float(),
			"marketCapUsd": info.MarketCapUSD(),
			"liquidityUsd": info.Liquidity.Float(),
		}
		a.attachDexPairs(r.Context(), mint, resp)
		return resp, nil
	})
}

func (a *API) TokenSecurity(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	a.okCachedGMGN(w, r, "security:"+mint, 30*time.Second, func() (any, error) {
		raw, err := c.TokenSecurity(r.Context(), gmgn.DefaultChain, mint)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"mint":     mint,
			"chain":    gmgn.DefaultChain,
			"security": json.RawMessage(raw),
		}, nil
	})
}

func (a *API) TokenPool(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	a.okCachedGMGN(w, r, "pool:"+mint, 20*time.Second, func() (any, error) {
		raw, err := c.TokenPool(r.Context(), gmgn.DefaultChain, mint)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"mint":  mint,
			"chain": gmgn.DefaultChain,
			"pool":  json.RawMessage(raw),
		}, nil
	})
}

func (a *API) parseHolderListParams(r *http.Request) gmgn.HolderListParams {
	p := gmgn.HolderListParams{
		OrderBy:   r.URL.Query().Get("orderBy"),
		Direction: r.URL.Query().Get("direction"),
		Tag:       r.URL.Query().Get("tag"),
	}
	if p.OrderBy == "" {
		p.OrderBy = "amount_percentage"
	}
	if p.Direction == "" {
		p.Direction = "desc"
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil && n > 0 {
			p.Limit = n
		}
	}
	if p.Limit == 0 {
		p.Limit = 20
	}
	return p
}

func (a *API) TokenHolders(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	params := a.parseHolderListParams(r)
	key := fmt.Sprintf("holders:%s:%s:%s:%s:%d", mint, params.OrderBy, params.Direction, params.Tag, params.Limit)
	a.okCachedGMGN(w, r, key, 15*time.Second, func() (any, error) {
		raw, err := c.TokenHolders(r.Context(), gmgn.DefaultChain, mint, params)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"mint":    mint,
			"chain":   gmgn.DefaultChain,
			"params":  params,
			"holders": json.RawMessage(raw),
		}, nil
	})
}

func (a *API) TokenTraders(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	params := a.parseHolderListParams(r)
	key := fmt.Sprintf("traders:%s:%s:%s:%s:%d", mint, params.OrderBy, params.Direction, params.Tag, params.Limit)
	a.okCachedGMGN(w, r, key, 15*time.Second, func() (any, error) {
		raw, err := c.TokenTraders(r.Context(), gmgn.DefaultChain, mint, params)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"mint":    mint,
			"chain":   gmgn.DefaultChain,
			"params":  params,
			"traders": json.RawMessage(raw),
		}, nil
	})
}

func (a *API) TokenResearch(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	a.okCachedGMGN(w, r, "research:"+mint, 20*time.Second, func() (any, error) {
		out, err := c.Research(r.Context(), mint)
		if err != nil {
			return nil, err
		}
		resp := map[string]any{
			"mint":         out.Mint,
			"chain":        out.Chain,
			"info":         out.Info,
			"marketCapUsd": out.MarketCap,
			"priceUsd":     out.PriceUSD,
			"liquidityUsd": out.Liquidity,
			"security":     out.Security,
			"pool":         out.Pool,
		}
		a.attachDexPairs(r.Context(), mint, resp)
		return resp, nil
	})
}

func (a *API) attachDexPairs(ctx context.Context, mint string, resp map[string]any) {
	raw, err := a.dexClient().TokenPairs(ctx, dex.DefaultChain, mint)
	if err != nil {
		return
	}
	rawPairs := dex.FilterPairsByChain(dex.ParsePairs(raw), dex.DefaultChain)
	if len(rawPairs) == 0 {
		return
	}
	resp["pairs"] = dex.SanitizePairs(rawPairs)
	resp["pairCount"] = len(rawPairs)
	best := dex.BestPair(rawPairs, dex.DefaultChain)
	if best == nil {
		return
	}
	resp["bestPair"] = dex.SanitizePair(best)
	if asFloatAny(resp["priceUsd"]) <= 0 {
		if px := dex.PairPriceUSD(best); px > 0 {
			resp["priceUsd"] = px
		}
	}
	if asFloatAny(resp["marketCapUsd"]) <= 0 {
		if mc := dex.PairMarketCapUSD(best); mc > 0 {
			resp["marketCapUsd"] = mc
		}
	}
	if asFloatAny(resp["liquidityUsd"]) <= 0 {
		if liq, _ := best["liquidity"].(map[string]any); liq != nil {
			if v := asFloatAny(liq["usd"]); v > 0 {
				resp["liquidityUsd"] = v
			}
		}
	}
	if media, _ := best["info"].(map[string]any); media != nil {
		resp["media"] = media
	}
}
