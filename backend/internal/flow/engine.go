package flow

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/1vault/backend/internal/cluster"
	"github.com/1vault/backend/internal/gmgn"
	"github.com/1vault/backend/internal/indexer"
	"github.com/1vault/backend/internal/signing"
	s "github.com/1vault/backend/internal/solana"
	"github.com/1vault/backend/internal/txprep"
	"github.com/1vault/backend/internal/vaults"
	"github.com/gagliardetto/solana-go"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	Store    *Store
	Pool     *pgxpool.Pool
	Cfg      cluster.Addresses
	Indexer  *indexer.Client
	Keeper   solana.PrivateKey
	GMGN     *gmgn.Client
	OnIngest func()
}

func NewService(d Deps) *Service {
	return &Service{
		Store:    &Store{Pool: d.Pool},
		Pool:     d.Pool,
		Cfg:      d.Addr,
		Indexer:  d.Indexer,
		Keeper:   d.Keeper,
		GMGN:     d.GMGN,
		OnIngest: d.OnIngest,
	}
}

func (svc *Service) builder() *txprep.Builder {
	return txprep.NewBuilder(svc.Cfg, txprep.NewRPC(svc.Cfg.RPCURL))
}

func (svc *Service) Start(ctx context.Context, p StartParams) (*Job, error) {
	var vaultTokenSecret string
	if p.Mode == ModeCreateVault && p.VaultTokenAccount == "" {
		kp := solana.NewWallet()
		p.VaultTokenAccount = kp.PublicKey().String()
		vaultTokenSecret = kp.PrivateKey.String()
	}
	steps, err := PlanSteps(p)
	if err != nil {
		return nil, err
	}
	job, err := svc.Store.InsertJob(ctx, string(svc.Cfg.Cluster), p.Mode, p.Strategist, p, steps)
	if err != nil {
		return nil, err
	}
	if p.VaultTokenAccount != "" && p.Mode == ModeCreateVault {
		patch := map[string]any{"vaultTokenAccount": p.VaultTokenAccount}
		if vaultTokenSecret != "" {
			patch["vaultTokenSecret"] = vaultTokenSecret
		}
		_ = svc.Store.MergeContext(ctx, job.ID, patch)
	}
	if p.SkipTradeSteps && p.TradeID > 0 {
		_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{
			"tradeId": p.TradeID, "executedTradeId": p.TradeID, "positionId": p.PositionID,
		})
	}
	if err := svc.AdvanceToReady(ctx, job.ID); err != nil {
		_ = svc.Store.SetJobStatus(ctx, job.ID, StatusFailed, strPtr(err.Error()))
		return nil, err
	}
	return svc.Store.Get(ctx, job.ID)
}

func strPtr(s string) *string { return &s }

func (svc *Service) AdvanceToReady(ctx context.Context, id uuid.UUID) error {
	job, err := svc.Store.Get(ctx, id)
	if err != nil {
		return err
	}
	if job.Status == StatusCancelled || job.Status == StatusCompleted || job.Status == StatusFailed {
		return nil
	}
	params, err := ParseParams(job.Params)
	if err != nil {
		return err
	}
	b := svc.builder()
	rpc := txprep.NewRPC(svc.Cfg.RPCURL)

	for _, st := range job.Steps {
		if st.Status == StepConfirmed || st.Status == StepSkipped {
			continue
		}
		if st.Status == StepAwaitingSignature || st.Status == StepSubmitted {
			_ = svc.Store.SetCurrentStep(ctx, id, st.Seq)
			_ = svc.Store.SetJobStatus(ctx, id, StatusAwaitingSignature, nil)
			return nil
		}
		// pending → prepare or skip
		skip, reason, err := svc.shouldSkip(ctx, rpc, b, params, job, st)
		if err != nil {
			return err
		}
		if skip {
			_ = svc.Store.MarkStepSkipped(ctx, st.ID, reason)
			continue
		}
		prep, details, err := svc.prepareStep(ctx, b, params, job, st)
		if err != nil {
			_ = svc.Store.MarkStepFailed(ctx, st.ID, err.Error())
			_ = svc.Store.SetJobStatus(ctx, id, StatusFailed, strPtr(err.Error()))
			return err
		}
		signerPKs := make([]string, 0, len(details))
		for _, d := range details {
			signerPKs = append(signerPKs, d.Pubkey)
		}
		_ = svc.Store.MarkStepAwaiting(ctx, st.ID, prep, signerPKs, details)
		_ = svc.Store.SetCurrentStep(ctx, id, st.Seq)
		if prep != nil && prep.SigningMode == signing.ModeServer && len(svc.Keeper) > 0 {
			_ = svc.Store.SetJobStatus(ctx, id, StatusConfirming, nil)
			go svc.autoSubmitServerStep(id, st.ID, prep, details)
			return nil
		}
		_ = svc.Store.SetJobStatus(ctx, id, StatusAwaitingSignature, nil)
		return nil
	}
	_ = svc.Store.SetJobStatus(ctx, id, StatusCompleted, nil)
	return nil
}

