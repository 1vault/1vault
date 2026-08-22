package gmgn

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

const (
	DefaultBaseURL = "https://openapi.gmgn.ai"
	// DefaultChain is Solana mainnet for all market/token quotes.
	DefaultChain = "sol"
	WSOLMint     = "So11111111111111111111111111111111111111112"
	UserAgent    = "1vault-backend"
)

type Client struct {
	APIKey     string
	BaseURL    string
	HTTPClient *http.Client
	privateKey any

	pauseMu    sync.Mutex
	pauseUntil time.Time

	solMu      sync.Mutex
	solPrice   float64
	solPriceAt time.Time
}

func New(apiKey, baseURL, privateKeyPEM, passphrase string, httpClient *http.Client) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 20 * time.Second}
	}
	c := &Client{
		APIKey:     strings.TrimSpace(apiKey),
		BaseURL:    strings.TrimRight(baseURL, "/"),
		HTTPClient: httpClient,
	}
	if pem := normalizePEM(privateKeyPEM); pem != "" {
		if key, err := parsePrivateKey(pem, passphrase); err == nil {
			c.privateKey = key
		}
	}
	return c
}

func (c *Client) Enabled() bool {
	return c != nil && c.APIKey != ""
}

func (c *Client) SigningEnabled() bool {
	return c != nil && c.privateKey != nil
}

type apiEnvelope struct {
	Code    int             `json:"code"`
	Error   string          `json:"error"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type requestOpts struct {
	method string
	path   string
	query  url.Values
	body   any
	signed bool
}

func (c *Client) do(ctx context.Context, opts requestOpts) (json.RawMessage, error) {
	if !c.Enabled() {
		return nil, ErrNotConfigured
	}
	if err := c.checkPause(); err != nil {
		return nil, err
	}
	method := opts.method
	if method == "" {
		method = http.MethodGet
	}
	q := url.Values{}
	for k, vs := range opts.query {
		for _, v := range vs {
			q.Add(k, v)
		}
	}
	ts := time.Now().Unix()
	q.Set("timestamp", strconv.FormatInt(ts, 10))
	q.Set("client_id", uuid.NewString())

	var bodyStr string
	var bodyReader io.Reader
	if opts.body != nil {
		b, err := json.Marshal(opts.body)
		if err != nil {
			return nil, err
		}
		bodyStr = string(b)
		bodyReader = bytes.NewReader(b)
	}

	headers := map[string]string{
		"X-APIKEY":     c.APIKey,
		"Content-Type": "application/json",
		"User-Agent":   UserAgent,
	}
	if opts.signed {
		if c.privateKey == nil {
			return nil, ErrSigningRequired
		}
		msg := buildSignMessage(opts.path, q, bodyStr, ts)
		sig, err := signMessage(c.privateKey, msg)
		if err != nil {
			return nil, fmt.Errorf("sign request: %w", err)
		}
		headers["X-Signature"] = sig
	}

	u := c.BaseURL + opts.path + "?" + sortedQuery(q)
	req, err := http.NewRequestWithContext(ctx, method, u, bodyReader)
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	res, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer res.Body.Close()
	rawBody, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}

	var env apiEnvelope
	if err := json.Unmarshal(rawBody, &env); err != nil {
		return nil, fmt.Errorf("non-json HTTP %d: %s", res.StatusCode, truncate(string(rawBody), 200))
	}
	if env.Code != 0 {
		resetAt := parseResetHeader(res.Header.Get("X-RateLimit-Reset"))
		if resetAt == 0 {
			resetAt = parseResetBody(rawBody)
		}
		if env.Error == "RATE_LIMIT_EXCEEDED" || env.Error == "RATE_LIMIT_BANNED" || res.StatusCode == 429 {
			rl := &RateLimitError{APIError: env.Error, Message: env.Message, ResetAt: resetAt}
			c.trip(rl)
			return nil, rl
		}
		return nil, fmt.Errorf("%s: code=%d error=%s message=%s", opts.path, env.Code, env.Error, env.Message)
	}
	if len(env.Data) == 0 || string(env.Data) == "null" {
		return json.RawMessage("null"), nil
	}
	return env.Data, nil
}

func (c *Client) checkPause() error {
	c.pauseMu.Lock()
	defer c.pauseMu.Unlock()
	if c.pauseUntil.IsZero() || time.Now().After(c.pauseUntil) {
		return nil
	}
	return &RateLimitError{
		APIError: "RATE_LIMIT_PAUSED",
		Message:  "upstream temporarily paused",
		ResetAt:  c.pauseUntil.Unix(),
	}
}

func (c *Client) trip(rl *RateLimitError) {
	until := time.Now().Add(5 * time.Second)
	if rl != nil && rl.ResetAt > 0 {
		t := time.Unix(rl.ResetAt, 0)
		if t.After(until) {
			until = t
		}
	}
	c.pauseMu.Lock()
	if until.After(c.pauseUntil) {
		c.pauseUntil = until
	}
	c.pauseMu.Unlock()
}

func (c *Client) getData(ctx context.Context, path string, q url.Values) (json.RawMessage, error) {
	return c.do(ctx, requestOpts{method: http.MethodGet, path: path, query: q})
}

func (c *Client) getDataSigned(ctx context.Context, path string, q url.Values) (json.RawMessage, error) {
	return c.do(ctx, requestOpts{method: http.MethodGet, path: path, query: q, signed: true})
}

func (c *Client) postData(ctx context.Context, path string, q url.Values, body any) (json.RawMessage, error) {
	return c.do(ctx, requestOpts{method: http.MethodPost, path: path, query: q, body: body})
}

func (c *Client) get(ctx context.Context, path string, q url.Values, dest any) error {
	raw, err := c.getData(ctx, path, q)
	if err != nil {
		return err
	}
	if dest == nil || string(raw) == "null" {
		return nil
	}
	if err := json.Unmarshal(raw, dest); err != nil {
		return fmt.Errorf("decode data: %w", err)
	}
	return nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func parseResetHeader(raw string) int64 {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	v, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || v <= 0 {
		return 0
	}
	return v
}

func parseResetBody(body []byte) int64 {
	var m struct {
		ResetAt int64 `json:"reset_at"`
	}
	_ = json.Unmarshal(body, &m)
	return m.ResetAt
}
