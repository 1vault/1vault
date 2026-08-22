package vaults

import "testing"

func TestParse(t *testing.T) {
	cases := map[string]Type{
		"pooled":       TypePooled,
		"POOLED":       TypePooled,
		"pooled_vault": TypePooled,
		"sliced":       TypeSliced,
		"slice":        TypeSliced,
		"sliced_vault": TypeSliced,
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

func TestLabelMeaning(t *testing.T) {
	if TypePooled.Label() != "Pooled Vault" {
		t.Fatal(TypePooled.Label())
	}
	if TypeSliced.Label() != "Sliced Vault" {
		t.Fatal(TypeSliced.Label())
	}
	if TypePooled.Meaning() == "" || TypeSliced.Meaning() == "" {
		t.Fatal("meanings required")
	}
	m := Meta(TypeSliced)
	if m["vaultType"] != "sliced" || m["vaultTypeLabel"] != "Sliced Vault" {
		t.Fatalf("%v", m)
	}
}