func (svc *Service) shouldSkip(ctx context.Context, rpc *txprep.RPC, b *txprep.Builder, p StartParams, job *Job, st Step) (bool, string, error) {
	stPK, _ := s.ParsePK(p.Strategist)
	switch st.Name {
	case "register_strategist":
		exists, err := rpc.AccountExists(s.StrategistPDA(b.Program, stPK))
		return exists, "strategist PDA already exists", err
	case "lock_license":
		exists, err := rpc.AccountExists(s.LicensePDA(b.Program, stPK))
		return exists, "license already locked", err
	case "create_investor_config":
		inv, _ := s.ParsePK(st.SignerPubkey)
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return false, "", err
		}
		exists, err := rpc.AccountExists(s.InvestorConfigPDA(b.Program, vault, inv))
		return exists, "investor config exists", err
	case "update_investor_config":
		// Deposit/park only needs an existing config; re-update hits VaultPaused when
		// the vault is not Active and is unnecessary if TP/SL already set at create.
		if p.Mode == ModeDeposit {
			inv, _ := s.ParsePK(st.SignerPubkey)
			vault, err := svc.resolveVault(p, job)
			if err != nil {
				return false, "", err
			}
			exists, err := rpc.AccountExists(s.InvestorConfigPDA(b.Program, vault, inv))
			if err != nil {
				return false, "", err
			}
			if exists {
				return true, "investor config already set — skip update on deposit", nil
			}
		}
		return false, "", nil
	case "execute_trade":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return false, "", err
		}
		tradeID := tradeIDFromJobStep(job, "request_trade")
		if tradeID == 0 {
			tradeID = resolveTradeID(p, job)
		}
		if tradeID == 0 {
			return false, "", nil
		}
		data, err := rpc.AccountData(s.TradePDA(b.Program, vault, tradeID))
		if err != nil {
			return false, "", nil
		}
		st, err := s.DecodeTradeStatus(data)
		if err != nil {
			return false, "", nil
		}
		if st == s.TradeStatusExecuted {
			return true, fmt.Sprintf("trade %d already executed", tradeID), nil
		}
		return false, "", nil
	case "unlock_license":
		// skip if strategist still has active vaults in DB
		var n int
		_ = svc.Pool.QueryRow(ctx, `SELECT COALESCE(active_vault_count,0) FROM strategists WHERE pubkey=$1`, p.Strategist).Scan(&n)
		if n > 0 {
			return true, "other active vaults remain", nil
		}
		return false, "", nil
	case "close_position":
		if p.SkipClosePosition {
			return true, "skipClosePosition", nil
		}
		return false, "", nil
	case "claim_fees":
		if p.SkipClaimFees {
			return true, "skipClaimFees", nil
		}
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return false, "", err
		}
		feePDA := s.VaultFeePDA(b.Program, vault)
		exists, err := rpc.AccountExists(feePDA)
		if err != nil {
			return false, "", err
		}
		if !exists {
			return true, "no vault fee state — nothing to claim", nil
		}
		data, err := rpc.AccountData(feePDA)
		if err != nil {
			return false, "", err
		}
		claimable, err := s.DecodeVaultFeeClaimable(data)
		if err != nil {
			return false, "", err
		}
		if claimable == 0 {
			return true, "nothing to claim (accrued performance fees already claimed or zero)", nil
		}
		return false, "", nil
	case "initiate_close":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return false, "", err
		}
		data, err := rpc.AccountData(vault)
		if err != nil {
			return false, "", err
		}
		st, err := s.DecodeVaultStatus(data)
		if err != nil {
			return false, "", err
		}
		switch st {
		case s.VaultStatusClosing:
			return true, "vault already Closing — skip initiate_close", nil
		case s.VaultStatusClosed:
			return true, "vault already Closed — skip initiate_close", nil
		case s.VaultStatusActive, s.VaultStatusPaused:
			return false, "", nil
		default:
			return false, "", fmt.Errorf("vault %s has unexpected status %s", vault, st)
		}
	case "close_vault":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return false, "", err
		}
		data, err := rpc.AccountData(vault)
		if err != nil {
			return false, "", err
		}
		st, err := s.DecodeVaultStatus(data)
		if err != nil {
			return false, "", err
		}
		if st == s.VaultStatusClosed {
			return true, "vault already Closed — skip close_vault", nil
		}
		return false, "", nil
	default:
		return false, "", nil
	}
}

