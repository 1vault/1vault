package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/1vault/backend/internal/gmgn"
	"github.com/1vault/backend/internal/httpx"
	"github.com/1vault/backend/internal/roles"
	"github.com/1vault/backend/internal/signing"
	s "github.com/1vault/backend/internal/solana"
	"github.com/1vault/backend/internal/txconfirm"
	"github.com/1vault/backend/internal/txprep"
	"github.com/1vault/backend/internal/vaults"
	"github.com/gagliardetto/solana-go"
	"github.com/go-chi/chi/v5"
)

func (a *API) txBuilder(r *http.Request) *txprep.Builder {
	addr := a.addresses(r)
	return txprep.NewBuilder(addr, txprep.NewRPC(addr.RPCURL))
}

func (a *API) failTxBuild(w http.ResponseWriter, r *http.Request, err error) {
	var layout *s.VaultLayoutError
	if errors.As(err, &layout) {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VAULT_LAYOUT_INCOMPATIBLE", err.Error(), map[string]any{
			"vault":  layout.Pubkey,
			"len":    layout.Len,
			"reason": layout.Reason,
		})
		return
	}
	httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
}

func (a *API) decodePK(w http.ResponseWriter, r *http.Request, raw, field string) (solana.PublicKey, bool) {
	pk, err := s.ParsePK(raw)
	if err != nil || raw == "" {
		httpx.Fail(w, r, http.StatusUnprocessableEntity, "VALIDATION_ERROR", field+" must be a valid pubkey", nil)
		return solana.PublicKey{}, false
	}
	return pk, true
}

func (a *API) optionalPK(w http.ResponseWriter, r *http.Request, raw, field string) (solana.PublicKey, bool) {
	if raw == "" {
		return solana.PublicKey{}, true
	}
	return a.decodePK(w, r, raw, field)
}

func (a *API) decodePKList(w http.ResponseWriter, r *http.Request, raw []string, field string) ([]solana.PublicKey, bool) {
	out := make([]solana.PublicKey, 0, len(raw))
	for i, v := range raw {
		pk, ok := a.decodePK(w, r, v, field+"["+strconv.Itoa(i)+"]")
		if !ok {
			return nil, false
		}
		out = append(out, pk)
	}
	return out, true
}

// resolveVaultPubkey accepts either vault pubkey OR (strategist + vaultId) to derive the PDA.
func (a *API) resolveVaultPubkey(w http.ResponseWriter, r *http.Request, vaultRaw, strategistRaw string, vaultID uint64) (solana.PublicKey, bool) {
	if vaultRaw != "" {
		return a.decodePK(w, r, vaultRaw, "vault")
	}
	if strategistRaw == "" || vaultID == 0 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "provide vault pubkey, or strategist + vaultId", nil)
		return solana.PublicKey{}, false
	}
	st, ok := a.decodePK(w, r, strategistRaw, "strategist")
	if !ok {
		return solana.PublicKey{}, false
	}
	return s.VaultPDA(a.txBuilder(r).Program, st, vaultID), true
}

