package roles

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Public API role values (product language).
const (
	Strategies = "strategies" // formerly degen — Strategies side
	Investors  = "investors"  // formerly retail — Investors side
)

// DB / indexer role values (shared Postgres CHECK constraints).
const (
	DBDegen  = "degen"
	DBRetail = "retail"
)

// ParseAPI accepts strategies|investors and legacy degen|retail (plus common aliases).
func ParseAPI(raw string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case Strategies, "strategy", "strategist", DBDegen:
		return Strategies, true
	case Investors, "investor", DBRetail:
		return Investors, true
	default:
		return "", false
	}
}

// ToDB maps API role → indexer/DB role (deposit_intents / vault_holdings CHECK).
func ToDB(api string) string {
	k, ok := ParseAPI(api)
	if !ok {
		return DBRetail
	}
	if k == Strategies {
		return DBDegen
	}
	return DBRetail
}

// FromDB maps DB role → public API role.
func FromDB(db string) string {
	switch strings.ToLower(strings.TrimSpace(db)) {
	case DBDegen, Strategies, "strategy", "strategist":
		return Strategies
	case DBRetail, Investors, "investor":
		return Investors
	default:
		// Unknown values: if it still looks like legacy degen, map it.
		if strings.Contains(strings.ToLower(db), "degen") {
			return Strategies
		}
		return Investors
	}
}

// Label is the human-facing product name.
func Label(api string) string {
	switch FromDB(api) {
	case Strategies:
		return "Strategies"
	default:
		return "Investors"
	}
}

func DefaultAPI() string {
	return Investors
}

func asString(v any) (string, bool) {
	switch t := v.(type) {
	case string:
		return t, true
	case []byte:
		return string(t), true
	case json.Number:
		return t.String(), true
	case fmt.Stringer:
		return t.String(), true
	default:
		return "", false
	}
}

// RewritePublic walks response payloads and replaces legacy degen/retail language
// with strategies/investors everywhere (including nested maps / lists / RawMessage).
func RewritePublic(v any) any {
	switch t := v.(type) {
	case nil:
		return nil
	case map[string]any:
		out := make(map[string]any, len(t)+2)
		for k, val := range t {
			nk, nv := rewriteEntry(k, val)
			out[nk] = RewritePublic(nv)
		}
		annotateRoleLabels(out)
		return out
	case []map[string]any:
		out := make([]map[string]any, len(t))
		for i := range t {
			rewritten, _ := RewritePublic(t[i]).(map[string]any)
			out[i] = rewritten
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i := range t {
			out[i] = RewritePublic(t[i])
		}
		return out
	case json.RawMessage:
		if len(t) == 0 || string(t) == "null" {
			return t
		}
		var decoded any
		if err := json.Unmarshal(t, &decoded); err != nil {
			return t
		}
		rewritten := RewritePublic(decoded)
		b, err := json.Marshal(rewritten)
		if err != nil {
			return t
		}
		return json.RawMessage(b)
	default:
		// Structs / typed values: round-trip through JSON so nested role fields are rewritten.
		b, err := json.Marshal(t)
		if err != nil {
			return v
		}
		var decoded any
		if err := json.Unmarshal(b, &decoded); err != nil {
			return v
		}
		// Avoid infinite recursion on primitives.
		switch decoded.(type) {
		case map[string]any, []any:
			return RewritePublic(decoded)
		default:
			return v
		}
	}
}

func rewriteEntry(key string, val any) (string, any) {
	lk := strings.ToLower(key)
	switch lk {
	case "role", "rolepreference", "role_preference":
		if s, ok := asString(val); ok {
			return key, FromDB(s)
		}
	case "degenfeewallet", "degen_fee_wallet":
		return "strategiesFeeWallet", val
	}
	if s, ok := asString(val); ok {
		ls := strings.ToLower(strings.TrimSpace(s))
		if ls == DBDegen {
			return key, Strategies
		}
		if ls == DBRetail {
			return key, Investors
		}
		// Soft rewrite free-text messages that still say degen fee wallet.
		if strings.Contains(ls, "degen fee") {
			return key, strings.ReplaceAll(strings.ReplaceAll(s, "degen fee", "strategies fee"), "Degen fee", "Strategies fee")
		}
	}
	return key, val
}

func annotateRoleLabels(m map[string]any) {
	if raw, ok := m["role"]; ok {
		if s, ok := asString(raw); ok {
			api := FromDB(s)
			m["role"] = api
			m["roleLabel"] = Label(api)
		}
	}
	if raw, ok := m["rolePreference"]; ok {
		if s, ok := asString(raw); ok {
			api := FromDB(s)
			m["rolePreference"] = api
			m["rolePreferenceLabel"] = Label(api)
		}
	}
}