func resolveTradeID(p StartParams, job *Job) uint64 {
	if job != nil && job.Context != nil {
		if v, ok := job.Context["executedTradeId"]; ok {
			if id := contextU64(v); id > 0 {
				return id
			}
		}
		if v, ok := job.Context["tradeId"]; ok {
			if id := contextU64(v); id > 0 {
				return id
			}
		}
	}
	return p.TradeID
}

func contextU64(v any) uint64 {
	switch n := v.(type) {
	case float64:
		if n > 0 {
			return uint64(n)
		}
	case json.Number:
		if i, err := n.Int64(); err == nil && i > 0 {
			return uint64(i)
		}
	case int:
		if n > 0 {
			return uint64(n)
		}
	case int64:
		if n > 0 {
			return uint64(n)
		}
	case uint64:
		return n
	case string:
		if i, err := strconv.ParseUint(n, 10, 64); err == nil {
			return i
		}
	}
	return 0
}

func tradeIDFromJobStep(job *Job, names ...string) uint64 {
	if job == nil {
		return 0
	}
	want := make(map[string]bool, len(names))
	for _, n := range names {
		want[n] = true
	}
	var best uint64
	for _, st := range job.Steps {
		if !want[st.Name] {
			continue
		}
		var prep struct {
			Accounts map[string]string `json:"accounts"`
		}
		if len(st.Prepared) == 0 {
			continue
		}
		if json.Unmarshal(st.Prepared, &prep) != nil {
			continue
		}
		if id := contextU64(prep.Accounts["tradeId"]); id > best {
			best = id
		}
	}
	return best
}

func jobStepConfirmed(job *Job, name string) bool {
	if job == nil {
		return false
	}
	for _, st := range job.Steps {
		if st.Name == name && st.Status == StepConfirmed {
			return true
		}
	}
	return false
}

func waitTradeStatus(load func(solana.PublicKey) ([]byte, error), tradePK solana.PublicKey, want uint8, attempts int, delay time.Duration) (uint8, error) {
	if attempts < 1 {
		attempts = 1
	}
	var last uint8
	for i := 0; i < attempts; i++ {
		data, err := load(tradePK)
		if err != nil {
			return 0, err
		}
		st, err := s.DecodeTradeStatus(data)
		if err != nil {
			return 0, err
		}
		if st == want {
			return st, nil
		}
		last = st
		if i+1 < attempts {
			time.Sleep(delay)
		}
	}
	return last, fmt.Errorf("trade status %d want %d after %d attempts", last, want, attempts)
}

func (svc *Service) resolveOpenTradeID(ctx context.Context, b *txprep.Builder, vault solana.PublicKey, p StartParams, job *Job) (tradeID, posID uint64, err error) {
	rpc := txprep.NewRPC(svc.Cfg.RPCURL)
	load := func(pk solana.PublicKey) ([]byte, error) { return rpc.AccountData(pk) }

	// Same-flow trade: execute_trade step is source of truth (not stale executed trades).
	tradeID = tradeIDFromJobStep(job, "execute_trade", "request_trade")
	if tradeID == 0 {
		tradeID = resolveTradeID(p, job)
	}
	if tradeID == 0 {
		return 0, 0, fmt.Errorf("tradeId missing for open_position")
	}

	posID = p.PositionID
	if vaultData, derr := load(vault); derr == nil {
		if _, onPos, derr := s.DecodeVaultNextIDs(vaultData); derr == nil && onPos > 0 {
			posID = onPos
		}
	}
	if posID == 0 {
		posID = 1
	}

	attempts := 12
	if jobStepConfirmed(job, "execute_trade") {
		attempts = 20
	}
	st, err := waitTradeStatus(load, s.TradePDA(b.Program, vault, tradeID), s.TradeStatusExecuted, attempts, 400*time.Millisecond)
	if err != nil {
		return 0, 0, fmt.Errorf("trade %d not executed on-chain (status=%d); complete execute_trade first", tradeID, st)
	}
	_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{
		"tradeId": tradeID, "executedTradeId": tradeID, "positionId": posID,
	})
	return tradeID, posID, nil
}

func (svc *Service) resolveVault(p StartParams, job *Job) (solana.PublicKey, error) {
	if v, ok := job.Context["vault"].(string); ok && v != "" {
		return s.ParsePK(v)
	}
	if p.Vault != "" {
		return s.ParsePK(p.Vault)
	}
	if p.Strategist != "" && p.VaultID > 0 {
		st, err := s.ParsePK(p.Strategist)
		if err != nil {
			return solana.PublicKey{}, err
		}
		return s.VaultPDA(svc.builder().Program, st, p.VaultID), nil
	}
	return solana.PublicKey{}, fmt.Errorf("vault or strategist+vaultId required")
}

