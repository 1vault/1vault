package flow

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/1vault/backend/internal/roles"
	"github.com/1vault/backend/internal/signing"
	s "github.com/1vault/backend/internal/solana"
	"github.com/1vault/backend/internal/txconfirm"
	"github.com/1vault/backend/internal/txprep"
	"github.com/gagliardetto/solana-go"
	"github.com/google/uuid"
)

func (svc *Service) confirmOpts() txconfirm.Options {
	auto := svc.Indexer != nil && svc.Indexer.Enabled()
	return txconfirm.Options{
		RPCURL:     svc.Cfg.RPCURL,
		Indexer:    svc.Indexer,
		AutoIngest: auto,
		OnConfirmed: func(_ string, _ txconfirm.IngestInfo) {
			if svc.OnIngest != nil {
				svc.OnIngest()
			}
		},
	}
}

func (svc *Service) serverKeys(job *Job, stepID uuid.UUID, details []signing.Detail) (map[string]solana.PrivateKey, error) {
	out := map[string]solana.PrivateKey{}
	if len(svc.Keeper) > 0 {
		out[svc.Keeper.PublicKey().String()] = svc.Keeper
	}
	loadSecret := func(sec string, pubkey string) error {
		if sec == "" || pubkey == "" {
			return nil
		}
		sk, err := solana.PrivateKeyFromBase58(sec)
		if err != nil {
			return err
		}
		if !sk.PublicKey().Equals(parsePub(pubkey)) {
			return fmt.Errorf("ephemeral secret does not match pubkey %s", pubkey)
		}
		out[pubkey] = sk
		return nil
	}
	meta, _ := svc.Store.GetStepMeta(context.Background(), stepID)
	if sec, ok := meta["ephemeralSecret"].(string); ok {
		for _, d := range details {
			if d.SignerKind == signing.KindEphemeral {
				if err := loadSecret(sec, d.Pubkey); err != nil {
					return nil, err
				}
			}
		}
	}
	if job != nil && job.Context != nil {
		sec, _ := job.Context["vaultTokenSecret"].(string)
		vta, _ := job.Context["vaultTokenAccount"].(string)
		if sec != "" && vta != "" {
			if err := loadSecret(sec, vta); err != nil {
				return nil, err
			}
		}
		for _, d := range details {
			if d.SignerKind == signing.KindEphemeral && d.Pubkey != "" {
				if sec != "" {
					if err := loadSecret(sec, d.Pubkey); err != nil {
						return nil, err
					}
				}
			}
		}
	}
	return out, nil
}

func parsePub(s string) solana.PublicKey {
	pk, err := solana.PublicKeyFromBase58(s)
	if err != nil {
		return solana.PublicKey{}
	}
	return pk
}

func (svc *Service) autoSubmitServerStep(flowID, stepID uuid.UUID, prep *txprep.Prepared, details []signing.Detail) {
	ctx := context.Background()
	keys, err := svc.serverKeys(&Job{Context: map[string]any{}}, stepID, details)
	if err != nil {
		_ = svc.Store.MarkStepFailed(ctx, stepID, err.Error())
		_ = svc.Store.SetJobStatus(ctx, flowID, StatusFailed, strPtr(err.Error()))
		return
	}
	job, _ := svc.Store.Get(ctx, flowID)
	if job != nil {
		keys, err = svc.serverKeys(job, stepID, details)
		if err != nil {
			_ = svc.Store.MarkStepFailed(ctx, stepID, err.Error())
			_ = svc.Store.SetJobStatus(ctx, flowID, StatusFailed, strPtr(err.Error()))
			return
		}
	}
	raw, err := base64.StdEncoding.DecodeString(prep.TransactionBase64)
	if err != nil {
		_ = svc.Store.MarkStepFailed(ctx, stepID, err.Error())
		return
	}
	raw, err = signing.SignFully(raw, keys)
	if err != nil {
		_ = svc.Store.MarkStepFailed(ctx, stepID, err.Error())
		_ = svc.Store.SetJobStatus(ctx, flowID, StatusFailed, strPtr(err.Error()))
		return
	}
	rpc := txprep.NewRPC(svc.Cfg.RPCURL)
	sig, err := rpc.SendRaw(raw)
	if err != nil {
		msg := s.FriendlyTxError(err)
		_ = svc.Store.MarkStepFailed(ctx, stepID, msg)
		_ = svc.Store.SetJobStatus(ctx, flowID, StatusFailed, strPtr(msg))
		return
	}
	_ = svc.Store.MarkStepSubmitted(ctx, stepID, sig)
	svc.runConfirmAndAdvance(flowID, stepID, sig)
}

