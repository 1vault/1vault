package wallets

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Kind distinguishes vault PDAs from personal wallets.
type Kind string

const (
	KindEOA Kind = "eoa" // individual / personal wallet
	KindPDA Kind = "pda" // vault wallet (program-derived)
)

func (k Kind) Valid() bool {
	return k == KindEOA || k == KindPDA
}

func (k Kind) Label() string {
	switch k {
	case KindPDA:
		return "vault"
	case KindEOA:
		return "individual"
	default:
		return ""
	}
}

func (k Kind) Description() string {
	switch k {
	case KindPDA:
		return "Vault wallet (PDA)"
	case KindEOA:
		return "Individual wallet (EOA)"
	default:
		return ""
	}
}

// Parse accepts eoa|pda|individual|personal|vault (case-insensitive).
func Parse(raw string) (Kind, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "eoa", "individual", "personal", "user":
		return KindEOA, true
	case "pda", "vault":
		return KindPDA, true
	default:
		return "", false
	}
}

// Resolve picks an explicit kind when provided; otherwise classifies from the vaults table.
func Resolve(ctx context.Context, pool *pgxpool.Pool, address, explicit string) Kind {
	if k, ok := Parse(explicit); ok {
		return k
	}
	return Classify(ctx, pool, address)
}

// Classify returns pda when address is a known vault pubkey, otherwise eoa.
// Prefers in-memory VaultIndex (0 DB RTT) when ready.
func Classify(ctx context.Context, pool *pgxpool.Pool, address string) Kind {
	address = strings.TrimSpace(address)
	if address == "" {
		return KindEOA
	}
	if DefaultIndex != nil && DefaultIndex.Ready() {
		if DefaultIndex.Has(address) {
			return KindPDA
		}
		return KindEOA
	}
	if pool == nil {
		return KindEOA
	}
	var n int
	err := pool.QueryRow(ctx, `SELECT 1 FROM vaults WHERE pubkey=$1 LIMIT 1`, address).Scan(&n)
	if err == nil && n == 1 {
		return KindPDA
	}
	return KindEOA
}

// Meta is the JSON object attached to wallet API responses.
func Meta(kind Kind) map[string]any {
	return map[string]any{
		"walletKind":        string(kind),
		"walletKindLabel":   kind.Label(),
		"walletKindMeaning": kind.Description(),
	}
}

// ResolveMany classifies addresses in one DB round-trip (or memory index).
func ResolveMany(ctx context.Context, pool *pgxpool.Pool, addresses []string, overrides map[string]string) map[string]Kind {
	out := make(map[string]Kind, len(addresses))
	need := make([]string, 0, len(addresses))
	for _, addr := range addresses {
		addr = strings.TrimSpace(addr)
		if addr == "" {
			continue
		}
		if overrides != nil {
			if k, ok := Parse(overrides[addr]); ok {
				out[addr] = k
				continue
			}
		}
		if DefaultIndex != nil && DefaultIndex.Ready() {
			if DefaultIndex.Has(addr) {
				out[addr] = KindPDA
			} else {
				out[addr] = KindEOA
			}
			continue
		}
		need = append(need, addr)
		out[addr] = KindEOA // default until batch marks pda
	}
	if len(need) == 0 || pool == nil {
		return out
	}
	rows, err := pool.Query(ctx, `SELECT pubkey FROM vaults WHERE pubkey = ANY($1)`, need)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var pk string
		if rows.Scan(&pk) == nil {
			out[pk] = KindPDA
		}
	}
	return out
}

// MetaMap converts kinds to string map for JSON.
func MetaMap(kinds map[string]Kind) map[string]string {
	out := make(map[string]string, len(kinds))
	for addr, k := range kinds {
		out[addr] = string(k)
	}
	return out
}
