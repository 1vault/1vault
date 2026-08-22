package solana_test

import (
	"testing"

	s "github.com/1vault/backend/internal/solana"
)

func TestDecodeVaultTokenAccount(t *testing.T) {
	// Minimal synthetic Vault layout (disc + fields through vault_token_account).
	data := make([]byte, 400)
	copy(data[0:8], []byte{0xd3, 0x08, 0xe8, 0x2b, 0x02, 0x98, 0x75, 0x77})
	// strategist (32) + vault_id (8) at offset 8..48
	// name: len=1 "X"
	data[48] = 1
	data[52] = 'X'
	// description: len=0
	// base_mint at 57..89 (zeros ok)
	// accepted_mint_count = 0 at 89
	// 5 mints at 90..250, share_mint at 250..282
	want := s.MustPK("EQdTAMuM4ufZS8zcaYpgobCrWD94cpj19eeJ2e3Ym7nw")
	copy(data[282:314], want[:])

	got, err := s.DecodeVaultTokenAccount(data)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("got %s want %s", got, want)
	}
}

func TestDecodeVaultNextIDs(t *testing.T) {
	data := make([]byte, 420)
	copy(data[0:8], []byte{0xd3, 0x08, 0xe8, 0x2b, 0x02, 0x98, 0x75, 0x77})
	data[48] = 1
	data[52] = 'X'
	// description len=0; next_trade_id at byte 356, next_position_id at 364
	data[356] = 2
	data[364] = 1

	trade, pos, err := s.DecodeVaultNextIDs(data)
	if err != nil {
		t.Fatal(err)
	}
	if trade != 2 || pos != 1 {
		t.Fatalf("trade=%d pos=%d want 2,1", trade, pos)
	}
}
