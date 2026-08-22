package wallets

import (
	"context"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// VaultIndex is an in-memory set of known vault pubkeys (refreshed periodically).
type VaultIndex struct {
	mu   sync.RWMutex
	set  map[string]struct{}
	pool *pgxpool.Pool
	ok   atomic.Bool
}

func NewVaultIndex(pool *pgxpool.Pool) *VaultIndex {
	idx := &VaultIndex{set: map[string]struct{}{}, pool: pool}
	if pool != nil {
		_ = idx.Refresh(context.Background())
		go idx.loop()
	}
	return idx
}

func (idx *VaultIndex) loop() {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for range t.C {
		_ = idx.Refresh(context.Background())
	}
}

func (idx *VaultIndex) Refresh(ctx context.Context) error {
	if idx == nil || idx.pool == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	rows, err := idx.pool.Query(ctx, `SELECT pubkey FROM vaults`)
	if err != nil {
		return err
	}
	defer rows.Close()
	next := make(map[string]struct{}, 256)
	for rows.Next() {
		var pk string
		if err := rows.Scan(&pk); err != nil {
			return err
		}
		next[pk] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	idx.mu.Lock()
	idx.set = next
	idx.mu.Unlock()
	idx.ok.Store(true)
	return nil
}

func (idx *VaultIndex) Has(pubkey string) bool {
	if idx == nil {
		return false
	}
	idx.mu.RLock()
	_, ok := idx.set[pubkey]
	idx.mu.RUnlock()
	return ok
}

func (idx *VaultIndex) Ready() bool { return idx != nil && idx.ok.Load() }

// Global optional index wired by handlers.NewAPI.
var DefaultIndex *VaultIndex