func (a *API) PrepResolveAccounts(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist string `json:"strategist"`
		Investor   string `json:"investor"`
		Vault      string `json:"vault"`
		VaultID    uint64 `json:"vaultId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.optionalPK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	inv, ok := a.optionalPK(w, r, body.Investor, "investor")
	if !ok {
		return
	}
	vault, ok := a.optionalPK(w, r, body.Vault, "vault")
	if !ok {
		return
	}
	if vault.IsZero() && !st.IsZero() && body.VaultID > 0 {
		vault = s.VaultPDA(a.txBuilder(r).Program, st, body.VaultID)
	}
	httpx.OK(w, r, a.txBuilder(r).ResolveAccounts(st, inv, vault, body.VaultID), http.StatusOK)
}

func (a *API) PrepRegisterStrategist(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist string `json:"strategist"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	p, err := a.txBuilder(r).RegisterStrategist(st)
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepLockLicense(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist string `json:"strategist"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	p, err := a.txBuilder(r).LockLicense(st)
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepCreateVault(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist        string   `json:"strategist"`
		VaultTokenAccount string   `json:"vaultTokenAccount"`
		VaultID           uint64   `json:"vaultId"`
		Name              string   `json:"name"`
		PerformanceFeeBps uint16   `json:"performanceFeeBps"`
		Description       string   `json:"description"`
		MaxSlippageBps    uint16   `json:"maxSlippageBps"`
		BaseMint          string   `json:"baseMint"`
		AllowedMints      []string `json:"allowedMints"`
		VaultType         string   `json:"vaultType"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vta, ok := a.decodePK(w, r, body.VaultTokenAccount, "vaultTokenAccount")
	if !ok {
		return
	}
	if body.VaultID == 0 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "vaultId required", nil)
		return
	}
	vt := vaults.Default()
	if body.VaultType != "" {
		parsed, ok := vaults.Parse(body.VaultType)
		if !ok {
			httpx.Fail(w, r, 422, "VALIDATION_ERROR", "vaultType must be pooled|sliced", nil)
			return
		}
		vt = parsed
	}
	baseMint, ok := a.optionalPK(w, r, body.BaseMint, "baseMint")
	if !ok {
		return
	}
	allowed, ok := a.decodePKList(w, r, body.AllowedMints, "allowedMints")
	if !ok {
		return
	}
	b := a.txBuilder(r)
	p, err := b.CreateVault(txprep.CreateVaultParams{
		Strategist:        st,
		VaultTokenAccount: vta,
		VaultID:           body.VaultID,
		Name:              body.Name,
		PerformanceFeeBps: body.PerformanceFeeBps,
		Description:       body.Description,
		MaxSlippageBps:    body.MaxSlippageBps,
		BaseMint:          baseMint,
		AllowedMints:      allowed,
		VaultType:         string(vt),
	})
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	vaultPK := s.VaultPDA(b.Program, st, body.VaultID)
	_ = vaults.UpsertRegistry(r.Context(), a.Pool, vaultPK.String(), body.Strategist, body.VaultID, vt)
	if acc, ok := p.Accounts.(map[string]string); ok {
		acc["vaultType"] = string(vt)
		acc["vaultTypeLabel"] = vt.Label()
		acc["vaultTypeMeaning"] = vt.Meaning()
		p.Accounts = acc
	}
	httpx.OK(w, r, vaults.Attach(map[string]any{
		"transaction":     p.TransactionBase64,
		"recentBlockhash": p.RecentBlockhash,
		"feePayer":        p.FeePayer,
		"requiredSigners": p.Signers,
		"message":         p.Message,
		"accounts":        p.Accounts,
	}, vt), http.StatusOK)
}

