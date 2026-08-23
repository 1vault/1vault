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

	apiDB := a.indexerRoleFromDB(ctx, "api")
	devDB := a.indexerRoleFromDB(ctx, "poller")

	st, err := a.Indexer.Status(ctx)
	if err != nil {
		// HTTP unreachable (common: Railway domain on wrong service / 502).
		// Fall back to DB heartbeats written by indexer processes.
		api := apiDB
		if api == "unknown" {
			api = "down"
		}
		dev := devDB
		if dev == "unknown" {
			dev = "down"
		}
		ok := api == "up" && dev == "up"
		return map[string]any{
			"configured":    true,
			"ok":            ok,
			"api":           api,
			"dev":           dev,
			"http":          "down",
			"error":         err.Error(),
			"hint":          "HTTP to INDEXER_INGEST_URL failed. Attach public domain to the indexer service (not backend), or use private URL http://<indexer-service>.railway.internal:$PORT/api/ingest",
			"ingestReady":   false,
			"processAlive":  ok,
		}
	}
	out := map[string]any{
		"configured":  st.Configured,
		"ok":          st.OK,
		"api":         st.API,
		"dev":         st.Dev,
		"http":        "up",
		"ingestReady": st.API == "up",
	}
	if st.Components != nil {
		out["components"] = st.Components
	}
	// If HTTP says api up but poller component stale, trust DB poller heartbeat
	if st.API == "up" && st.Dev != "up" && devDB == "up" {
		out["dev"] = "up"
		out["ok"] = true
	}
	// If HTTP ok but somehow api component missing, trust DB
	if st.API != "up" && apiDB == "up" {
		out["api"] = "up"
		out["ok"] = out["dev"] == "up"
	}
	return out
}

func (a *API) indexerRoleFromDB(ctx context.Context, role string) string {
	if a.Pool == nil {
		return "unknown"
	}
	var lastSeen time.Time
	err := a.Pool.QueryRow(ctx, `
		SELECT last_seen_at FROM indexer_heartbeat WHERE role = $1`, role).Scan(&lastSeen)
	if err != nil {
		return "down"
	}
	if time.Since(lastSeen) <= 45*time.Second {
		return "up"
	}
	return "down"
}

func (a *API) indexerDevFromDB(ctx context.Context) string {
	return a.indexerRoleFromDB(ctx, "poller")
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
