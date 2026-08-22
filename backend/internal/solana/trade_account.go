package solana

import (
	"fmt"

	"github.com/gagliardetto/solana-go"
)

const (
	TradeStatusPending   = 0
	TradeStatusExecuted  = 1
	TradeStatusCancelled = 2
)

// DecodeTradeStatus reads TradeRequest.status (u8 enum) from on-chain account data.
func DecodeTradeStatus(data []byte) (uint8, error) {
	if len(data) < 178 {
		return 0, fmt.Errorf("trade account too short")
	}
	return data[177], nil
}

// FindLatestExecutedTradeID scans downward from nextTradeID-1 for the newest Executed trade.
func FindLatestExecutedTradeID(program, vault solana.PublicKey, nextTradeID uint64, load func(solana.PublicKey) ([]byte, error)) (uint64, error) {
	if nextTradeID <= 1 {
		return 0, fmt.Errorf("no executed trade (next_trade_id=%d)", nextTradeID)
	}
	for id := nextTradeID - 1; id > 0; id-- {
		data, err := load(TradePDA(program, vault, id))
		if err != nil || len(data) == 0 {
			continue
		}
		st, err := DecodeTradeStatus(data)
		if err != nil {
			continue
		}
		if st == TradeStatusExecuted {
			return id, nil
		}
	}
	return 0, fmt.Errorf("no executed trade found (next_trade_id=%d)", nextTradeID)
}