func (a *API) PrepPark(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Investor          string `json:"investor"`
		Vault             string `json:"vault"`
		Strategist        string `json:"strategist"`
		VaultID           uint64 `json:"vaultId"`
		VaultTokenAccount string `json:"vaultTokenAccount"`
		Lamports          uint64 `json:"lamports"`
		Role              string `json:"role"`
		RecordIntent      bool   `json:"recordIntent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	inv, ok := a.decodePK(w, r, body.Investor, "investor")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	vta, ok := a.decodePK(w, r, body.VaultTokenAccount, "vaultTokenAccount")
	if !ok {
		return
	}
	if body.Lamports == 0 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "lamports required", nil)
		return
	}
	var intentID any
	if body.RecordIntent && httpx.UserID(r) != "" {
		role := roles.ToDB(body.Role)
		if body.Role == "" {
			role = roles.DBRetail
		}
		owned, _ := a.walletOwned(r.Context(), httpx.UserID(r), body.Investor)
		if owned {
			var id int
			_ = a.Pool.QueryRow(r.Context(), `
				INSERT INTO deposit_intents (cluster, vault, investor, role, amount, status)
				VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id`,
				string(httpx.ClusterFrom(r)), vault.String(), body.Investor, role, strconv.FormatUint(body.Lamports, 10),
			).Scan(&id)
			intentID = id
		}
	}
	p, err := a.txBuilder(r).Park(inv, vault, vta, body.Lamports)
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, map[string]any{"prepared": p, "depositIntentId": intentID}, http.StatusOK)
}

func (a *API) PrepWithdraw(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Investor          string `json:"investor"`
		Vault             string `json:"vault"`
		Strategist        string `json:"strategist"`
		VaultID           uint64 `json:"vaultId"`
		VaultTokenAccount string `json:"vaultTokenAccount"`
		Shares            uint64 `json:"shares"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	inv, ok := a.decodePK(w, r, body.Investor, "investor")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	vta, ok := a.decodePK(w, r, body.VaultTokenAccount, "vaultTokenAccount")
	if !ok {
		return
	}
	if body.Shares == 0 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "shares required", nil)
		return
	}
	p, err := a.txBuilder(r).Withdraw(inv, vault, vta, body.Shares)
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepAccrueFees(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Payer      string `json:"payer"`
		Vault      string `json:"vault"`
		Strategist string `json:"strategist"`
		VaultID    uint64 `json:"vaultId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	payer, ok := a.decodePK(w, r, body.Payer, "payer")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	p, err := a.txBuilder(r).AccrueFees(payer, vault)
	if err != nil {
		a.failTxBuild(w, r, err)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepClaimFees(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist        string `json:"strategist"`
		Vault             string `json:"vault"`
		VaultID           uint64 `json:"vaultId"`
		VaultTokenAccount string `json:"vaultTokenAccount"`
		FeeWallet         string `json:"feeWallet"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	vta, ok := a.decodePK(w, r, body.VaultTokenAccount, "vaultTokenAccount")
	if !ok {
		return
	}
	feeWallet, ok := a.optionalPK(w, r, body.FeeWallet, "feeWallet")
	if !ok {
		return
	}
	if feeWallet.IsZero() {
		feeWallet = s.MustPK(a.addresses(r).DegenFeeWallet)
	}
	p, err := a.txBuilder(r).ClaimFees(st, vault, vta, feeWallet)
	if err != nil {
		a.failTxBuild(w, r, err)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepInitiateClose(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist string `json:"strategist"`
		Vault      string `json:"vault"`
		VaultID    uint64 `json:"vaultId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	p, err := a.txBuilder(r).InitiateVaultClose(st, vault)
	if err != nil {
		a.failTxBuild(w, r, err)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepUnlockLicense(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist string `json:"strategist"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	p, err := a.txBuilder(r).UnlockLicense(st)
	if err != nil {
		a.failTxBuild(w, r, err)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepInvestorConfig(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Investor   string `json:"investor"`
		Vault      string `json:"vault"`
		Strategist string `json:"strategist"`
		VaultID    uint64 `json:"vaultId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	inv, ok := a.decodePK(w, r, body.Investor, "investor")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	p, err := a.txBuilder(r).CreateInvestorConfig(inv, vault)
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepUpdateInvestorConfig(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Investor       string  `json:"investor"`
		Vault          string  `json:"vault"`
		Strategist     string  `json:"strategist"`
		VaultID        uint64  `json:"vaultId"`
		AutoFollow     *bool   `json:"autoFollow"`
		AllocationMode *uint8  `json:"allocationMode"`
		PositionSize   *uint64 `json:"positionSize"`
		MaxPositionBps *uint16 `json:"maxPositionBps"`
		TakeProfitBps  *uint16 `json:"takeProfitBps"`
		StopLossBps    *uint16 `json:"stopLossBps"`
		FollowTpSl     *bool   `json:"followTpSl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	inv, ok := a.decodePK(w, r, body.Investor, "investor")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	p, err := a.txBuilder(r).UpdateInvestorConfig(inv, vault, txprep.InvestorConfigParams{
		AutoFollow: body.AutoFollow, AllocationMode: body.AllocationMode, PositionSize: body.PositionSize,
		MaxPositionBps: body.MaxPositionBps, TakeProfitBps: body.TakeProfitBps, StopLossBps: body.StopLossBps,
		FollowTpSl: body.FollowTpSl,
	})
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepFollowOn(w http.ResponseWriter, r *http.Request)  { a.prepFollow(w, r, true) }
func (a *API) PrepFollowOff(w http.ResponseWriter, r *http.Request) { a.prepFollow(w, r, false) }

func (a *API) prepFollow(w http.ResponseWriter, r *http.Request, on bool) {
	var body struct {
		Investor   string `json:"investor"`
		Vault      string `json:"vault"`
		Strategist string `json:"strategist"`
		VaultID    uint64 `json:"vaultId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	inv, ok := a.decodePK(w, r, body.Investor, "investor")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	var p *txprep.Prepared
	var err error
	if on {
		p, err = a.txBuilder(r).FollowOn(inv, vault)
	} else {
		p, err = a.txBuilder(r).FollowOff(inv, vault)
	}
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepUpdateNav(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Payer             string `json:"payer"`
		Vault             string `json:"vault"`
		Strategist        string `json:"strategist"`
		VaultID           uint64 `json:"vaultId"`
		VaultTokenAccount string `json:"vaultTokenAccount"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	payer, ok := a.decodePK(w, r, body.Payer, "payer")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	vta, ok := a.decodePK(w, r, body.VaultTokenAccount, "vaultTokenAccount")
	if !ok {
		return
	}
	p, err := a.txBuilder(r).UpdateNav(payer, vault, vta)
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepKeeperRefresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Payer             string `json:"payer"`
		Vault             string `json:"vault"`
		Strategist        string `json:"strategist"`
		VaultID           uint64 `json:"vaultId"`
		VaultTokenAccount string `json:"vaultTokenAccount"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	payer, ok := a.decodePK(w, r, body.Payer, "payer")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	vta, ok := a.decodePK(w, r, body.VaultTokenAccount, "vaultTokenAccount")
	if !ok {
		return
	}
	p, err := a.txBuilder(r).KeeperRefresh(payer, vault, vta)
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepCloseVault(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist        string   `json:"strategist"`
		Vault             string   `json:"vault"`
		VaultID           uint64   `json:"vaultId"`
		VaultTokenAccount string   `json:"vaultTokenAccount"`
		Holders           []string `json:"holders"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	vta, ok := a.decodePK(w, r, body.VaultTokenAccount, "vaultTokenAccount")
	if !ok {
		return
	}
	b := a.txBuilder(r)
	holders := body.Holders
	if len(holders) == 0 {
		rows, _ := a.Pool.Query(r.Context(), `SELECT investor FROM vault_holdings WHERE vault=$1 AND shares::numeric > 0`, vault.String())
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				var inv string
				_ = rows.Scan(&inv)
				holders = append(holders, inv)
			}
		}
	}
	shareMint := s.ShareMintPDA(b.Program, vault)
	var metas []txprep.HolderMeta
	for _, h := range holders {
		own, err := s.ParsePK(h)
		if err != nil {
			continue
		}
		metas = append(metas, txprep.HolderMeta{Owner: own, ShareAta: s.ATA(shareMint, own)})
	}
	p, err := b.CloseVault(st, vault, vta, metas)
	if err != nil {
		a.failTxBuild(w, r, err)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepRequestTrade(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist        string `json:"strategist"`
		Vault             string `json:"vault"`
		VaultID           uint64 `json:"vaultId"`
		ShareAta          string `json:"shareAta"`
		InputMint         string `json:"inputMint"`
		OutputMint        string `json:"outputMint"`
		TradeID           uint64 `json:"tradeId"`
		Amount            uint64 `json:"amount"`
		Action            string `json:"action"` // buy|sell
		PositionMode      string `json:"positionMode"`
		SlippageBps       uint16 `json:"slippageBps"`
		MinAmountOut      uint64 `json:"minAmountOut"`
		TakeProfit        uint16 `json:"takeProfitBps"`
		StopLoss          uint16 `json:"stopLossBps"`
		LinkedPositionID  uint64 `json:"linkedPositionId"`
		PriorityFeeMicro  uint64 `json:"priorityFeeMicroLamports"`
		ComputeUnitLimit  uint32 `json:"computeUnitLimit"`
		VaultTokenAccount string `json:"vaultTokenAccount"` // wSOL vault ATA — used to auto-prep executeTrade
		SkipExecuteTrade  bool   `json:"skipExecuteTrade"`  // default false: also return auto executeTrade
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	out, ok := a.decodePK(w, r, body.OutputMint, "outputMint")
	if !ok {
		return
	}
	shareAta, ok := a.optionalPK(w, r, body.ShareAta, "shareAta")
	if !ok {
		return
	}
	inputMint, ok := a.optionalPK(w, r, body.InputMint, "inputMint")
	if !ok {
		return
	}
	if body.TradeID == 0 || body.Amount == 0 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "tradeId and amount required", nil)
		return
	}
	if body.Action == "" {
		body.Action = "buy"
	}
	b := a.txBuilder(r)
	req, err := b.RequestTrade(txprep.RequestTradeParams{
		Strategist: st, Vault: vault, ShareAta: shareAta, InputMint: inputMint, OutputMint: out,
		TradeID: body.TradeID, Amount: body.Amount, Action: body.Action, PositionMode: body.PositionMode,
		SlippageBps: body.SlippageBps, MinAmountOut: body.MinAmountOut,
		TakeProfit: body.TakeProfit, StopLoss: body.StopLoss, LinkedPositionID: body.LinkedPositionID,
		PriorityFeeMicro: body.PriorityFeeMicro, ComputeUnitLimit: body.ComputeUnitLimit,
	})
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	resp := map[string]any{
		"requestTrade": req,
		"note":         "Sign & submit requestTrade, then executeTrade (DEX auto from PROGRAM_IDS)",
	}
	if meta := b.DexMeta; len(meta) > 0 {
		resp["autoDex"] = meta[0]
	}
	if body.SkipExecuteTrade {
		httpx.OK(w, r, resp, http.StatusOK)
		return
	}
	inTok, outTok, err := deriveExecuteATAs(body.Action, vault, inputMint, out, body.VaultTokenAccount)
	if err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", err.Error(), nil)
		return
	}
	exec, err := b.ExecuteTrade(txprep.ExecuteTradeParams{
		Strategist: st, Vault: vault, TradeID: body.TradeID,
		VaultInputToken: inTok, VaultOutputToken: outTok,
		PriorityFeeMicro: body.PriorityFeeMicro, ComputeUnitLimit: body.ComputeUnitLimit,
	})
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	resp["executeTrade"] = exec
	httpx.OK(w, r, resp, http.StatusOK)
}

// deriveExecuteATAs picks vault input/output ATAs for buy (SOL→token) or sell (token→SOL).
func deriveExecuteATAs(action string, vault, inputMint, outputMint solana.PublicKey, vaultTokenAccount string) (inTok, outTok solana.PublicKey, err error) {
	action = strings.ToLower(action)
	var vta solana.PublicKey
	if vaultTokenAccount != "" {
		vta, err = s.ParsePK(vaultTokenAccount)
		if err != nil {
			return solana.PublicKey{}, solana.PublicKey{}, fmt.Errorf("vaultTokenAccount invalid")
		}
	}
	if action == "sell" {
		in := inputMint
		if in.IsZero() {
			return solana.PublicKey{}, solana.PublicKey{}, fmt.Errorf("inputMint required for sell")
		}
		inTok = s.ATA(in, vault)
		if !outputMint.IsZero() && !outputMint.Equals(s.WSOL) {
			outTok = s.ATA(outputMint, vault)
		} else if !vta.IsZero() {
			outTok = vta
		} else {
			outTok = s.ATA(s.WSOL, vault)
		}
		return inTok, outTok, nil
	}
	// buy
	if vta.IsZero() {
		return solana.PublicKey{}, solana.PublicKey{}, fmt.Errorf("vaultTokenAccount required to auto-prep executeTrade for buy")
	}
	if outputMint.IsZero() {
		return solana.PublicKey{}, solana.PublicKey{}, fmt.Errorf("outputMint required")
	}
	return vta, s.ATA(outputMint, vault), nil
}

func (a *API) PrepExecuteTrade(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist        string `json:"strategist"`
		Vault             string `json:"vault"`
		VaultID           uint64 `json:"vaultId"`
		TradeID           uint64 `json:"tradeId"`
		VaultInputToken   string `json:"vaultInputToken"`
		VaultOutputToken  string `json:"vaultOutputToken"`
		InputMint         string `json:"inputMint"`
		OutputMint        string `json:"outputMint"`
		VaultTokenAccount string `json:"vaultTokenAccount"`
		Action            string `json:"action"`
		PriorityFeeMicro  uint64 `json:"priorityFeeMicroLamports"`
		ComputeUnitLimit  uint32 `json:"computeUnitLimit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	if body.TradeID == 0 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "tradeId required", nil)
		return
	}
	inTok, ok := a.optionalPK(w, r, body.VaultInputToken, "vaultInputToken")
	if !ok {
		return
	}
	outTok, ok := a.optionalPK(w, r, body.VaultOutputToken, "vaultOutputToken")
	if !ok {
		return
	}
	if inTok.IsZero() || outTok.IsZero() {
		inMint, ok := a.optionalPK(w, r, body.InputMint, "inputMint")
		if !ok {
			return
		}
		outMint, ok := a.optionalPK(w, r, body.OutputMint, "outputMint")
		if !ok {
			return
		}
		action := body.Action
		if action == "" {
			if body.InputMint != "" && body.InputMint != s.WSOL.String() {
				action = "sell"
			} else {
				action = "buy"
			}
		}
		var err error
		inTok, outTok, err = deriveExecuteATAs(action, vault, inMint, outMint, body.VaultTokenAccount)
		if err != nil {
			httpx.Fail(w, r, 422, "VALIDATION_ERROR", err.Error(), nil)
			return
		}
	}
	b := a.txBuilder(r)
	p, err := b.ExecuteTrade(txprep.ExecuteTradeParams{
		Strategist: st, Vault: vault, TradeID: body.TradeID,
		VaultInputToken: inTok, VaultOutputToken: outTok,
		PriorityFeeMicro: body.PriorityFeeMicro, ComputeUnitLimit: body.ComputeUnitLimit,
	})
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	resp := map[string]any{"executeTrade": p}
	if len(b.DexMeta) > 0 {
		resp["autoDex"] = b.DexMeta[0]
	}
	httpx.OK(w, r, resp, http.StatusOK)
}

func (a *API) PrepExitPosition(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist         string  `json:"strategist"`
		Vault              string  `json:"vault"`
		VaultID            uint64  `json:"vaultId"`
		VaultTokenAccount  string  `json:"vaultTokenAccount"`
		OutputTokenAccount string  `json:"outputTokenAccount"`
		PositionID         uint64  `json:"positionId"`
		Proceeds           uint64  `json:"proceeds"`
		ExitPercent        float64 `json:"exitPercent"` // 0-100
		ExitBps            uint16  `json:"exitBps"`     // 1-10000 (overrides percent)
		PriorityFeeMicro   uint64  `json:"priorityFeeMicroLamports"`
		ComputeUnitLimit   uint32  `json:"computeUnitLimit"`
		// optional sell trade prep fields returned alongside accounting exit
		AlsoRequestSell bool   `json:"alsoRequestSell"`
		TradeID         uint64 `json:"tradeId"`
		InputMint       string `json:"inputMint"`
		OutputMint      string `json:"outputMint"`
		BaseAmount      uint64 `json:"baseAmount"` // position token size for percent→amount
		SlippageBps     uint16 `json:"slippageBps"`
		MinAmountOut    uint64 `json:"minAmountOut"`
		TakeProfitBps   uint16 `json:"takeProfitBps"`
		StopLossBps     uint16 `json:"stopLossBps"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	vta, ok := a.decodePK(w, r, body.VaultTokenAccount, "vaultTokenAccount")
	if !ok {
		return
	}
	outTok, ok := a.decodePK(w, r, body.OutputTokenAccount, "outputTokenAccount")
	if !ok {
		return
	}
	if body.PositionID == 0 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "positionId required", nil)
		return
	}
	bps := body.ExitBps
	if bps == 0 && body.ExitPercent > 0 {
		if body.ExitPercent > 100 {
			body.ExitPercent = 100
		}
		bps = uint16(body.ExitPercent * 100)
		if bps == 0 {
			bps = 1
		}
	}
	if bps == 0 {
		bps = 10_000 // default full exit
	}
	proceeds := body.Proceeds
	var priceQuote *gmgn.Quote
	var proceedsNote string
	if proceeds == 0 {
		proceeds, priceQuote, proceedsNote = a.resolveProceeds(r, 0, body.InputMint, body.BaseAmount, bps)
	}
	exitPrep, err := a.txBuilder(r).ExitPosition(txprep.ExitPositionParams{
		Strategist: st, Vault: vault, VaultTokenAccount: vta, OutputTokenAccount: outTok,
		PositionID: body.PositionID, Proceeds: proceeds, ReduceBps: bps,
		PriorityFeeMicro: body.PriorityFeeMicro, ComputeUnitLimit: body.ComputeUnitLimit,
	})
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	resp := map[string]any{
		"exit":                     exitPrep,
		"exitBps":                  bps,
		"exitPercent":              float64(bps) / 100,
		"proceeds":                 proceeds,
		"takeProfitBps":            body.TakeProfitBps,
		"stopLossBps":              body.StopLossBps,
		"slippageBps":              body.SlippageBps,
		"priorityFeeMicroLamports": body.PriorityFeeMicro,
	}
	if priceQuote != nil {
		resp["priceQuote"] = priceQuote
		if body.Proceeds == 0 && proceeds > 0 {
			resp["proceedsSource"] = "market"
		}
	}
	if proceedsNote != "" && proceeds == 0 {
		resp["proceedsNote"] = proceedsNote
	}
	if body.AlsoRequestSell {
		if body.TradeID == 0 {
			httpx.Fail(w, r, 422, "VALIDATION_ERROR", "tradeId required when alsoRequestSell=true", nil)
			return
		}
		inMint, ok := a.decodePK(w, r, body.InputMint, "inputMint")
		if !ok {
			return
		}
		outMint := s.WSOL
		if body.OutputMint != "" {
			outMint, ok = a.decodePK(w, r, body.OutputMint, "outputMint")
			if !ok {
				return
			}
		}
		amt := body.BaseAmount
		if amt == 0 {
			httpx.Fail(w, r, 422, "VALIDATION_ERROR", "baseAmount required to size sell from exit percent", nil)
			return
		}
		sellAmt := amt * uint64(bps) / 10_000
		if sellAmt == 0 {
			sellAmt = 1
		}
		sell, err := a.txBuilder(r).RequestTrade(txprep.RequestTradeParams{
			Strategist: st, Vault: vault, InputMint: inMint, OutputMint: outMint,
			TradeID: body.TradeID, Amount: sellAmt, Action: "sell", PositionMode: "fixed",
			SlippageBps: body.SlippageBps, MinAmountOut: body.MinAmountOut,
			TakeProfit: body.TakeProfitBps, StopLoss: body.StopLossBps, LinkedPositionID: body.PositionID,
			PriorityFeeMicro: body.PriorityFeeMicro, ComputeUnitLimit: body.ComputeUnitLimit,
		})
		if err != nil {
			httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
			return
		}
		resp["sellTrade"] = sell
		resp["sellAmount"] = sellAmt
		exec, err := a.txBuilder(r).ExecuteTrade(txprep.ExecuteTradeParams{
			Strategist: st, Vault: vault, TradeID: body.TradeID,
			VaultInputToken: s.ATA(inMint, vault), VaultOutputToken: s.ATA(outMint, vault),
			PriorityFeeMicro: body.PriorityFeeMicro, ComputeUnitLimit: body.ComputeUnitLimit,
		})
		if err != nil {
			httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
			return
		}
		resp["executeTrade"] = exec
		resp["note"] = "Sign & submit sellTrade, then executeTrade (DEX auto), then exit accounting tx"
		if meta := a.txBuilder(r).DexMeta; len(meta) > 0 {
			resp["autoDex"] = meta[0]
		}
	}
	httpx.OK(w, r, resp, http.StatusOK)
}