func (svc *Service) resolveVTA(ctx context.Context, p StartParams, job *Job) (solana.PublicKey, error) {
	if v, ok := job.Context["vaultTokenAccount"].(string); ok && v != "" {
		return s.ParsePK(v)
	}
	if p.VaultTokenAccount != "" {
		pk, err := s.ParsePK(p.VaultTokenAccount)
		if err != nil {
			return solana.PublicKey{}, err
		}
		if job != nil && job.ID != uuid.Nil {
			_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{"vaultTokenAccount": pk.String()})
		}
		return pk, nil
	}
	vault, err := svc.resolveVault(p, job)
	if err != nil {
		return solana.PublicKey{}, err
	}
	data, err := txprep.NewRPC(svc.Cfg.RPCURL).AccountData(vault)
	if err != nil {
		return solana.PublicKey{}, fmt.Errorf("resolve vaultTokenAccount: %w", err)
	}
	vta, err := s.DecodeVaultTokenAccount(data)
	if err != nil {
		return solana.PublicKey{}, fmt.Errorf("decode vault account: %w", err)
	}
	if job != nil && job.ID != uuid.Nil {
		_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{"vaultTokenAccount": vta.String()})
	}
	return vta, nil
}

func metaInt(m map[string]any, key string) int {
	switch v := m[key].(type) {
	case float64:
		return int(v)
	case json.Number:
		n, _ := v.Int64()
		return int(n)
	case string:
		n, _ := strconv.Atoi(v)
		return n
	default:
		return 0
	}
}

func metaU64(m map[string]any, key string) uint64 {
	switch v := m[key].(type) {
	case float64:
		return uint64(v)
	case json.Number:
		n, _ := v.Int64()
		return uint64(n)
	case string:
		n, _ := strconv.ParseUint(v, 10, 64)
		return n
	default:
		return 0
	}
}

