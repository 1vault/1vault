package dex

import "encoding/json"

// ParseObjectList parses a JSON array of objects (or {list:[...]} / {data:[...]}).
func ParseObjectList(raw json.RawMessage) []map[string]any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var arr []map[string]any
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr
	}
	var wrap map[string]json.RawMessage
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return nil
	}
	for _, key := range []string{"list", "data", "profiles", "ads", "boosts", "takeovers", "items"} {
		if v, ok := wrap[key]; ok {
			var inner []map[string]any
			if err := json.Unmarshal(v, &inner); err == nil {
				return inner
			}
		}
	}
	return nil
}

// FilterByChain keeps items whose chainId matches (case-insensitive).
func FilterByChain(items []map[string]any, chain string) []map[string]any {
	if chain == "" {
		chain = DefaultChain
	}
	want := stringsEqualFold(chain)
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if stringsEqualFold(asString(item["chainId"])) == want {
			out = append(out, item)
		}
	}
	return out
}

// FilterPairsByChain keeps pairs on the given chain.
func FilterPairsByChain(pairs []map[string]any, chain string) []map[string]any {
	return FilterByChain(pairs, chain)
}

func stringsEqualFold(s string) string {
	b := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		b[i] = c
	}
	return string(b)
}

// TokenAddressFromItem extracts mint/token address from a discovery item or pair.
func TokenAddressFromItem(item map[string]any) string {
	if item == nil {
		return ""
	}
	if a := asString(item["tokenAddress"]); a != "" {
		return a
	}
	if a := asString(item["token_address"]); a != "" {
		return a
	}
	if bt, _ := item["baseToken"].(map[string]any); bt != nil {
		if a := asString(bt["address"]); a != "" {
			return a
		}
	}
	return ""
}
