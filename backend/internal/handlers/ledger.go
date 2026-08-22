package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/1vault/backend/internal/httpx"
	"github.com/1vault/backend/internal/roles"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func (a *API) CreateDeposit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Vault         string `json:"vault"`
		Investor      string `json:"investor"`
		Role          string `json:"role"`
		Amount        string `json:"amount"`
		TakeProfitBps *int   `json:"takeProfitBps"`
		StopLossBps   *int   `json:"stopLossBps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Invalid deposit intent", nil)
		return
	}
	apiRole, okRole := roles.ParseAPI(body.Role)
	if len(body.Vault) < 32 || len(body.Investor) < 32 || !okRole || !isDigits(body.Amount) {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Invalid deposit intent (role must be strategies|investors)", nil)
		return
	}
	dbRole := roles.ToDB(apiRole)
	ok, err := a.walletOwned(r.Context(), httpx.UserID(r), body.Investor)
	if err != nil || !ok {
		httpx.Fail(w, r, http.StatusForbidden, "WALLET_NOT_BOUND", "Wallet is not bound to this account", nil)
		return
	}
	var id int
	var status string
	err = a.Pool.QueryRow(r.Context(), `
		INSERT INTO deposit_intents (cluster, vault, investor, role, amount, take_profit_bps, stop_loss_bps, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id, status`,
		string(httpx.ClusterFrom(r)), body.Vault, body.Investor, dbRole, body.Amount, body.TakeProfitBps, body.StopLossBps,
	).Scan(&id, &status)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, map[string]any{
		"id": id, "status": status,
		"role": apiRole, "roleLabel": roles.Label(apiRole),
	}, http.StatusCreated)
}

func (a *API) SubmitDeposit(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(chi.URLParam(r, "id"))
	var body struct {
		Signature string `json:"signature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || id < 1 || len(body.Signature) < 32 {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "id and signature required", nil)
		return
	}
	investor, err := a.intentInvestor(r.Context(), id)
	if err != nil {
		httpx.Fail(w, r, http.StatusNotFound, "INTENT_NOT_FOUND", "Deposit intent not found", nil)
		return
	}
	ok, err := a.walletOwned(r.Context(), httpx.UserID(r), investor)
	if err != nil || !ok {
		httpx.Fail(w, r, http.StatusForbidden, "WALLET_NOT_BOUND", "Intent investor is not bound to this account", nil)
		return
	}
	tag, err := a.Pool.Exec(r.Context(), `
		UPDATE deposit_intents SET status='submitted', signature=$2, updated_at=NOW()
		WHERE id=$1 AND status='pending'`, id, body.Signature)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		httpx.Fail(w, r, http.StatusConflict, "INTENT_NOT_PENDING", "deposit intent is not pending", nil)
		return
	}
	httpx.OK(w, r, map[string]any{"id": id, "signature": body.Signature, "status": "submitted"}, http.StatusOK)
}

func (a *API) FailDeposit(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.Atoi(chi.URLParam(r, "id"))
	if id < 1 {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "id required", nil)
		return
	}
	var body struct {
		Error string `json:"error"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	if body.Error == "" {
		body.Error = "failed"
	}
	investor, err := a.intentInvestor(r.Context(), id)
	if err != nil {
		httpx.Fail(w, r, http.StatusNotFound, "INTENT_NOT_FOUND", "Deposit intent not found", nil)
		return
	}
	ok, err := a.walletOwned(r.Context(), httpx.UserID(r), investor)
	if err != nil || !ok {
		httpx.Fail(w, r, http.StatusForbidden, "WALLET_NOT_BOUND", "Intent investor is not bound to this account", nil)
		return
	}
	msg := body.Error
	if len(msg) > 500 {
		msg = msg[:500]
	}
	_, _ = a.Pool.Exec(r.Context(), `
		UPDATE deposit_intents SET status='failed', error=$2, updated_at=NOW()
		WHERE id=$1 AND status IN ('pending','submitted')`, id, msg)
	httpx.OK(w, r, map[string]any{"id": id, "status": "failed"}, http.StatusOK)
}

func (a *API) ListDeposits(w http.ResponseWriter, r *http.Request) {
	investor := strings.TrimSpace(r.URL.Query().Get("investor"))
	if investor == "" {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "investor query required", nil)
		return
	}
	ok, err := a.walletOwned(r.Context(), httpx.UserID(r), investor)
	if err != nil || !ok {
		httpx.Fail(w, r, http.StatusForbidden, "WALLET_NOT_BOUND", "Wallet is not bound to this account", nil)
		return
	}
	vault := strings.TrimSpace(r.URL.Query().Get("vault"))
	var items []map[string]any
	if vault != "" {
		items, err = queryMaps(r.Context(), a.Pool, `SELECT * FROM deposit_intents WHERE investor=$1 AND vault=$2 ORDER BY created_at DESC LIMIT 50`, investor, vault)
	} else {
		items, err = queryMaps(r.Context(), a.Pool, `SELECT * FROM deposit_intents WHERE investor=$1 ORDER BY created_at DESC LIMIT 50`, investor)
	}
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, map[string]any{"items": mapRoleFields(items)}, http.StatusOK)
}

func (a *API) UpsertMandate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Vault         string `json:"vault"`
		Investor      string `json:"investor"`
		Role          string `json:"role"`
		ParkAmount    string `json:"parkAmount"`
		TakeProfitBps *int   `json:"takeProfitBps"`
		StopLossBps   *int   `json:"stopLossBps"`
		AutoFollow    *bool  `json:"autoFollow"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Vault) < 32 || len(body.Investor) < 32 {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "Invalid mandate", nil)
		return
	}
	if body.Role == "" {
		body.Role = roles.DefaultAPI()
	}
	apiRole, okRole := roles.ParseAPI(body.Role)
	if !okRole {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "role must be strategies|investors", nil)
		return
	}
	dbRole := roles.ToDB(apiRole)
	if body.ParkAmount == "" {
		body.ParkAmount = "0"
	}
	ok, err := a.walletOwned(r.Context(), httpx.UserID(r), body.Investor)
	if err != nil || !ok {
		httpx.Fail(w, r, http.StatusForbidden, "WALLET_NOT_BOUND", "Wallet is not bound to this account", nil)
		return
	}
	auto := true
	if body.AutoFollow != nil {
		auto = *body.AutoFollow
	}
	_, err = a.Pool.Exec(r.Context(), `
		INSERT INTO investor_mandates (vault, investor, role, park_amount, take_profit_bps, stop_loss_bps, auto_follow, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
		ON CONFLICT (vault, investor) DO UPDATE SET
			role=EXCLUDED.role, park_amount=EXCLUDED.park_amount,
			take_profit_bps=EXCLUDED.take_profit_bps, stop_loss_bps=EXCLUDED.stop_loss_bps,
			auto_follow=EXCLUDED.auto_follow, updated_at=NOW()`,
		body.Vault, body.Investor, dbRole, body.ParkAmount, body.TakeProfitBps, body.StopLossBps, auto)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, map[string]any{
		"ok": true, "role": apiRole, "roleLabel": roles.Label(apiRole),
	}, http.StatusOK)
}