func (svc *Service) prepareStep(ctx context.Context, b *txprep.Builder, p StartParams, job *Job, st Step) (*txprep.Prepared, []signing.Detail, error) {
	meta, _ := svc.Store.GetStepMeta(ctx, st.ID)
	stPK, err := s.ParsePK(p.Strategist)
	if err != nil {
		return nil, nil, err
	}

	switch st.Name {
	case "register_strategist":
		prep, err := b.RegisterStrategist(stPK)
		return prep, prep.SignerDetails, err
	case "lock_license":
		prep, err := b.LockLicense(stPK)
		return prep, prep.SignerDetails, err
	case "create_vault":
		vta, err := svc.resolveVTA(ctx, p, job)
		if err != nil {
			return nil, nil, err
		}
		vt := vaults.Default()
		if p.VaultType != "" {
			if parsed, ok := vaults.Parse(p.VaultType); ok {
				vt = parsed
			} else {
				return nil, nil, fmt.Errorf("vaultType must be pooled|sliced")
			}
		}
		prep, err := b.CreateVault(txprep.CreateVaultParams{
			Strategist: stPK, VaultTokenAccount: vta, VaultID: p.VaultID,
			Name: p.Name, PerformanceFeeBps: p.PerformanceFeeBps,
			VaultType: string(vt),
		})
		if err != nil {
			return nil, nil, err
		}
		vault := s.VaultPDA(b.Program, stPK, p.VaultID)
		_ = vaults.UpsertRegistry(ctx, svc.Pool, vault.String(), p.Strategist, p.VaultID, vt)
		_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{
			"vault": vault.String(), "vaultId": p.VaultID, "vaultTokenAccount": vta.String(),
			"vaultType": string(vt), "vaultTypeLabel": vt.Label(),
		})
		if acc, ok := prep.Accounts.(map[string]string); ok {
			acc["vaultType"] = string(vt)
			acc["vaultTypeLabel"] = vt.Label()
			acc["vaultTypeMeaning"] = vt.Meaning()
			prep.Accounts = acc
		}
		if sec, ok := job.Context["vaultTokenSecret"].(string); ok && sec != "" {
			_ = svc.Store.MergeStepMeta(ctx, st.ID, map[string]any{"ephemeralSecret": sec})
		}
		return prep, prep.SignerDetails, nil
	case "create_investor_config":
		inv := p.Investors[metaInt(meta, "i")]
		invPK, _ := s.ParsePK(inv.Pubkey)
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		prep, err := b.CreateInvestorConfig(invPK, vault)
		return prep, prep.SignerDetails, err
	case "update_investor_config":
		inv := p.Investors[metaInt(meta, "i")]
		invPK, _ := s.ParsePK(inv.Pubkey)
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		af := true
		if inv.AutoFollow != nil {
			af = *inv.AutoFollow
		}
		mode := uint8(1) // Percentage
		copyBps := uint64(10000)
		if inv.CopyBps != nil {
			copyBps = *inv.CopyBps
		}
		maxPos := uint16(5000)
		params := txprep.InvestorConfigParams{
			AutoFollow: &af, AllocationMode: &mode, PositionSize: &copyBps,
			MaxPositionBps: &maxPos, TakeProfitBps: inv.TakeProfitBps, StopLossBps: inv.StopLossBps,
			FollowTpSl: boolPtr(true), FollowFullExit: boolPtr(true), FollowPartialExit: boolPtr(true),
		}
		prep, err := b.UpdateInvestorConfig(invPK, vault, params)
		return prep, prep.SignerDetails, err
	case "follow_on":
		inv := p.Investors[metaInt(meta, "i")]
		invPK, _ := s.ParsePK(inv.Pubkey)
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		prep, err := b.FollowOn(invPK, vault)
		return prep, prep.SignerDetails, err
	case "follow_off":
		inv := p.Investors[metaInt(meta, "i")]
		invPK, _ := s.ParsePK(inv.Pubkey)
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		prep, err := b.FollowOff(invPK, vault)
		return prep, prep.SignerDetails, err
	case "park":
		inv := p.Investors[metaInt(meta, "i")]
		invPK, _ := s.ParsePK(inv.Pubkey)
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		vta, err := svc.resolveVTA(ctx, p, job)
		if err != nil {
			return nil, nil, err
		}
		lamports := metaU64(meta, "lamports")
		if lamports == 0 {
			lamports = inv.Lamports
		}
		intentID, err := svc.recordDepositIntent(ctx, job, inv, vault.String(), lamports)
		if err != nil {
			return nil, nil, err
		}
		_ = svc.Store.MergeStepMeta(ctx, st.ID, map[string]any{"depositIntentId": intentID})
		prep, err := b.Park(invPK, vault, vta, lamports)
		return prep, prep.SignerDetails, err
	case "update_nav":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		vta, err := svc.resolveVTA(ctx, p, job)
		if err != nil {
			return nil, nil, err
		}
		payer := stPK
		kinds := map[string]signing.SignerKind{payer.String(): signing.KindEOA}
		if len(svc.Keeper) > 0 {
			payer = svc.Keeper.PublicKey()
			kinds = map[string]signing.SignerKind{payer.String(): signing.KindKeeper}
		}
		prep, err := b.UpdateNav(payer, vault, vta)
		if prep != nil {
			txprep.AttachSignerMeta(prep, kinds)
		}
		return prep, prep.SignerDetails, err
	case "withdraw":
		inv := p.Investors[metaInt(meta, "i")]
		invPK, _ := s.ParsePK(inv.Pubkey)
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		vta, err := svc.resolveVTA(ctx, p, job)
		if err != nil {
			return nil, nil, err
		}
		shares := metaU64(meta, "shares")
		if shares == 0 {
			shares = inv.Shares
		}
		prep, err := b.WithdrawOpts(txprep.WithdrawParams{
			Investor: invPK, Vault: vault, VaultTokenAccount: vta, Shares: shares,
			PriorityFeeMicro: p.PriorityFeeMicro, ComputeUnitLimit: p.ComputeUnitLimit,
		})
		return prep, prep.SignerDetails, err
	case "request_trade":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		out, err := s.ParsePK(p.OutputMint)
		if err != nil {
			return nil, nil, err
		}
		tradeID := p.TradeID
		if data, derr := txprep.NewRPC(svc.Cfg.RPCURL).AccountData(vault); derr == nil {
			if onChain, _, err := s.DecodeVaultNextIDs(data); err == nil {
				tradeID = onChain
			}
		}
		_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{"tradeId": tradeID})
		prep, err := b.RequestTrade(txprep.RequestTradeParams{
			Strategist: stPK, Vault: vault, OutputMint: out,
			TradeID: tradeID, Amount: p.Amount, Action: "buy",
			SlippageBps: p.SlippageBps, MinAmountOut: p.MinAmountOut,
			TakeProfit: p.TakeProfitBps, StopLoss: p.StopLossBps,
			PriorityFeeMicro: p.PriorityFeeMicro, ComputeUnitLimit: p.ComputeUnitLimit,
		})
		return prep, prep.SignerDetails, err
	case "request_sell":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		inMint, err := s.ParsePK(p.InputMint)
		if err != nil {
			return nil, nil, err
		}
		outMint := s.WSOL
		if p.OutputMint != "" {
			outMint, err = s.ParsePK(p.OutputMint)
			if err != nil {
				return nil, nil, err
			}
		}
		bps := p.ExitBps
		if bps == 0 && p.ExitPercent > 0 {
			bps = uint16(p.ExitPercent * 100)
		}
		if bps == 0 {
			bps = 10_000
		}
		base := p.BaseAmount
		if base == 0 {
			base = p.Amount
		}
		if base == 0 {
			return nil, nil, fmt.Errorf("baseAmount or amount required for exit percent sizing")
		}
		sellAmt := base * uint64(bps) / 10_000
		if sellAmt == 0 {
			sellAmt = 1
		}
		_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{"exitBps": bps, "sellAmount": sellAmt})
		prep, err := b.RequestTrade(txprep.RequestTradeParams{
			Strategist: stPK, Vault: vault, InputMint: inMint, OutputMint: outMint,
			TradeID: p.TradeID, Amount: sellAmt, Action: "sell", PositionMode: "fixed",
			SlippageBps: p.SlippageBps, MinAmountOut: p.MinAmountOut,
			TakeProfit: p.TakeProfitBps, StopLoss: p.StopLossBps, LinkedPositionID: p.PositionID,
			PriorityFeeMicro: p.PriorityFeeMicro, ComputeUnitLimit: p.ComputeUnitLimit,
		})
		return prep, prep.SignerDetails, err
	case "execute_trade":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		vta, err := svc.resolveVTA(ctx, p, job)
		if err != nil {
			return nil, nil, err
		}
		inTok, outTok, err := resolveExecuteTokenAccounts(p, vault, vta)
		if err != nil {
			return nil, nil, err
		}
		tradeID := resolveTradeID(p, job)
		if tradeID == 0 {
			tradeID = p.TradeID
		}
		_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{"tradeId": tradeID})
		prep, err := b.ExecuteTrade(txprep.ExecuteTradeParams{
			Strategist: stPK, Vault: vault, TradeID: tradeID,
			VaultInputToken: inTok, VaultOutputToken: outTok,
			PriorityFeeMicro: p.PriorityFeeMicro, ComputeUnitLimit: p.ComputeUnitLimit,
		})
		return prep, prep.SignerDetails, err
	case "exit_position":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		vta, err := svc.resolveVTA(ctx, p, job)
		if err != nil {
			return nil, nil, err
		}
		outATA := vta
		if p.OutputTokenAccount != "" {
			outATA, err = s.ParsePK(p.OutputTokenAccount)
			if err != nil {
				return nil, nil, err
			}
		} else if p.InputMint != "" {
			mint, err := s.ParsePK(p.InputMint)
			if err != nil {
				return nil, nil, err
			}
			outATA = s.ATA(mint, vault)
		}
		bps := p.ExitBps
		if bps == 0 && p.ExitPercent > 0 {
			bps = uint16(p.ExitPercent * 100)
		}
		if bps == 0 {
			if v, ok := job.Context["exitBps"].(float64); ok {
				bps = uint16(v)
			}
		}
		if bps == 0 {
			bps = 10_000
		}
		proceeds := p.Proceeds
		if proceeds == 0 && svc.GMGN != nil && svc.GMGN.Enabled() && p.InputMint != "" {
			base := p.BaseAmount
			if base == 0 {
				base = p.Amount
			}
			if base > 0 {
				if q, err := svc.GMGN.QuoteWithSOL(ctx, p.InputMint); err == nil {
					if lamports, _, err := gmgn.ProceedsLamports(q, base, bps); err == nil {
						proceeds = lamports
						_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{
							"proceeds":       proceeds,
							"proceedsSource": "market",
							"priceUsd":       q.PriceUSD,
							"solPriceUsd":    q.SOLPriceUSD,
						})
					}
				}
			}
		}
		prep, err := b.ExitPosition(txprep.ExitPositionParams{
			Strategist: stPK, Vault: vault, VaultTokenAccount: vta, OutputTokenAccount: outATA,
			PositionID: p.PositionID, Proceeds: proceeds, ReduceBps: bps,
			PriorityFeeMicro: p.PriorityFeeMicro, ComputeUnitLimit: p.ComputeUnitLimit,
		})
		return prep, prep.SignerDetails, err
	case "open_position":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		tradeID, posID, err := svc.resolveOpenTradeID(ctx, b, vault, p, job)
		if err != nil {
			return nil, nil, err
		}
		prep, err := b.OpenPosition(txprep.OpenPositionParams{
			Strategist: stPK, Vault: vault, TradeID: tradeID, PositionID: posID,
			EntryValue: p.EntryValue, OutputAmount: p.OutputAmount,
			PriorityFeeMicro: p.PriorityFeeMicro, ComputeUnitLimit: p.ComputeUnitLimit,
		})
		return prep, prep.SignerDetails, err
	case "close_position":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		vta, err := svc.resolveVTA(ctx, p, job)
		if err != nil {
			return nil, nil, err
		}
		outATA := vta
		if p.OutputTokenAccount != "" {
			outATA, err = s.ParsePK(p.OutputTokenAccount)
			if err != nil {
				return nil, nil, err
			}
		} else if p.OutputMint != "" {
			mint, err := s.ParsePK(p.OutputMint)
			if err != nil {
				return nil, nil, err
			}
			outATA = s.ATA(mint, vault)
		}
		posID := p.PositionID
		if posID == 0 {
			posID = p.TradeID
		}
		proceeds := p.Proceeds
		if proceeds == 0 && svc.GMGN != nil && svc.GMGN.Enabled() && p.OutputMint != "" {
			base := p.BaseAmount
			if base == 0 {
				base = p.OutputAmount
			}
			if base == 0 {
				base = p.Amount
			}
			if base > 0 {
				if q, err := svc.GMGN.QuoteWithSOL(ctx, p.OutputMint); err == nil {
					if lamports, _, err := gmgn.ProceedsLamports(q, base, 10_000); err == nil {
						proceeds = lamports
					}
				}
			}
		}
		prep, err := b.ClosePosition(stPK, vault, vta, outATA, posID, proceeds)
		return prep, prep.SignerDetails, err
	case "accrue_fees":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		prep, err := b.AccrueFees(stPK, vault)
		return prep, prep.SignerDetails, err
	case "claim_fees":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		vta, err := svc.resolveVTA(ctx, p, job)
		if err != nil {
			return nil, nil, err
		}
		fee := s.MustPK(svc.Cfg.DegenFeeWallet)
		if p.FeeWallet != "" {
			fee, _ = s.ParsePK(p.FeeWallet)
		}
		prep, err := b.ClaimFees(stPK, vault, vta, fee)
		return prep, prep.SignerDetails, err
	case "initiate_close":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		prep, err := b.InitiateVaultClose(stPK, vault)
		return prep, prep.SignerDetails, err
	case "close_vault":
		vault, err := svc.resolveVault(p, job)
		if err != nil {
			return nil, nil, err
		}
		vta, err := svc.resolveVTA(ctx, p, job)
		if err != nil {
			return nil, nil, err
		}
		holders := p.Holders
		if len(holders) == 0 {
			rows, _ := svc.Store.Holdings(ctx, vault.String())
			for _, r := range rows {
				holders = append(holders, r.Investor)
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
		prep, err := b.CloseVault(stPK, vault, vta, metas)
		return prep, prep.SignerDetails, err
	case "unlock_license":
		prep, err := b.UnlockLicense(stPK)
		return prep, prep.SignerDetails, err
	default:
		return nil, nil, fmt.Errorf("unknown step %s", st.Name)
	}
}

