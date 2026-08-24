package flow

import "testing"

func TestJsonbText(t *testing.T) {
	s, err := jsonbText(map[string]any{"vaultId": 1})
	if err != nil {
		t.Fatal(err)
	}
	if s != `{"vaultId":1}` {
		t.Fatalf("got %q", s)
	}
	s, err = jsonbText([]byte(`{"a":true}`))
	if err != nil || s != `{"a":true}` {
		t.Fatalf("bytes: %q %v", s, err)
	}
	s, err = jsonbText(nil)
	if err != nil || s != "{}" {
		t.Fatalf("nil: %q %v", s, err)
	}
}
