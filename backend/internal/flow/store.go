package flow

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/1vault/backend/internal/signing"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	Pool *pgxpool.Pool
}

func (s *Store) InsertJob(ctx context.Context, cluster string, mode Mode, actor string, params StartParams, steps []plannedStep) (*Job, error) {
	raw, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	ctxMap := map[string]any{
		"vault":             params.Vault,
		"vaultId":           params.VaultID,
		"vaultTokenAccount": params.VaultTokenAccount,
		"strategist":        params.Strategist,
		"tradeId":           params.TradeID,
		"positionId":        params.PositionID,
	}
	ctxRaw, _ := json.Marshal(ctxMap)

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var id uuid.UUID
	err = tx.QueryRow(ctx, `
		INSERT INTO flow_jobs (cluster, mode, status, actor_pubkey, params, context, current_step)
		VALUES ($1,$2,'pending',$3,$4,$5,0) RETURNING id`,
		cluster, string(mode), actor, raw, ctxRaw,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	for i, st := range steps {
		meta, _ := json.Marshal(st.Meta)
		if meta == nil {
			meta = []byte("{}")
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO flow_steps (flow_id, seq, name, signer_role, signer_pubkey, status, meta)
			VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
			id, i, st.Name, st.SignerRole, nullIfEmpty(st.SignerPubkey), meta,
		)
		if err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.Get(ctx, id)
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func (s *Store) Get(ctx context.Context, id uuid.UUID) (*Job, error) {
	job := &Job{Context: map[string]any{}}
	var params []byte
	var contextRaw []byte
	var errMsg *string
	err := s.Pool.QueryRow(ctx, `
		SELECT id, cluster, mode, status, COALESCE(actor_pubkey,''), params, context, error, current_step, created_at, updated_at
		FROM flow_jobs WHERE id=$1`, id,
	).Scan(&job.ID, &job.Cluster, &job.Mode, &job.Status, &job.ActorPubkey, &params, &contextRaw, &errMsg, &job.CurrentStep, &job.CreatedAt, &job.UpdatedAt)
	if err != nil {
		return nil, err
	}
	job.Params = params
	job.Error = errMsg
	_ = json.Unmarshal(contextRaw, &job.Context)

	rows, err := s.Pool.Query(ctx, `
		SELECT id, flow_id, seq, name, signer_role, COALESCE(signer_pubkey,''), status, prepared, required_signers, signature, error, created_at, updated_at
		FROM flow_steps WHERE flow_id=$1 ORDER BY seq ASC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var st Step
		var prep []byte
		var sig, serr *string
		var signers []string
		if err := rows.Scan(&st.ID, &st.FlowID, &st.Seq, &st.Name, &st.SignerRole, &st.SignerPubkey, &st.Status, &prep, &signers, &sig, &serr, &st.CreatedAt, &st.UpdatedAt); err != nil {
			return nil, err
		}
		st.Prepared = prep
		st.RequiredSigners = signers
		st.Signature = sig
		st.Error = serr
		if len(prep) > 0 {
			var p struct {
				SignerDetails []signing.Detail `json:"signerDetails"`
			}
			if json.Unmarshal(prep, &p) == nil && len(p.SignerDetails) > 0 {
				st.SignerDetails = p.SignerDetails
			}
		}
		job.Steps = append(job.Steps, st)
	}
	return job, rows.Err()
}

func (s *Store) List(ctx context.Context, cluster, actor, investor, status string, limit int) ([]Job, error) {
	if limit < 1 || limit > 100 {
		limit = 20
	}
	q := `SELECT id FROM flow_jobs WHERE cluster=$1`
	args := []any{cluster}
	n := 2
	if actor != "" {
		q += fmt.Sprintf(` AND actor_pubkey=$%d`, n)
		args = append(args, actor)
		n++
	}
	if investor != "" {
		q += fmt.Sprintf(` AND params->'investors' @> jsonb_build_array(jsonb_build_object('pubkey', $%d::text))`, n)
		args = append(args, investor)
		n++
	}
	if status != "" {
		q += fmt.Sprintf(` AND status=$%d`, n)
		args = append(args, status)
		n++
	}
	q += fmt.Sprintf(` ORDER BY created_at DESC LIMIT $%d`, n)
	args = append(args, limit)
	rows, err := s.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return []Job{}, nil
	}
	out := make([]Job, 0, len(ids))
	byID := make(map[uuid.UUID]*Job, len(ids))
	jrows, err := s.Pool.Query(ctx, `
		SELECT id, cluster, mode, status, COALESCE(actor_pubkey,''), params, context, error, current_step, created_at, updated_at
		FROM flow_jobs WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, err
	}
	defer jrows.Close()
	for jrows.Next() {
		job := &Job{Context: map[string]any{}}
		var params []byte
		var contextRaw []byte
		var errMsg *string
		if err := jrows.Scan(&job.ID, &job.Cluster, &job.Mode, &job.Status, &job.ActorPubkey, &params, &contextRaw, &errMsg, &job.CurrentStep, &job.CreatedAt, &job.UpdatedAt); err != nil {
			return nil, err
		}
		job.Params = params
		job.Error = errMsg
		_ = json.Unmarshal(contextRaw, &job.Context)
		byID[job.ID] = job
	}
	if err := jrows.Err(); err != nil {
		return nil, err
	}
	srows, err := s.Pool.Query(ctx, `
		SELECT id, flow_id, seq, name, signer_role, COALESCE(signer_pubkey,''), status, prepared, required_signers, signature, error, created_at, updated_at
		FROM flow_steps WHERE flow_id = ANY($1) ORDER BY flow_id, seq ASC`, ids)
	if err != nil {
		return nil, err
	}
	defer srows.Close()
	for srows.Next() {
		var st Step
		var prep []byte
		var sig, serr *string
		var signers []string
		if err := srows.Scan(&st.ID, &st.FlowID, &st.Seq, &st.Name, &st.SignerRole, &st.SignerPubkey, &st.Status, &prep, &signers, &sig, &serr, &st.CreatedAt, &st.UpdatedAt); err != nil {
			return nil, err
		}
		st.Prepared = prep
		st.RequiredSigners = signers
		st.Signature = sig
		st.Error = serr
		if job := byID[st.FlowID]; job != nil {
			job.Steps = append(job.Steps, st)
		}
	}
	if err := srows.Err(); err != nil {
		return nil, err
	}
	for _, id := range ids {
		if j := byID[id]; j != nil {
			out = append(out, *j)
		}
	}
	return out, nil
}

func (s *Store) SetJobStatus(ctx context.Context, id uuid.UUID, status JobStatus, errMsg *string) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE flow_jobs SET status=$2, error=$3, updated_at=NOW() WHERE id=$1`, id, string(status), errMsg)
	return err
}

func (s *Store) SetCurrentStep(ctx context.Context, id uuid.UUID, seq int) error {
	_, err := s.Pool.Exec(ctx, `UPDATE flow_jobs SET current_step=$2, updated_at=NOW() WHERE id=$1`, id, seq)
	return err
}

func (s *Store) MergeContext(ctx context.Context, id uuid.UUID, patch map[string]any) error {
	raw, _ := json.Marshal(patch)
	_, err := s.Pool.Exec(ctx, `
		UPDATE flow_jobs SET context = context || $2::jsonb, updated_at=NOW() WHERE id=$1`, id, raw)
	return err
}

func (s *Store) MarkStepAwaiting(ctx context.Context, stepID uuid.UUID, prepared any, signers []string, details []signing.Detail) error {
	raw, err := json.Marshal(prepared)
	if err != nil {
		return err
	}
	if len(details) > 0 {
		meta, _ := json.Marshal(map[string]any{"signerDetails": details})
		_, _ = s.Pool.Exec(ctx, `
			UPDATE flow_steps SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb WHERE id=$1`, stepID, meta)
	}
	_, err = s.Pool.Exec(ctx, `
		UPDATE flow_steps SET status='awaiting_signature', prepared=$2, required_signers=$3, updated_at=NOW()
		WHERE id=$1`, stepID, raw, signers)
	return err
}

func (s *Store) MergeStepMeta(ctx context.Context, stepID uuid.UUID, patch map[string]any) error {
	raw, _ := json.Marshal(patch)
	_, err := s.Pool.Exec(ctx, `
		UPDATE flow_steps SET meta = COALESCE(meta, '{}'::jsonb) || $2::jsonb, updated_at=NOW()
		WHERE id=$1`, stepID, raw)
	return err
}

func (s *Store) MarkStepSkipped(ctx context.Context, stepID uuid.UUID, reason string) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE flow_steps SET status='skipped', error=$2, updated_at=NOW() WHERE id=$1`, stepID, reason)
	return err
}

func (s *Store) MarkStepSubmitted(ctx context.Context, stepID uuid.UUID, signature string) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE flow_steps SET status='submitted', signature=$2, updated_at=NOW() WHERE id=$1`, stepID, signature)
	return err
}

func (s *Store) MarkStepConfirmed(ctx context.Context, stepID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE flow_steps SET status='confirmed', updated_at=NOW() WHERE id=$1`, stepID)
	return err
}

