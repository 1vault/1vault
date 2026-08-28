package solana_test

import (
	"fmt"
	"testing"

	s "github.com/1vault/backend/internal/solana"
)

func TestFriendlyTxError(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"AnchorError ... Error Number: 6033. Error Message: Nothing to claim.", "Nothing to claim"},
		{"custom program error: 0x1779", "already Closed"},
		{"Transaction simulation failed: Blockhash not found", "blockhash expired"},
	}
	for _, tc := range cases {
		got := s.FriendlyTxError(fmt.Errorf("%s", tc.in))
		if got == tc.in {
			t.Fatalf("expected mapped message for %q, got raw", tc.in)
		}
		if tc.want != "" && !containsFold(got, tc.want) {
			t.Fatalf("got %q want substring %q", got, tc.want)
		}
	}
}

func containsFold(hay, needle string) bool {
	return len(hay) >= len(needle) && (hay == needle ||
		len(needle) == 0 ||
		(len(hay) > 0 && (stringContainsCI(hay, needle))))
}

func stringContainsCI(hay, needle string) bool {
	h, n := []rune(hay), []rune(needle)
	for i := 0; i+len(n) <= len(h); i++ {
		ok := true
		for j := 0; j < len(n); j++ {
			a, b := h[i+j], n[j]
			if a >= 'A' && a <= 'Z' {
				a += 'a' - 'A'
			}
			if b >= 'A' && b <= 'Z' {
				b += 'a' - 'A'
			}
			if a != b {
				ok = false
				break
			}
		}
		if ok {
			return true
		}
	}
	return false
}
