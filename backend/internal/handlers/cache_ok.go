package handlers

import (
	"net/http"
	"time"

	"github.com/1vault/backend/internal/cache"
	"github.com/1vault/backend/internal/httpx"
)

// okCached serves from cache (fresh or SWR) or loads once via singleflight.
// Warm/stale hits are typically single-digit ms; cold miss pays upstream once.
func (a *API) okCached(w http.ResponseWriter, r *http.Request, c *cache.TTL, key string, ttl time.Duration, load func() (any, error)) {
	a.okCachedErr(w, r, c, key, ttl, load, nil)
}

func (a *API) okCachedErr(w http.ResponseWriter, r *http.Request, c *cache.TTL, key string, ttl time.Duration, load func() (any, error), onErr func(error) bool) {
	writeLoadErr := func(err error) {
		if onErr != nil && onErr(err) {
			return
		}
		httpx.WriteErr(w, r, err)
	}
	if c == nil {
		v, err := load()
		if err != nil {
			writeLoadErr(err)
			return
		}
		httpx.OK(w, r, v, http.StatusOK)
		return
	}
	v, err := c.GetOrSet(key, ttl, load)
	if err != nil {
		writeLoadErr(err)
		return
	}
	httpx.OK(w, r, v, http.StatusOK)
}

func (a *API) okCachedGMGN(w http.ResponseWriter, r *http.Request, key string, ttl time.Duration, load func() (any, error)) {
	a.okCachedErr(w, r, a.MarketCache, key, ttl, load, func(err error) bool {
		a.writeGMGNErr(w, r, err)
		return true
	})
}

func (a *API) okCachedDB(w http.ResponseWriter, r *http.Request, key string, ttl time.Duration, load func() (any, error)) {
	a.okCached(w, r, a.DBCache, key, ttl, load)
}

func (a *API) okCachedDex(w http.ResponseWriter, r *http.Request, key string, ttl time.Duration, load func() (any, error)) {
	a.okCachedErr(w, r, a.ListCache, key, ttl, load, func(err error) bool {
		a.writeDexErr(w, r, err)
		return true
	})
}
