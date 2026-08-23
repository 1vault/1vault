package handlers

import (
	"context"
	"time"

	"github.com/1vault/backend/internal/indexer"
)

func (a *API) indexerHealthDetail() map[string]any {
	if a.Indexer == nil || !a.Indexer.Enabled() {
		return map[string]any{
			"configured": false,
			"ok":         false,
			"api":        "disabled",
			"dev":        "disabled",
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	st, err := a.Indexer.Status(ctx)
	if err != nil {
		// API unreachable — try DB heartbeat for dev poller
		dev := a.indexerDevFromDB(ctx)
		return map[string]any{
			"configured": true,
			"ok":         false,
			"api":        "down",
			"dev":        dev,
			"error":      err.Error(),
		}
	}
	out := map[string]any{
		"configured": st.Configured,
		"ok":         st.OK,
		"api":        st.API,
		"dev":        st.Dev,
	}
	if st.Components != nil {
		out["components"] = st.Components
	}
	// If API up but dev down, double-check DB (API may be old build)
	if st.API == "up" && st.Dev != "up" {
		if dev := a.indexerDevFromDB(ctx); dev == "up" {
			out["dev"] = "up"
			out["ok"] = true
		}
	}
	return out
}

func (a *API) indexerDevFromDB(ctx context.Context) string {
	if a.Pool == nil {
		return "unknown"
	}
	var lastSeen time.Time
	err := a.Pool.QueryRow(ctx, `
		SELECT last_seen_at FROM indexer_heartbeat WHERE role = 'poller'`).Scan(&lastSeen)
	if err != nil {
		return "down"
	}
	if time.Since(lastSeen) <= 30*time.Second {
		return "up"
	}
	return "down"
}

// legacy string helper
func (a *API) indexerHealthStatus() string {
	d := a.indexerHealthDetail()
	if ok, _ := d["ok"].(bool); ok {
		return "up"
	}
	if api, _ := d["api"].(string); api == "disabled" {
		return "disabled"
	}
	return "down"
}

var _ = indexer.ErrDisabled