func (a *API) PrepReducePosition(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist         string  `json:"strategist"`
		Vault              string  `json:"vault"`
		VaultID            uint64  `json:"vaultId"`
		VaultTokenAccount  string  `json:"vaultTokenAccount"`
		OutputTokenAccount string  `json:"outputTokenAccount"`
		PositionID         uint64  `json:"positionId"`
		Proceeds           uint64  `json:"proceeds"`
		ExitPercent        float64 `json:"exitPercent"`
		ExitBps            uint16  `json:"exitBps"`
		InputMint          string  `json:"inputMint"`
		BaseAmount         uint64  `json:"baseAmount"`
		PriorityFeeMicro   uint64  `json:"priorityFeeMicroLamports"`
		ComputeUnitLimit   uint32  `json:"computeUnitLimit"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	vta, ok := a.decodePK(w, r, body.VaultTokenAccount, "vaultTokenAccount")
	if !ok {
		return
	}
	outTok, ok := a.decodePK(w, r, body.OutputTokenAccount, "outputTokenAccount")
	if !ok {
		return
	}
	bps := body.ExitBps
	if bps == 0 && body.ExitPercent > 0 {
		bps = uint16(body.ExitPercent * 100)
	}
	if bps == 0 || bps > 10_000 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "exitBps (1-10000) or exitPercent (0-100) required", nil)
		return
	}
	proceeds := body.Proceeds
	var priceQuote *gmgn.Quote
	var proceedsNote string
	if proceeds == 0 {
		proceeds, priceQuote, proceedsNote = a.resolveProceeds(r, 0, body.InputMint, body.BaseAmount, bps)
	}
	p, err := a.txBuilder(r).ReducePosition(txprep.ExitPositionParams{
		Strategist: st, Vault: vault, VaultTokenAccount: vta, OutputTokenAccount: outTok,
		PositionID: body.PositionID, Proceeds: proceeds, ReduceBps: bps,
		PriorityFeeMicro: body.PriorityFeeMicro, ComputeUnitLimit: body.ComputeUnitLimit,
	})
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	resp := map[string]any{"reduce": p, "proceeds": proceeds, "exitBps": bps}
	if priceQuote != nil {
		resp["priceQuote"] = priceQuote
		if body.Proceeds == 0 && proceeds > 0 {
			resp["proceedsSource"] = "market"
		}
	}
	if proceedsNote != "" && proceeds == 0 {
		resp["proceedsNote"] = proceedsNote
	}
	httpx.OK(w, r, resp, http.StatusOK)
}

func (a *API) PrepUpdateVaultRisk(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist       string   `json:"strategist"`
		Vault            string   `json:"vault"`
		VaultID          uint64   `json:"vaultId"`
		AcceptedMints    []string `json:"acceptedMints"`
		PriorityFeeMicro uint64   `json:"priorityFeeMicroLamports"`
		ComputeUnitLimit uint32   `json:"computeUnitLimit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	mints, ok := a.decodePKList(w, r, body.AcceptedMints, "acceptedMints")
	if !ok || len(mints) == 0 {
		if ok {
			httpx.Fail(w, r, 422, "VALIDATION_ERROR", "acceptedMints required", nil)
		}
		return
	}
	desc, slip := "1Vault pooled book", uint16(100)
	if vd, err := txprep.NewRPC(a.addresses(r).RPCURL).AccountData(vault); err == nil {
		if d, s, err := s.DecodeVaultDescriptionAndSlippage(vd); err == nil {
			desc, slip = d, s
		}
	}
	p, err := a.txBuilder(r).UpdateVaultRisk(txprep.UpdateVaultRiskParams{
		Strategist: st, Vault: vault, Description: desc, MaxSlippageBps: slip,
		AcceptedMints: mints, PriorityFeeMicro: body.PriorityFeeMicro, ComputeUnitLimit: body.ComputeUnitLimit,
	})
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, map[string]any{
		"transaction":     p.TransactionBase64,
		"recentBlockhash": p.RecentBlockhash,
		"feePayer":        p.FeePayer,
		"requiredSigners": p.Signers,
		"signerDetails":   p.SignerDetails,
		"message":         p.Message,
		"accounts":        p.Accounts,
	}, http.StatusOK)
}

