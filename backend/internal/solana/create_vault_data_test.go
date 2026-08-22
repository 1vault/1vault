package solana_test

import (
	"encoding/hex"
	"testing"

	s "github.com/1vault/backend/internal/solana"
	"github.com/gagliardetto/solana-go"
)

func TestCreateVaultDataMatchesOnChain(t *testing.T) {
	// Deployed CreateVault layout (IDL in repo is stale): after performance_fee_bps
	// comes book mode enum as u8 + u16 (pooled=0/0, sliced demos=1/1000), then VaultRiskParams.
	want, err := hex.DecodeString(
		"1dedf7d0c15236870c000000000000000c0000004c6976652044656d6f203132d00700000012000000315661756c7420706f6f6c656420626f6f6b640001000000069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001",
	)
	if err != nil {
		t.Fatal(err)
	}
	data := s.Concat(
		s.DiscCreateVault,
		s.U64LE(12),
		s.EncodeString("Live Demo 12"),
		s.U16LE(2000),
		s.U8(0), // pooled
		s.U16LE(0),
		s.EncodeString("1Vault pooled book"),
		s.U16LE(100),
		s.EncodePubkeyVec([]solana.PublicKey{s.WSOL}),
	)
	if hex.EncodeToString(data) != hex.EncodeToString(want) {
		t.Fatalf("mismatch\n got %x\nwant %x", data, want)
	}
}