func (a *API) ListMandates(w http.ResponseWriter, r *http.Request) {
	investor := strings.TrimSpace(r.URL.Query().Get("investor"))
	if investor == "" {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "investor query required", nil)
		return
	}
	ok, err := a.walletOwned(r.Context(), httpx.UserID(r), investor)
	if err != nil || !ok {
		httpx.Fail(w, r, http.StatusForbidden, "WALLET_NOT_BOUND", "Wallet is not bound to this account", nil)
		return
	}
	vault := strings.TrimSpace(r.URL.Query().Get("vault"))
	var items []map[string]any
	if vault != "" {
		items, err = queryMaps(r.Context(), a.Pool, `SELECT * FROM investor_mandates WHERE investor=$1 AND vault=$2 ORDER BY updated_at DESC`, investor, vault)
	} else {
		items, err = queryMaps(r.Context(), a.Pool, `SELECT * FROM investor_mandates WHERE investor=$1 ORDER BY updated_at DESC LIMIT 100`, investor)
	}
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, map[string]any{"items": mapRoleFields(items)}, http.StatusOK)
}

func (a *API) Ingest(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get("X-Admin-Key")
	if a.Cfg.AdminIngestKey == "" || key != a.Cfg.AdminIngestKey {
		httpx.Fail(w, r, http.StatusUnauthorized, "UNAUTHORIZED", "Valid X-Admin-Key required", nil)
		return
	}
	var body struct {
		Signature string `json:"signature"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Signature) < 32 {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "signature required", nil)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	res, err := a.Indexer.Ingest(ctx, body.Signature)
	if err != nil {
		httpx.Fail(w, r, http.StatusBadGateway, "INGEST_FAILED", err.Error(), map[string]any{"result": res})
		return
	}
	a.bustProductCache()
	httpx.OK(w, r, res, http.StatusOK)
}

func (a *API) intentInvestor(ctx context.Context, id int) (string, error) {
	var investor string
	err := a.Pool.QueryRow(ctx, `SELECT investor FROM deposit_intents WHERE id=$1`, id).Scan(&investor)
	return investor, err
}

func (a *API) walletOwned(ctx context.Context, userID, pubkey string) (bool, error) {
	var n int
	err := a.Pool.QueryRow(ctx, `SELECT 1 FROM user_wallets WHERE user_id=$1::uuid AND pubkey=$2 LIMIT 1`, userID, pubkey).Scan(&n)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func mapRoleFields(items []map[string]any) []map[string]any {
	rewritten, _ := roles.RewritePublic(items).([]map[string]any)
	if rewritten != nil {
		return rewritten
	}
	return items
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func queryMaps(ctx context.Context, pool *pgxpool.Pool, sql string, args ...any) ([]map[string]any, error) {
	rows, err := pool.Query(ctx, sql, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return rowsToMaps(rows)
}

func rowsToMaps(rows pgx.Rows) ([]map[string]any, error) {
	fields := rows.FieldDescriptions()
	var out []map[string]any
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		m := make(map[string]any, len(fields))
		for i, f := range fields {
			m[string(f.Name)] = normalize(vals[i])
		}
		out = append(out, m)
	}
	if out == nil {
		out = []map[string]any{}
	}
	return out, rows.Err()
}

func normalize(v any) any {
	switch t := v.(type) {
	case [16]byte:
		// uuid
		return formatUUID(t)
	case []byte:
		return string(t)
	default:
		return v
	}
}

func formatUUID(b [16]byte) string {
	return strings.ToLower(
		hexPair(b[0:4]) + "-" + hexPair(b[4:6]) + "-" + hexPair(b[6:8]) + "-" + hexPair(b[8:10]) + "-" + hexPair(b[10:16]),
	)
}

func hexPair(b []byte) string {
	const hexdigits = "0123456789abcdef"
	out := make([]byte, len(b)*2)
	for i, v := range b {
		out[i*2] = hexdigits[v>>4]
		out[i*2+1] = hexdigits[v&0x0f]
	}
	return string(out)
}
