package gmgn

import (
	"errors"
	"fmt"
	"time"
)

var ErrNotConfigured = errors.New("market data not configured")
var ErrSigningRequired = errors.New("market signing key not configured")

type RateLimitError struct {
	APIError string
	Message  string
	ResetAt  int64 // unix seconds
}

func (e *RateLimitError) Error() string {
	msg := e.Message
	if msg == "" {
		msg = e.APIError
	}
	if e.ResetAt > 0 {
		return fmt.Sprintf("market rate limited (%s), retry after %s", msg, time.Unix(e.ResetAt, 0).Format(time.RFC3339))
	}
	return fmt.Sprintf("market rate limited: %s", msg)
}

func AsRateLimit(err error) (*RateLimitError, bool) {
	var rl *RateLimitError
	if errors.As(err, &rl) {
		return rl, true
	}
	return nil, false
}
