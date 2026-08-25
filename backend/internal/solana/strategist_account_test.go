package solana_test

import (
	"encoding/binary"
	"testing"

	s "github.com/1vault/backend/internal/solana"
)

func TestDecodeStrategistActiveVaultCount(t *testing.T) {
	data := make([]byte, s.StrategistAccountLen)
	binary.LittleEndian.PutUint64(data[48:56], 2) // active_vault_count after disc+owner+vault_count
	data[56] = 1                                 // is_active

	n, err := s.DecodeStrategistActiveVaultCount(data)
	if err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Fatalf("got %d want 2", n)
	}
	active, err := s.DecodeStrategistLicenseActive(data)
	if err != nil {
		t.Fatal(err)
	}
	if !active {
		t.Fatal("expected license active")
	}
}