// resolveExecuteTokenAccounts maps buy/sell mints to vault ATAs for direct execute_trade.
// Buy: input=wSOL vault ATA (VTA), output=ATA(outputMint, vault)
// Sell: input=ATA(inputMint, vault), output=wSOL VTA (or OutputMint ATA)
func resolveExecuteTokenAccounts(p StartParams, vault, vta solana.PublicKey) (inTok, outTok solana.PublicKey, err error) {
	if p.VaultInputToken != "" {
		inTok, err = s.ParsePK(p.VaultInputToken)
		if err != nil {
			return
		}
	}
	if p.VaultOutputToken != "" {
		outTok, err = s.ParsePK(p.VaultOutputToken)
		if err != nil {
			return
		}
	}
	if !inTok.IsZero() && !outTok.IsZero() {
		return inTok, outTok, nil
	}
	// Prefer sell layout when InputMint set (exit-position); else buy layout (open-position).
	if p.InputMint != "" {
		mint, e := s.ParsePK(p.InputMint)
		if e != nil {
			return solana.PublicKey{}, solana.PublicKey{}, e
		}
		if inTok.IsZero() {
			inTok = s.ATA(mint, vault)
		}
		if outTok.IsZero() {
			if p.OutputMint != "" {
				om, e := s.ParsePK(p.OutputMint)
				if e != nil {
					return solana.PublicKey{}, solana.PublicKey{}, e
				}
				outTok = s.ATA(om, vault)
			} else {
				outTok = vta
			}
		}
		return inTok, outTok, nil
	}
	if p.OutputMint == "" {
		return solana.PublicKey{}, solana.PublicKey{}, fmt.Errorf("outputMint or vaultInputToken/vaultOutputToken required for execute_trade")
	}
	om, e := s.ParsePK(p.OutputMint)
	if e != nil {
		return solana.PublicKey{}, solana.PublicKey{}, e
	}
	if inTok.IsZero() {
		inTok = vta
	}
	if outTok.IsZero() {
		outTok = s.ATA(om, vault)
	}
	return inTok, outTok, nil
}

