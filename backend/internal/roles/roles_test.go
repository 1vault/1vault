package roles

import (
	"encoding/json"
	"testing"
)

func TestParseAndRoundTrip(t *testing.T) {
	cases := []struct {
		in, api, db string
	}{
		{"strategies", Strategies, DBDegen},
		{"degen", Strategies, DBDegen},
		{"strategist", Strategies, DBDegen},
		{"investors", Investors, DBRetail},
		{"retail", Investors, DBRetail},
		{"investor", Investors, DBRetail},
	}
	for _, c := range cases {
		api, ok := ParseAPI(c.in)
		if !ok || api != c.api {
			t.Fatalf("ParseAPI(%q)=%q ok=%v want %q", c.in, api, ok, c.api)
		}
		if ToDB(c.in) != c.db {
			t.Fatalf("ToDB(%q)=%q want %q", c.in, ToDB(c.in), c.db)
		}
		if FromDB(c.db) != c.api {
			t.Fatalf("FromDB(%q)=%q want %q", c.db, FromDB(c.db), c.api)
		}
	}
	if Label(Strategies) != "Strategies" || Label(Investors) != "Investors" {
		t.Fatal(Label(Strategies), Label(Investors))
	}
}

func TestRewritePublic(t *testing.T) {
	in := map[string]any{
		"role":           "degen",
		"rolePreference": "retail",
		"degenFeeWallet": "Abc",
		"items": []any{
			map[string]any{"role": "retail", "note": "ok"},
		},
		"raw": json.RawMessage(`{"role":"degen"}`),
	}
	out, ok := RewritePublic(in).(map[string]any)
	if !ok {
		t.Fatal("expected map")
	}
	if out["role"] != Strategies || out["roleLabel"] != "Strategies" {
		t.Fatalf("role=%v label=%v", out["role"], out["roleLabel"])
	}
	if out["rolePreference"] != Investors {
		t.Fatalf("rolePreference=%v", out["rolePreference"])
	}
	if _, still := out["degenFeeWallet"]; still {
		t.Fatal("degenFeeWallet should be renamed")
	}
	if out["strategiesFeeWallet"] != "Abc" {
		t.Fatalf("strategiesFeeWallet=%v", out["strategiesFeeWallet"])
	}
	items := out["items"].([]any)
	row := items[0].(map[string]any)
	if row["role"] != Investors {
		t.Fatalf("nested role=%v", row["role"])
	}
	raw := out["raw"].(json.RawMessage)
	var nested map[string]any
	_ = json.Unmarshal(raw, &nested)
	if nested["role"] != Strategies {
		t.Fatalf("raw role=%v", nested["role"])
	}
}
