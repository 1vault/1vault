package vaults

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Type is the product vault classification (on-chain book mode + API/DB metadata).
type Type string

const (
	TypePooled Type = "pooled"
	TypeSliced Type = "sliced"
)

func (t Type) Valid() bool {
	return t == TypePooled || t == TypeSliced
}

func (t Type) Label() string {
	switch t {
	case TypeSliced:
		return "Sliced Vault"
	default:
		return "Pooled Vault"
	}
}

func (t Type) Meaning() string {
	switch t {
	case TypeSliced:
		return "Capital is split into slices that can use different strategies, risk levels, or exposure. Risk on one slice can be more isolated from other slices."
	default:
		return "All investor capital is combined in one pool and run with the same strategy. Profit and loss are shared by each investor's ownership share."
	}
}

// Parse accepts pooled|sliced (case-insensitive) and common aliases.
func Parse(raw string) (Type, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case string(TypePooled), "pooled_vault", "pool":
		return TypePooled, true
	case string(TypeSliced), "sliced_vault", "slice":
		return TypeSliced, true
	default:
		return "", false
	}
}

func Default() Type { return TypePooled }

// Meta is the JSON object attached to vault API responses.
func Meta(t Type) map[string]any {
	if !t.Valid() {
		t = Default()
	}
	return map[string]any{
		"vaultType":        string(t),
		"vaultTypeLabel":   t.Label(),
		"vaultTypeMeaning": t.Meaning(),
	}
}

// Attach merges vaultType fields into an existing map.
func Attach(payload map[string]any, t Type) map[string]any {
	if payload == nil {
		payload = map[string]any{}
	}
	for k, v := range Meta(t) {
		payload[k] = v
	}
	return payload
}

// Resolve picks explicit type when provided; otherwise registry → vaults.vault_type → pooled.
func Resolve(ctx context.Context, pool *pgxpool.Pool, vaultPubkey, explicit string) Type {
	if t, ok := Parse(explicit); ok {
		return t
	}
	return Classify(ctx, pool, vaultPubkey)
}

// Classify loads type from registry, then vaults column, else pooled (single round-trip).
func Classify(ctx context.Context, pool *pgxpool.Pool, vaultPubkey string) Type {
	vaultPubkey = strings.TrimSpace(vaultPubkey)
	if vaultPubkey == "" || pool == nil {
		return Default()
	}
	var raw string
	err := pool.QueryRow(ctx, `
		SELECT COALESCE(
			(SELECT vault_type FROM vault_type_registry WHERE vault_pubkey=$1 LIMIT 1),
			(SELECT vault_type FROM vaults WHERE pubkey=$1 LIMIT 1),
			'pooled'
		)`, vaultPubkey).Scan(&raw)
	if err == nil {
		if t, ok := Parse(raw); ok {
			return t
		}
	}
	return Default()
}

// FromResolved parses a SQL COALESCE(registry, column, 'pooled') value.
func FromResolved(raw string) Type {
	if t, ok := Parse(raw); ok {
		return t
	}
	return Default()
}

// UpsertRegistry stores type for a vault PDA and syncs vaults.vault_type when the row exists.
func UpsertRegistry(ctx context.Context, pool *pgxpool.Pool, vaultPubkey, strategist string, vaultID uint64, t Type) error {
	if pool == nil {
		return nil
	}
	if !t.Valid() {
		t = Default()
	}
	vaultPubkey = strings.TrimSpace(vaultPubkey)
	if vaultPubkey == "" {
		return nil
	}
	_, err := pool.Exec(ctx, `
		INSERT INTO vault_type_registry (vault_pubkey, strategist, vault_id, vault_type, updated_at)
		VALUES ($1,$2,$3,$4,NOW())
		ON CONFLICT (vault_pubkey) DO UPDATE SET
			strategist=EXCLUDED.strategist,
			vault_id=EXCLUDED.vault_id,
			vault_type=EXCLUDED.vault_type,
			updated_at=NOW()`,
		vaultPubkey, nullIfEmpty(strategist), nullIfZero(vaultID), string(t))
	if err != nil {
		return err
	}
	_, _ = pool.Exec(ctx, `UPDATE vaults SET vault_type=$2 WHERE pubkey=$1`, vaultPubkey, string(t))
	return nil
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func nullIfZero(n uint64) any {
	if n == 0 {
		return nil
	}
	return int64(n)
}
