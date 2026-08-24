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

func TestValidateVaultAccountData(t *testing.T) {
	pk := s.MustPK("EQdTAMuM4ufZS8zcaYpgobCrWD94cpj19eeJ2e3Ym7nw")

	if err := s.ValidateVaultAccountData(pk, nil); err == nil {
		t.Fatal("expected error for empty")
	}

	legacy := make([]byte, 594)
	copy(legacy[0:8], []byte{0xd3, 0x08, 0xe8, 0x2b, 0x02, 0x98, 0x75, 0x77})
	if err := s.ValidateVaultAccountData(pk, legacy); err == nil {
		t.Fatal("expected legacy size rejection")
	}

	ok := make([]byte, s.CurrentVaultAccountLen)
	copy(ok[0:8], []byte{0xd3, 0x08, 0xe8, 0x2b, 0x02, 0x98, 0x75, 0x77})
	// name len=1 "X" at 48; description len=0
	ok[48] = 1
	ok[52] = 'X'
	// After fixed fields to perf: see DecodeVaultTokenAccount offsets with short strings.
	// name ends at 53; desc len at 53..57 (=0); base at 57; count 89; mints 90; share 250; vta 282;
	// totals 314..346; perf at 346; book 348; early 349; status 351
	// With name len=1: o after name = 8+32+8+4+1 = 53; desc 53+4=57; +32=89; +1=90; +160=250; +32=282; +32=314; +32=346
	ok[348] = 0 // book_mode pooled
	ok[351] = 0 // status active
	if err := s.ValidateVaultAccountData(pk, ok); err != nil {
		t.Fatalf("current layout should pass: %v", err)
	}

	ok[348] = 96
	if err := s.ValidateVaultAccountData(pk, ok); err == nil {
		t.Fatal("invalid book_mode should fail")
	}
}
