package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/1vault/backend/internal/httpx"
	"github.com/1vault/backend/internal/vaults"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"golang.org/x/sync/errgroup"
)

func (a *API) GetStrategist(w http.ResponseWriter, r *http.Request) {
	pk := chi.URLParam(r, "pubkey")
	a.okCachedErr(w, r, a.DBCache, "strategist:"+pk, 15*time.Second, func() (any, error) {
		ctx := r.Context()
		var strat any
		err := a.Pool.QueryRow(ctx, `SELECT row_to_json(s) FROM strategists s WHERE pubkey=$1`, pk).Scan(&strat)
		if err != nil {
			return nil, err
		}
		rows, err := queryMaps(ctx, a.Pool, `
			SELECT v.*,
				COALESCE(NULLIF(r.vault_type,''), NULLIF(v.vault_type,''), 'pooled') AS resolved_vault_type
			FROM vaults v
			LEFT JOIN vault_type_registry r ON r.vault_pubkey = v.pubkey
			WHERE v.strategist=$1 ORDER BY v.updated_at DESC`, pk)
		if err != nil {
			return nil, err
		}
		for _, it := range rows {
			vt := vaults.FromResolved(stringField(it, "resolved_vault_type"))
			delete(it, "resolved_vault_type")
			vaults.Attach(it, vt)
		}
		return map[string]any{"strategist": strat, "vaults": rows}, nil
	}, func(err error) bool {
		if errors.Is(err, pgx.ErrNoRows) {
			httpx.Fail(w, r, 404, "STRATEGIST_NOT_FOUND", "Strategist not found", nil)
			return true
		}
		return false
	})
}

func (a *API) GetInvestor(w http.ResponseWriter, r *http.Request) {
	pk := chi.URLParam(r, "pubkey")
	a.okCachedDB(w, r, "investor:"+pk, 12*time.Second, func() (any, error) {
		ctx := r.Context()
		var holdings, mandates, positions []map[string]any
		var eg errgroup.Group
		eg.Go(func() error {
			var e error
			holdings, e = queryMaps(ctx, a.Pool, `SELECT * FROM vault_holder_book WHERE investor=$1 ORDER BY updated_at DESC`, pk)
			return e
		})
		eg.Go(func() error {
			var e error
			mandates, e = queryMaps(ctx, a.Pool, `SELECT * FROM investor_mandates WHERE investor=$1 ORDER BY updated_at DESC`, pk)
			return e
		})
		eg.Go(func() error {
			var e error
			positions, e = queryMaps(ctx, a.Pool, `SELECT * FROM investor_positions WHERE investor=$1 ORDER BY opened_at DESC LIMIT 100`, pk)
			return e
		})
		if err := eg.Wait(); err != nil {
			return nil, err
		}
		return map[string]any{
			"investor":  pk,
			"holdings":  mapRoleFields(holdings),
			"mandates":  mapRoleFields(mandates),
			"positions": positions,
		}, nil
	})
}

func (a *API) VaultNav(w http.ResponseWriter, r *http.Request) {
	pk := chi.URLParam(r, "pubkey")
	a.okCachedDB(w, r, "vault-nav:"+pk, 12*time.Second, func() (any, error) {
		items, err := queryMaps(r.Context(), a.Pool, `
			SELECT * FROM pnl_snapshots WHERE vault=$1 ORDER BY snapshot_at DESC LIMIT 200`, pk)
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items}, nil
	})
}

func (a *API) VaultPayouts(w http.ResponseWriter, r *http.Request) {
	pk := chi.URLParam(r, "pubkey")
	a.okCachedDB(w, r, "vault-payouts:"+pk, 15*time.Second, func() (any, error) {
		items, err := queryMaps(r.Context(), a.Pool, `
			SELECT * FROM close_payouts WHERE vault=$1 ORDER BY created_at DESC LIMIT 100`, pk)
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items}, nil
	})
}

func (a *API) VaultFollows(w http.ResponseWriter, r *http.Request) {
	pk := chi.URLParam(r, "pubkey")
	a.okCachedDB(w, r, "vault-follows:"+pk, 15*time.Second, func() (any, error) {
		items, err := queryMaps(r.Context(), a.Pool, `
			SELECT * FROM follow_events WHERE vault=$1 ORDER BY created_at DESC LIMIT 100`, pk)
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items}, nil
	})
}

func (a *API) ListTrades(w http.ResponseWriter, r *http.Request) {
	vault := strings.TrimSpace(r.URL.Query().Get("vault"))
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 200 {
		limit = 100
	}
	cacheKey := fmt.Sprintf("trades:v=%s:l=%d", vault, limit)
	a.okCachedDB(w, r, cacheKey, 10*time.Second, func() (any, error) {
		var items []map[string]any
		var err error
		if vault != "" {
			items, err = queryMaps(r.Context(), a.Pool, `
				SELECT * FROM trades WHERE vault=$1 ORDER BY block_time DESC NULLS LAST LIMIT $2`, vault, limit)
		} else {
			items, err = queryMaps(r.Context(), a.Pool, `
				SELECT * FROM trades ORDER BY block_time DESC NULLS LAST LIMIT $1`, limit)
		}
		if err != nil {
			return nil, err
		}
		return map[string]any{"items": items, "vault": vault, "limit": limit}, nil
	})
}

func (a *API) ProtocolState(w http.ResponseWriter, r *http.Request) {
	a.okCachedDB(w, r, "protocol-state", 20*time.Second, func() (any, error) {
		var state any
		err := a.Pool.QueryRow(r.Context(), `SELECT row_to_json(p) FROM protocol_state p WHERE id=1`).Scan(&state)
		if errors.Is(err, pgx.ErrNoRows) {
			return map[string]any{"state": nil}, nil
		}
		if err != nil {
			return nil, err
		}
		return map[string]any{"state": state}, nil
	})
}