func (svc *Service) recordDepositIntent(ctx context.Context, job *Job, inv InvestorIn, vault string, lamports uint64) (int, error) {
	role := roles.DBRetail
	if inv.Role != "" {
		if apiRole, ok := roles.ParseAPI(inv.Role); ok {
			role = roles.ToDB(apiRole)
		}
	}
	var id int
	err := svc.Pool.QueryRow(ctx, `
		INSERT INTO deposit_intents (cluster, vault, investor, role, amount, take_profit_bps, stop_loss_bps, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id`,
		job.Cluster, vault, inv.Pubkey, role, strconv.FormatUint(lamports, 10), inv.TakeProfitBps, inv.StopLossBps,
	).Scan(&id)
	return id, err
}

func (svc *Service) recordMandate(ctx context.Context, job *Job, inv InvestorIn, vault string) error {
	role := roles.DBRetail
	if inv.Role != "" {
		if apiRole, ok := roles.ParseAPI(inv.Role); ok {
			role = roles.ToDB(apiRole)
		}
	}
	af := true
	if inv.AutoFollow != nil {
		af = *inv.AutoFollow
	}
	tp, sl := 0, 0
	if inv.TakeProfitBps != nil {
		tp = int(*inv.TakeProfitBps)
	}
	if inv.StopLossBps != nil {
		sl = int(*inv.StopLossBps)
	}
	_, err := svc.Pool.Exec(ctx, `
		INSERT INTO investor_mandates (vault, investor, role, park_amount, take_profit_bps, stop_loss_bps, auto_follow, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
		ON CONFLICT (vault, investor) DO UPDATE SET
			role=EXCLUDED.role, park_amount=EXCLUDED.park_amount,
			take_profit_bps=EXCLUDED.take_profit_bps, stop_loss_bps=EXCLUDED.stop_loss_bps,
			auto_follow=EXCLUDED.auto_follow, updated_at=NOW()`,
		vault, inv.Pubkey, role, strconv.FormatUint(inv.Lamports, 10), tp, sl, af,
	)
	return err
}

func (svc *Service) afterStepConfirmed(ctx context.Context, job *Job, st Step, signature string) {
	meta, _ := svc.Store.GetStepMeta(ctx, st.ID)
	switch st.Name {
	case "park":
		if id := metaInt(meta, "depositIntentId"); id > 0 {
			_, _ = svc.Pool.Exec(ctx, `
				UPDATE deposit_intents SET status='submitted', signature=$2, updated_at=NOW()
				WHERE id=$1 AND status='pending'`, id, signature)
		}
	case "update_investor_config":
		params, _ := ParseParams(job.Params)
		inv := params.Investors[metaInt(meta, "i")]
		vault, err := svc.resolveVault(params, job)
		if err == nil {
			_ = svc.recordMandate(ctx, job, inv, vault.String())
		}
	case "request_trade":
		params, _ := ParseParams(job.Params)
		if id := resolveTradeID(params, job); id > 0 {
			_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{"tradeId": id})
		}
	case "execute_trade":
		params, _ := ParseParams(job.Params)
		id := tradeIDFromJobStep(job, "execute_trade", "request_trade")
		if id == 0 {
			id = resolveTradeID(params, job)
		}
		if id > 0 {
			_ = svc.Store.MergeContext(ctx, job.ID, map[string]any{
				"tradeId": id, "executedTradeId": id,
			})
		}
	}
}

func (svc *Service) runConfirmAndAdvance(flowID, stepID uuid.UUID, signature string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()
		res := txconfirm.ConfirmAndIngest(ctx, signature, svc.confirmOpts())
		if res.Status == "failed" || res.Status == "timeout" {
			msg := fmt.Sprintf("%v", res.Err)
			if msg == "<nil>" || msg == "" {
				msg = res.Status
			}
			msg = s.FriendlyTxError(fmt.Errorf("%s", msg))
			_ = svc.Store.MarkStepFailed(ctx, stepID, msg)
			_ = svc.Store.SetJobStatus(ctx, flowID, StatusFailed, strPtr(msg))
			return
		}
		_ = svc.Store.MarkStepConfirmed(ctx, stepID)
		if res.Ingest != nil {
			raw, _ := json.Marshal(res.Ingest)
			_ = svc.Store.MergeStepMeta(ctx, stepID, map[string]any{"ingest": json.RawMessage(raw)})
		}
		job, _ := svc.Store.Get(ctx, flowID)
		if job != nil {
			var st Step
			for _, s := range job.Steps {
				if s.ID == stepID {
					st = s
					break
				}
			}
			svc.afterStepConfirmed(ctx, job, st, signature)
		}
		_ = svc.AdvanceToReady(ctx, flowID)
	}()
}
