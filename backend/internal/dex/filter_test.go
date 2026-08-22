package dex

import (
	"encoding/json"
	"testing"
)

func TestFilterByChainSolana(t *testing.T) {
	raw := []byte(`[
		{"chainId":"solana","tokenAddress":"AAA"},
		{"chainId":"bsc","tokenAddress":"BBB"},
		{"chainId":"Solana","tokenAddress":"CCC"}
	]`)
	items := FilterByChain(ParseObjectList(raw), DefaultChain)
	if len(items) != 2 {
		t.Fatalf("got %d want 2", len(items))
	}
	if TokenAddressFromItem(items[0]) != "AAA" {
		t.Fatalf("first=%v", items[0])
	}
}

func TestParsePairsAndFilter(t *testing.T) {
	raw := json.RawMessage(`{"pairs":[{"chainId":"solana","pairAddress":"1"},{"chainId":"eth","pairAddress":"2"}]}`)
	pairs := FilterPairsByChain(ParsePairs(raw), "solana")
	if len(pairs) != 1 {
		t.Fatalf("got %d", len(pairs))
	}
}