func boolPtr(v bool) *bool { return &v }

func ephemeralKinds(job *Job, signers []string) map[string]signing.SignerKind {
	kinds := map[string]signing.SignerKind{}
	if job == nil || job.Context == nil {
		return kinds
	}
	vta, _ := job.Context["vaultTokenAccount"].(string)
	if vta == "" {
		return kinds
	}
	for _, pk := range signers {
		if pk == vta {
			kinds[pk] = signing.KindEphemeral
		}
	}
	return kinds
}

func (svc *Service) Submit(ctx context.Context, id uuid.UUID, signedB64 string) (*Job, error) {
	job, err := svc.Store.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if job.Status != StatusAwaitingSignature && job.Status != StatusConfirming {
		return nil, fmt.Errorf("flow not awaiting signature (status=%s)", job.Status)
	}
	var cur *Step
	for i := range job.Steps {
		if job.Steps[i].Seq == job.CurrentStep && (job.Steps[i].Status == StepAwaitingSignature || job.Steps[i].Status == StepPending) {
			cur = &job.Steps[i]
			break
		}
	}
	if cur == nil {
		return nil, fmt.Errorf("no awaiting step")
	}
	var prep txprep.Prepared
	if len(cur.Prepared) > 0 {
		_ = json.Unmarshal(cur.Prepared, &prep)
	}
	details := prep.SignerDetails
	if len(details) == 0 {
		details = cur.SignerDetails
	}
	if len(details) == 0 && len(prep.Signers) > 0 {
		details = signing.DetailsForSigners(prep.Signers, ephemeralKinds(job, prep.Signers))
	}
	keys, err := svc.serverKeys(job, cur.ID, details)
	if err != nil {
		return nil, err
	}
	raw, err := txprep.DecodeSignedTx(signedB64)
	if err != nil {
		return nil, fmt.Errorf("invalid base64 transaction")
	}
	if len(details) > 0 {
		raw, err = signing.MergePartial(raw, details, keys)
		if err != nil {
			return nil, err
		}
	}
	rpc := txprep.NewRPC(svc.Cfg.RPCURL)
	sig, err := rpc.SendRaw(raw)
	if err != nil {
		_ = svc.Store.MarkStepFailed(ctx, cur.ID, err.Error())
		_ = svc.Store.SetJobStatus(ctx, id, StatusFailed, strPtr(err.Error()))
		return nil, err
	}
	_ = svc.Store.MarkStepSubmitted(ctx, cur.ID, sig)
	_ = svc.Store.SetJobStatus(ctx, id, StatusConfirming, nil)
	svc.runConfirmAndAdvance(id, cur.ID, sig)
	return svc.Store.Get(ctx, id)
}

