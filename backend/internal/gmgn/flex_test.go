package gmgn

import (
	"encoding/json"
	"testing"
)

func TestFlexNumStringAndNumber(t *testing.T) {
	var n flexNum
	if err := json.Unmarshal([]byte(`"1234.5"`), &n); err != nil {
		t.Fatal(err)
	}
	if n.Float() != 1234.5 {
		t.Fatalf("got %v", n.Float())
	}
	if err := json.Unmarshal([]byte(`99`), &n); err != nil {
		t.Fatal(err)
	}
	if n.Float() != 99 {
		t.Fatalf("got %v", n.Float())
	}
}

func TestTokenInfoFullLiquidityString(t *testing.T) {
	raw := []byte(`{
		"address":"Abc",
		"symbol":"X",
		"name":"X",
		"decimals":"6",
		"liquidity":"15234.5",
		"holder_count":"100",
		"total_supply":"1000000",
		"circulating_supply":"1000000",
		"price":{"price":"0.001"}
	}`)
	var info TokenInfoFull
	if err := json.Unmarshal(raw, &info); err != nil {
		t.Fatal(err)
	}
	if info.Liquidity.Float() != 15234.5 {
		t.Fatalf("liquidity=%v", info.Liquidity.Float())
	}
	if info.Decimals.IntVal() != 6 {
		t.Fatalf("decimals=%d", info.Decimals.IntVal())
	}
	if info.MarketCapUSD() != 1000 {
		t.Fatalf("mcap=%v", info.MarketCapUSD())
	}
}

func TestProceedsLamports(t *testing.T) {
	q := &Quote{PriceUSD: 0.001, SOLPriceUSD: 100, Decimals: 6}
	lamports, usd, err := ProceedsLamports(q, 1_000_000, 5_000)
	if err != nil {
		t.Fatal(err)
	}
	if usd != 0.0005 {
		t.Fatalf("usd=%v", usd)
	}
	if lamports != 5_000 {
		t.Fatalf("lamports=%d", lamports)
	}
}
