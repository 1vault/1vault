package gmgn

import (
	"encoding/json"
	"strconv"
	"strings"
)

// flexNum accepts JSON number or string.
type flexNum float64

func (f *flexNum) UnmarshalJSON(b []byte) error {
	v, err := parseFlexFloat(b)
	if err != nil {
		return err
	}
	*f = flexNum(v)
	return nil
}

func (f flexNum) Float() float64 { return float64(f) }

func (f flexNum) MarshalJSON() ([]byte, error) {
	return json.Marshal(float64(f))
}

// flexInt accepts JSON number or string.
type flexInt int64

func (f *flexInt) UnmarshalJSON(b []byte) error {
	v, err := parseFlexFloat(b)
	if err != nil {
		return err
	}
	*f = flexInt(int64(v))
	return nil
}

func (f flexInt) Int() int64   { return int64(f) }
func (f flexInt) IntVal() int  { return int(f) }

func (f flexInt) MarshalJSON() ([]byte, error) {
	return json.Marshal(int64(f))
}

func parseFlexFloat(b []byte) (float64, error) {
	b = []byte(strings.TrimSpace(string(b)))
	if len(b) == 0 || string(b) == "null" {
		return 0, nil
	}
	if b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return 0, err
		}
		s = strings.TrimSpace(s)
		if s == "" {
			return 0, nil
		}
		return strconv.ParseFloat(s, 64)
	}
	var v float64
	if err := json.Unmarshal(b, &v); err != nil {
		return 0, err
	}
	return v, nil
}

// decodeLoose unmarshals into dest; on failure returns the raw data error wrapped.
// Prefer typed structs that use flexNum/flexInt for all numeric API fields.
func decodeLoose(data json.RawMessage, dest any) error {
	if len(data) == 0 || string(data) == "null" {
		return nil
	}
	return json.Unmarshal(data, dest)
}
