package wallets

import "testing"

func TestParse(t *testing.T) {
	cases := map[string]Kind{
		"eoa":        KindEOA,
		"EOA":        KindEOA,
		"individual": KindEOA,
		"personal":   KindEOA,
		"pda":        KindPDA,
		"vault":      KindPDA,
		"PDA":        KindPDA,
	}
	for in, want := range cases {
		got, ok := Parse(in)
		if !ok || got != want {
			t.Fatalf("Parse(%q)=%q ok=%v want %q", in, got, ok, want)
		}
	}
	if _, ok := Parse("nope"); ok {
		t.Fatal("expected invalid")
	}
}

func TestLabel(t *testing.T) {
	if KindPDA.Label() != "vault" {
		t.Fatal(KindPDA.Label())
	}
	if KindEOA.Label() != "individual" {
		t.Fatal(KindEOA.Label())
	}
}
