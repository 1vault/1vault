package solana_test

import (
	"testing"

	s "github.com/1vault/backend/internal/solana"
	"github.com/gagliardetto/solana-go"
)

func TestDecodeProtocolTradePrograms(t *testing.T) {
	data := make([]byte, 400)
	copy(data[0:8], []byte{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08})
	o := 8 + 32*3 + 8 + 2 + 1
	data[o] = 2
	o++
	jup := s.MustPK("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4")
	ray := s.MustPK("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8")
	copy(data[o:o+32], jup[:])
	copy(data[o+32:o+64], ray[:])
	o += 32 * 5
	data[o] = 0

	dex, lp, err := s.DecodeProtocolTradePrograms(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(lp) != 0 {
		t.Fatalf("launchpad=%d", len(lp))
	}
	if len(dex) != 2 || dex[0] != jup || dex[1] != ray {
		t.Fatalf("dex=%v", dex)
	}
	_ = solana.PublicKey{}
}