func (s *Store) MarkStepFailed(ctx context.Context, stepID uuid.UUID, msg string) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE flow_steps SET status='failed', error=$2, updated_at=NOW() WHERE id=$1`, stepID, msg)
	return err
}

func (s *Store) ResetStep(ctx context.Context, stepID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `
		UPDATE flow_steps SET status='pending', error=NULL, prepared=NULL, signature=NULL, updated_at=NOW()
		WHERE id=$1`, stepID)
	return err
}

func (s *Store) GetStepMeta(ctx context.Context, stepID uuid.UUID) (map[string]any, error) {
	var raw []byte
	err := s.Pool.QueryRow(ctx, `SELECT COALESCE(meta, '{}'::jsonb) FROM flow_steps WHERE id=$1`, stepID).Scan(&raw)
	if err != nil {
		return nil, err
	}
	out := map[string]any{}
	_ = json.Unmarshal(raw, &out)
	return out, nil
}

func (s *Store) Holdings(ctx context.Context, vault string) ([]struct{ Investor string }, error) {
	rows, err := s.Pool.Query(ctx, `
		SELECT investor FROM vault_holdings WHERE vault=$1 AND shares::numeric > 0`, vault)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []struct{ Investor string }
	for rows.Next() {
		var inv string
		if err := rows.Scan(&inv); err != nil {
			return nil, err
		}
		out = append(out, struct{ Investor string }{inv})
	}
	return out, rows.Err()
}

func ParseParams(raw json.RawMessage) (StartParams, error) {
	var p StartParams
	err := json.Unmarshal(raw, &p)
	return p, err
}

func ErrNoRows(err error) bool {
	return err == pgx.ErrNoRows
}

func Now() time.Time { return time.Now().UTC() }
