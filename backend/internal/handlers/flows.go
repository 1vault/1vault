package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/1vault/backend/internal/flow"
	"github.com/1vault/backend/internal/httpx"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (a *API) flowSvc(r *http.Request) *flow.Service {
	return flow.NewService(flow.Deps{
		Pool:    a.Pool,
		Addr:    a.addresses(r),
		Indexer: a.Indexer,
		Keeper:  a.Keeper,
		GMGN:    a.gmgnClient(),
		OnIngest: func() {
			a.bustProductCache()
		},
	})
}

func (a *API) StartFlow(w http.ResponseWriter, r *http.Request) {
	var p flow.StartParams
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	if p.Mode == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "mode required", nil)
		return
	}
	job, err := a.flowSvc(r).Start(r.Context(), p)
	if err != nil {
		httpx.Fail(w, r, 422, "FLOW_START_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, job, http.StatusCreated)
}

func (a *API) GetFlow(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid flow id", nil)
		return
	}
	job, err := a.flowSvc(r).Store.Get(r.Context(), id)
	if err != nil {
		if flow.ErrNoRows(err) {
			httpx.Fail(w, r, 404, "FLOW_NOT_FOUND", "flow not found", nil)
			return
		}
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, job, http.StatusOK)
}

func (a *API) ListFlows(w http.ResponseWriter, r *http.Request) {
	jobs, err := a.flowSvc(r).Store.List(
		r.Context(),
		string(httpx.ClusterFrom(r)),
		r.URL.Query().Get("strategist"),
		r.URL.Query().Get("investor"),
		r.URL.Query().Get("status"),
		20,
	)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, map[string]any{"items": jobs}, http.StatusOK)
}

func (a *API) SubmitFlow(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid flow id", nil)
		return
	}
	var body struct {
		SignedTransaction string `json:"signedTransaction"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SignedTransaction == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "signedTransaction (base64) required", nil)
		return
	}
	job, err := a.flowSvc(r).Submit(r.Context(), id, body.SignedTransaction)
	if err != nil {
		if isMissingEOA(err) {
			httpx.Fail(w, r, 422, "MISSING_EOA_SIGNATURE", err.Error(), nil)
			return
		}
		httpx.Fail(w, r, 502, "FLOW_SUBMIT_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, job, http.StatusOK)
}

func (a *API) RefreshFlow(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid flow id", nil)
		return
	}
	job, err := a.flowSvc(r).RefreshPrepared(r.Context(), id)
	if err != nil {
		httpx.Fail(w, r, 422, "FLOW_REFRESH_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, job, http.StatusOK)
}

func (a *API) CancelFlow(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid flow id", nil)
		return
	}
	job, err := a.flowSvc(r).Cancel(r.Context(), id)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, job, http.StatusOK)
}

func (a *API) RetryFlow(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid flow id", nil)
		return
	}
	job, err := a.flowSvc(r).Retry(r.Context(), id)
	if err != nil {
		httpx.Fail(w, r, 422, "FLOW_RETRY_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, job, http.StatusOK)
}