func (svc *Service) Cancel(ctx context.Context, id uuid.UUID) (*Job, error) {
	_ = svc.Store.SetJobStatus(ctx, id, StatusCancelled, strPtr("cancelled by client"))
	return svc.Store.Get(ctx, id)
}

// Retry resets failed step(s) on a failed flow and advances from the first pending step.
func (svc *Service) Retry(ctx context.Context, id uuid.UUID) (*Job, error) {
	job, err := svc.Store.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if job.Status != StatusFailed {
		return nil, fmt.Errorf("flow status is %q, not failed", job.Status)
	}
	for _, st := range job.Steps {
		if st.Status == StepFailed {
			if err := svc.Store.ResetStep(ctx, st.ID); err != nil {
				return nil, err
			}
		}
	}
	if err := svc.Store.SetJobStatus(ctx, id, StatusPending, nil); err != nil {
		return nil, err
	}
	if err := svc.AdvanceToReady(ctx, id); err != nil {
		return nil, err
	}
	return svc.Store.Get(ctx, id)
}

// RefreshPrepared rebuilds the current awaiting step with a fresh recentBlockhash.
// Call immediately before client sign+submit to avoid BlockhashNotFound.
func (svc *Service) RefreshPrepared(ctx context.Context, id uuid.UUID) (*Job, error) {
	job, err := svc.Store.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if job.Status != StatusAwaitingSignature {
		return nil, fmt.Errorf("flow not awaiting signature (status=%s)", job.Status)
	}
	var cur *Step
	for i := range job.Steps {
		if job.Steps[i].Seq == job.CurrentStep && job.Steps[i].Status == StepAwaitingSignature {
			cur = &job.Steps[i]
			break
		}
	}
	if cur == nil {
		return nil, fmt.Errorf("no awaiting step")
	}
	params, err := ParseParams(job.Params)
	if err != nil {
		return nil, err
	}
	b := svc.builder()
	prep, details, err := svc.prepareStep(ctx, b, params, job, *cur)
	if err != nil {
		return nil, fmt.Errorf("refresh prepare: %w", err)
	}
	signerPKs := make([]string, 0, len(details))
	for _, d := range details {
		signerPKs = append(signerPKs, d.Pubkey)
	}
	if err := svc.Store.MarkStepAwaiting(ctx, cur.ID, prep, signerPKs, details); err != nil {
		return nil, err
	}
	return svc.Store.Get(ctx, id)
}
