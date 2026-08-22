package solana_test

import (
	"fmt"
	"testing"

	s "github.com/1vault/backend/internal/solana"
	"github.com/gagliardetto/solana-go"
)

func TestDecodeTradeStatus(t *testing.T) {
	data := make([]byte, 200)
	data[177] = s.TradeStatusExecuted
	st, err := s.DecodeTradeStatus(data)
	if err != nil {
		t.Fatal(err)
	}
	if st != s.TradeStatusExecuted {
		t.Fatalf("status=%d want executed", st)
	}
}

func TestFindLatestExecutedTradeID(t *testing.T) {
	program := s.MustPK("2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP")
	vault := s.MustPK("rbkQXJ7p8vzjgun5yxGiet9e5wsenwQuzeVj4mUYMfH")
	accounts := map[uint64][]byte{
		2: makeTradeData(s.TradeStatusExecuted),
		3: makeTradeData(s.TradeStatusPending),
	}
	id, err := s.FindLatestExecutedTradeID(program, vault, 4, func(pk solana.PublicKey) ([]byte, error) {
		for tid, data := range accounts {
			if pk == s.TradePDA(program, vault, tid) {
				return data, nil
			}
		}
		return nil, fmt.Errorf("missing")
	})
	if err != nil {
		t.Fatal(err)
	}
	if id != 2 {
		t.Fatalf("id=%d want 2", id)
	}
}

func makeTradeData(status byte) []byte {
	d := make([]byte, 200)
	d[177] = status
	return d
}