func (a *API) PrepOpenPosition(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist       string `json:"strategist"`
		Vault            string `json:"vault"`
		VaultID          uint64 `json:"vaultId"`
		TradeID          uint64 `json:"tradeId"`
		PositionID       uint64 `json:"positionId"`
		EntryValue       uint64 `json:"entryValue"`
		OutputAmount     uint64 `json:"outputAmount"`
		PriorityFeeMicro uint64 `json:"priorityFeeMicroLamports"`
		ComputeUnitLimit uint32 `json:"computeUnitLimit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	if body.TradeID == 0 || body.PositionID == 0 {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "tradeId and positionId required", nil)
		return
	}
	p, err := a.txBuilder(r).OpenPosition(txprep.OpenPositionParams{
		Strategist: st, Vault: vault, TradeID: body.TradeID, PositionID: body.PositionID,
		EntryValue: body.EntryValue, OutputAmount: body.OutputAmount,
		PriorityFeeMicro: body.PriorityFeeMicro, ComputeUnitLimit: body.ComputeUnitLimit,
	})
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, p, http.StatusOK)
}

func (a *API) PrepClosePosition(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Strategist         string `json:"strategist"`
		Vault              string `json:"vault"`
		VaultID            uint64 `json:"vaultId"`
		VaultTokenAccount  string `json:"vaultTokenAccount"`
		OutputTokenAccount string `json:"outputTokenAccount"`
		PositionID         uint64 `json:"positionId"`
		Proceeds           uint64 `json:"proceeds"`
		InputMint          string `json:"inputMint"`
		BaseAmount         uint64 `json:"baseAmount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "invalid json", nil)
		return
	}
	st, ok := a.decodePK(w, r, body.Strategist, "strategist")
	if !ok {
		return
	}
	vault, ok := a.resolveVaultPubkey(w, r, body.Vault, body.Strategist, body.VaultID)
	if !ok {
		return
	}
	vta, ok := a.decodePK(w, r, body.VaultTokenAccount, "vaultTokenAccount")
	if !ok {
		return
	}
	out, ok := a.decodePK(w, r, body.OutputTokenAccount, "outputTokenAccount")
	if !ok {
		return
	}
	proceeds := body.Proceeds
	var priceQuote *gmgn.Quote
	var proceedsNote string
	if proceeds == 0 {
		proceeds, priceQuote, proceedsNote = a.resolveProceeds(r, 0, body.InputMint, body.BaseAmount, 10_000)
	}
	p, err := a.txBuilder(r).ClosePosition(st, vault, vta, out, body.PositionID, proceeds)
	if err != nil {
		httpx.Fail(w, r, 502, "TX_BUILD_FAILED", err.Error(), nil)
		return
	}
	resp := map[string]any{"close": p, "proceeds": proceeds}
	if priceQuote != nil {
		resp["priceQuote"] = priceQuote
		if body.Proceeds == 0 && proceeds > 0 {
			resp["proceedsSource"] = "market"
		}
	}
	if proceedsNote != "" && proceeds == 0 {
		resp["proceedsNote"] = proceedsNote
	}
	httpx.OK(w, r, resp, http.StatusOK)
}

