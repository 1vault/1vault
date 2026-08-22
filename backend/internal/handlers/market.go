package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/1vault/backend/internal/gmgn"
	"github.com/1vault/backend/internal/httpx"
	"github.com/go-chi/chi/v5"
)

func (a *API) gmgnClient() *gmgn.Client {
	return a.GMGN
}

func (a *API) requireGMGN(w http.ResponseWriter, r *http.Request) *gmgn.Client {
	c := a.gmgnClient()
	if c == nil {
		httpx.Fail(w, r, http.StatusServiceUnavailable, "MARKET_NOT_CONFIGURED", "Market data is not configured", nil)
		return nil
	}
	return c
}

func (a *API) writeGMGNErr(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, gmgn.ErrSigningRequired) {
		httpx.Fail(w, r, http.StatusServiceUnavailable, "MARKET_SIGNING_REQUIRED", "Market signing key not configured", nil)
		return
	}
	if rl, ok := gmgn.AsRateLimit(err); ok {
		details := map[string]any{"apiError": rl.APIError}
		if rl.ResetAt > 0 {
			details["resetAt"] = rl.ResetAt
			details["retryAfter"] = time.Unix(rl.ResetAt, 0).UTC().Format(time.RFC3339)
		}
		httpx.Fail(w, r, http.StatusTooManyRequests, "MARKET_RATE_LIMITED", "Market data rate limited", details)
		return
	}
	httpx.Fail(w, r, http.StatusBadGateway, "MARKET_ERROR", "Market data request failed", nil)
}

func (a *API) TokenPrice(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	amtStr := r.URL.Query().Get("amount")
	exitBps := r.URL.Query().Get("exitBps")
	var amt uint64
	bps := uint16(10_000)
	if amtStr != "" {
		n, err := strconv.ParseUint(amtStr, 10, 64)
		if err != nil {
			httpx.Fail(w, r, 422, "VALIDATION_ERROR", "amount must be uint raw token units", nil)
			return
		}
		amt = n
		if exitBps != "" {
			v, err := strconv.ParseUint(exitBps, 10, 16)
			if err != nil || v == 0 || v > 10_000 {
				httpx.Fail(w, r, 422, "VALIDATION_ERROR", "exitBps must be 1..10000", nil)
				return
			}
			bps = uint16(v)
		}
	}
	key := fmt.Sprintf("price:%s:a=%s:b=%s", mint, amtStr, exitBps)
	a.okCachedGMGN(w, r, key, 8*time.Second, func() (any, error) {
		q, err := c.QuoteWithSOL(r.Context(), mint)
		if err != nil {
			return nil, err
		}
		resp := map[string]any{"quote": q}
		if amtStr != "" {
			lamports, usd, err := gmgn.ProceedsLamports(q, amt, bps)
			if err != nil {
				return nil, err
			}
			resp["amountRaw"] = amt
			resp["exitBps"] = bps
			resp["notionalUsd"] = usd
			resp["proceedsLamports"] = lamports
		}
		return resp, nil
	})
}

func (a *API) TokenKline(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	resolution := r.URL.Query().Get("resolution")
	if resolution == "" {
		resolution = "1m"
	}
	to := time.Now().Unix()
	from := to - 3600
	if v := r.URL.Query().Get("from"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			httpx.Fail(w, r, 422, "VALIDATION_ERROR", "from must be unix seconds", nil)
			return
		}
		from = n
	}
	if v := r.URL.Query().Get("to"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil {
			httpx.Fail(w, r, 422, "VALIDATION_ERROR", "to must be unix seconds", nil)
			return
		}
		to = n
	}
	// Bucket time windows so cache keys reuse across near-identical requests.
	fromBucket := from - (from % 60)
	toBucket := to - (to % 60)
	key := fmt.Sprintf("kline:%s:%s:%d:%d", mint, resolution, fromBucket, toBucket)
	a.okCachedGMGN(w, r, key, 15*time.Second, func() (any, error) {
		candles, err := c.Kline(r.Context(), gmgn.DefaultChain, mint, resolution, from, to)
		if err != nil {
			return nil, err
		}
		closeUSD, _ := gmgn.LastCloseUSD(candles)
		return map[string]any{
			"mint":       mint,
			"chain":      gmgn.DefaultChain,
			"resolution": resolution,
			"from":       from,
			"to":         to,
			"candles":    candles,
			"lastClose":  closeUSD,
		}, nil
	})
}

func (a *API) TokenAnalyze(w http.ResponseWriter, r *http.Request) {
	c := a.requireGMGN(w, r)
	if c == nil {
		return
	}
	mint := chi.URLParam(r, "mint")
	if mint == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mint required", nil)
		return
	}
	a.okCachedGMGN(w, r, "analyze:"+mint, 12*time.Second, func() (any, error) {
		return c.Analyze(r.Context(), mint)
	})
}

func (a *API) resolveProceeds(r *http.Request, proceeds uint64, inputMint string, baseAmount uint64, exitBps uint16) (uint64, *gmgn.Quote, string) {
	if proceeds > 0 {
		return proceeds, nil, ""
	}
	if inputMint == "" || baseAmount == 0 {
		return 0, nil, "proceeds=0 and missing inputMint/baseAmount for auto-fill"
	}
	c := a.gmgnClient()
	if c == nil {
		return 0, nil, "market data not configured — pass proceeds manually"
	}
	q, err := c.QuoteWithSOL(r.Context(), inputMint)
	if err != nil {
		return 0, nil, "quote failed: " + err.Error()
	}
	lamports, _, err := gmgn.ProceedsLamports(q, baseAmount, exitBps)
	if err != nil {
		return 0, q, err.Error()
	}
	return lamports, q, ""
}
