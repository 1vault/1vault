package signing_test

import (
	"testing"

	"github.com/1vault/backend/internal/signing"
)

func TestModeFromDetails(t *testing.T) {
	partial := []signing.Detail{
		{Pubkey: "A", SignerKind: signing.KindEOA, UserMustSign: true},
		{Pubkey: "B", SignerKind: signing.KindEphemeral, UserMustSign: false},
	}
	if signing.ModeFromDetails(partial) != signing.ModePartial {
		t.Fatalf("expected partial")
	}
	server := []signing.Detail{
		{Pubkey: "K", SignerKind: signing.KindKeeper, UserMustSign: false},
	}
	if signing.ModeFromDetails(server) != signing.ModeServer {
		t.Fatalf("expected server")
	}
}

func TestDetailsForSignersDefaultsEOA(t *testing.T) {
	d := signing.DetailsForSigners([]string{"pk1"}, nil)
	if len(d) != 1 || d[0].SignerKind != signing.KindEOA || !d[0].UserMustSign {
		t.Fatalf("unexpected %+v", d)
	}
}