func (a *API) TxSubmit(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SignedTransaction string `json:"signedTransaction"`
		DepositIntentID   *int   `json:"depositIntentId"`
		Ingest            *bool  `json:"ingest"`
		SignerDetails     []signing.Detail `json:"signerDetails"`
		ServerSigners     map[string]string `json:"serverSigners"` // pubkey -> base58 secret (flow ephemeral fallback)
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SignedTransaction == "" {
		httpx.Fail(w, r, 422, "VALIDATION_ERROR", "signedTransaction (base64) required", nil)
		return
	}
	serverKeys := a.serverSignerKeys(body.ServerSigners)
	autoIngest := a.Indexer != nil && a.Indexer.Enabled()
	if body.Ingest != nil && !*body.Ingest {
		autoIngest = false
	}
	sig, err := a.finalizeAndSend(r, body.SignedTransaction, body.SignerDetails, serverKeys, autoIngest)
	if err != nil {
		if isMissingEOA(err) {
			httpx.Fail(w, r, 422, "MISSING_EOA_SIGNATURE", err.Error(), nil)
			return
		}
		httpx.Fail(w, r, 502, "SEND_FAILED", err.Error(), nil)
		return
	}
	if body.DepositIntentID != nil {
		_, _ = a.Pool.Exec(r.Context(), `
			UPDATE deposit_intents SET status='submitted', signature=$2, updated_at=NOW()
			WHERE id=$1 AND status='pending'`, *body.DepositIntentID, sig)
	}
	var ingest any
	if r, ok := txconfirm.DefaultTracker.Get(sig); ok && r.Ingest != nil {
		ingest = r.Ingest
	}
	httpx.OK(w, r, map[string]any{"signature": sig, "status": "submitted", "ingest": ingest}, http.StatusOK)
}

func (a *API) serverSignerKeys(extra map[string]string) map[string]solana.PrivateKey {
	out := map[string]solana.PrivateKey{}
	if len(a.Keeper) > 0 {
		out[a.Keeper.PublicKey().String()] = a.Keeper
	}
	for pk, sec := range extra {
		if sk, err := solana.PrivateKeyFromBase58(sec); err == nil {
			out[pk] = sk
		}
	}
	return out
}

func (a *API) TxStatus(w http.ResponseWriter, r *http.Request) {
	sig := chi.URLParam(r, "signature")
	rpc := txprep.NewRPC(a.addresses(r).RPCURL)
	st, err := rpc.Status(sig)
	if err != nil {
		httpx.Fail(w, r, 502, "STATUS_FAILED", err.Error(), nil)
		return
	}
	httpx.OK(w, r, txconfirm.DefaultTracker.MergeStatus(sig, st), http.StatusOK)
}
