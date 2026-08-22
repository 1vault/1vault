package handlers

import (
	"net/http"

	"github.com/1vault/backend/internal/httpx"
)

// FEATURE_NOT_ON_CHAIN stubs for product.md STRIPPED / FUTURE sections (§0.11).

func (a *API) featureNotOnChain(w http.ResponseWriter, r *http.Request, feature string) {
	httpx.Fail(w, r, http.StatusNotImplemented, "FEATURE_NOT_ON_CHAIN",
		feature+" is stripped/future in the current MVP program — see product.md §0.11",
		map[string]any{"feature": feature})
}

func (a *API) StubReferral(w http.ResponseWriter, r *http.Request) {
	a.featureNotOnChain(w, r, "referral")
}

func (a *API) StubStaking(w http.ResponseWriter, r *http.Request) {
	a.featureNotOnChain(w, r, "platform_staking")
}

func (a *API) StubVaultStake(w http.ResponseWriter, r *http.Request) {
	a.featureNotOnChain(w, r, "vault_sol_stake")
}

func (a *API) StubMEV(w http.ResponseWriter, r *http.Request) {
	a.featureNotOnChain(w, r, "mev_preference")
}

func (a *API) StubDCA(w http.ResponseWriter, r *http.Request) {
	a.featureNotOnChain(w, r, "dca")
}

func (a *API) StubEarlyExitFee(w http.ResponseWriter, r *http.Request) {
	a.featureNotOnChain(w, r, "early_exit_fee")
}

func (a *API) StubWithdrawFee(w http.ResponseWriter, r *http.Request) {
	a.featureNotOnChain(w, r, "flat_withdraw_fee")
}

func (a *API) StubManagementFee(w http.ResponseWriter, r *http.Request) {
	a.featureNotOnChain(w, r, "management_fee")
}

// Read-only cache for stripped features (tables already exist from indexer).
func (a *API) ListReferralRewards(w http.ResponseWriter, r *http.Request) {
	items, err := queryMaps(r.Context(), a.Pool, `SELECT * FROM referral_rewards ORDER BY block_time DESC NULLS LAST LIMIT 100`)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, map[string]any{"items": items, "note": "read-only indexer cache; writes are FEATURE_NOT_ON_CHAIN"}, http.StatusOK)
}

func (a *API) ListStakingEvents(w http.ResponseWriter, r *http.Request) {
	items, err := queryMaps(r.Context(), a.Pool, `SELECT * FROM staking_events ORDER BY block_time DESC NULLS LAST LIMIT 100`)
	if err != nil {
		httpx.WriteErr(w, r, err)
		return
	}
	httpx.OK(w, r, map[string]any{"items": items, "note": "read-only indexer cache; writes are FEATURE_NOT_ON_CHAIN"}, http.StatusOK)
}
