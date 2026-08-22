package signing

import (
	"strings"

	"github.com/gagliardetto/solana-go"
)

func LoadKeeperKey(raw string) (solana.PrivateKey, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	return solana.PrivateKeyFromBase58(raw)
}
