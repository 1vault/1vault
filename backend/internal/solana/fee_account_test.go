package solana_test

import (
	"encoding/binary"
	"testing"

	s "github.com/1vault/backend/internal/solana"
)

func TestDecodeVaultFeeClaimable(t *testing.T) {
	data := make([]byte, s.VaultFeeStateAccountLen)
	// disc + vault + strategist = 72 bytes; accrued @72, claimed @80
	binary.LittleEndian.PutUint64(data[72:80], 1_000)
	binary.LittleEndian.PutUint64(data[80:88], 250)

	got, err := s.DecodeVaultFeeClaimable(data)
	if err != nil {
		t.Fatal(err)
	}
	if got != 750 {
		t.Fatalf("got %d want 750", got)
	}

	binary.LittleEndian.PutUint64(data[80:88], 1_000)
	got, err = s.DecodeVaultFeeClaimable(data)
	if err != nil {
		t.Fatal(err)
	}
	if got != 0 {
		t.Fatalf("got %d want 0", got)
	}

	if _, err := s.DecodeVaultFeeClaimable(data[:10]); err == nil {
		t.Fatal("expected short account error")
	}
}
