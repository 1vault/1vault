package dex

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultBaseURL = "https://api.dexscreener.com"
	DefaultWSURL   = "wss://api.dexscreener.com"
	DefaultChain   = "solana"
	UserAgent      = "1vault-backend"
)

type Client struct {
	BaseURL    string
	WSURL      string
	HTTPClient *http.Client
}

func New(baseURL, wsURL string, httpClient *http.Client) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	if wsURL == "" {
		wsURL = DefaultWSURL
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		WSURL:      strings.TrimRight(wsURL, "/"),
		HTTPClient: httpClient,
	}
}

func (c *Client) getJSON(ctx context.Context, path string, q url.Values) (json.RawMessage, error) {
	u := c.BaseURL + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", UserAgent)

	res, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	if res.StatusCode == http.StatusTooManyRequests {
		return nil, &RateLimitError{Status: res.StatusCode, Body: truncate(string(body), 200)}
	}
	if res.StatusCode == http.StatusNotFound {
		return nil, &NotFoundError{Path: path, Body: truncate(string(body), 200)}
	}
	if res.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d: %s", res.StatusCode, truncate(string(body), 200))
	}
	if len(body) == 0 {
		return json.RawMessage("null"), nil
	}
	return json.RawMessage(body), nil
}

func (c *Client) TokenProfilesLatest(ctx context.Context) (json.RawMessage, error) {
	return c.getJSON(ctx, "/token-profiles/latest/v1", nil)
}

func (c *Client) TokenProfilesRecent(ctx context.Context) (json.RawMessage, error) {
	return c.getJSON(ctx, "/token-profiles/recent-updates/v1", nil)
}

func (c *Client) CommunityTakeoversLatest(ctx context.Context) (json.RawMessage, error) {
	return c.getJSON(ctx, "/community-takeovers/latest/v1", nil)
}

func (c *Client) AdsLatest(ctx context.Context) (json.RawMessage, error) {
	return c.getJSON(ctx, "/ads/latest/v1", nil)
}

func (c *Client) BoostsLatest(ctx context.Context) (json.RawMessage, error) {
	return c.getJSON(ctx, "/token-boosts/latest/v1", nil)
}

func (c *Client) BoostsTop(ctx context.Context) (json.RawMessage, error) {
	return c.getJSON(ctx, "/token-boosts/top/v1", nil)
}

// StreamSnapshot fetches the REST equivalent of a WS path for HTTP clients / docs try-out.
func (c *Client) StreamSnapshot(ctx context.Context, upstreamPath string) (json.RawMessage, error) {
	switch upstreamPath {
	case "/token-profiles/latest/v1":
		return c.TokenProfilesLatest(ctx)
	case "/token-profiles/recent-updates/v1":
		return c.TokenProfilesRecent(ctx)
	case "/community-takeovers/latest/v1":
		return c.CommunityTakeoversLatest(ctx)
	case "/ads/latest/v1":
		return c.AdsLatest(ctx)
	case "/token-boosts/latest/v1":
		return c.BoostsLatest(ctx)
	case "/token-boosts/top/v1":
		return c.BoostsTop(ctx)
	default:
		return c.getJSON(ctx, upstreamPath, nil)
	}
}

func (c *Client) Orders(ctx context.Context, chainID, tokenAddress string) (json.RawMessage, error) {
	if chainID == "" {
		chainID = DefaultChain
	}
	path := fmt.Sprintf("/orders/v1/%s/%s", url.PathEscape(chainID), url.PathEscape(tokenAddress))
	return c.getJSON(ctx, path, nil)
}

func (c *Client) Pair(ctx context.Context, chainID, pairID string) (json.RawMessage, error) {
	if chainID == "" {
		chainID = DefaultChain
	}
	path := fmt.Sprintf("/latest/dex/pairs/%s/%s", url.PathEscape(chainID), url.PathEscape(pairID))
	return c.getJSON(ctx, path, nil)
}

func (c *Client) Search(ctx context.Context, query string) (json.RawMessage, error) {
	q := url.Values{}
	q.Set("q", query)
	return c.getJSON(ctx, "/latest/dex/search", q)
}

func (c *Client) TokenPairs(ctx context.Context, chainID, tokenAddress string) (json.RawMessage, error) {
	if chainID == "" {
		chainID = DefaultChain
	}
	path := fmt.Sprintf("/token-pairs/v1/%s/%s", url.PathEscape(chainID), url.PathEscape(tokenAddress))
	return c.getJSON(ctx, path, nil)
}

func (c *Client) Tokens(ctx context.Context, chainID string, tokenAddresses []string) (json.RawMessage, error) {
	if chainID == "" {
		chainID = DefaultChain
	}
	joined := strings.Join(tokenAddresses, ",")
	path := fmt.Sprintf("/tokens/v1/%s/%s", url.PathEscape(chainID), joined)
	return c.getJSON(ctx, path, nil)
}

// TokensLegacy uses /latest/dex/tokens/{addresses} (returns {pairs:[...]}).
func (c *Client) TokensLegacy(ctx context.Context, tokenAddresses []string) (json.RawMessage, error) {
	joined := strings.Join(tokenAddresses, ",")
	path := "/latest/dex/tokens/" + joined
	return c.getJSON(ctx, path, nil)
}

func (c *Client) MetasTrending(ctx context.Context) (json.RawMessage, error) {
	return c.getJSON(ctx, "/metas/trending/v1", nil)
}

func (c *Client) MetaBySlug(ctx context.Context, slug string) (json.RawMessage, error) {
	path := "/metas/meta/v1/" + url.PathEscape(slug)
	return c.getJSON(ctx, path, nil)
}

type RateLimitError struct {
	Status int
	Body   string
}

func (e *RateLimitError) Error() string {
	return "market discovery rate limited: " + e.Body
}

func AsRateLimit(err error) (*RateLimitError, bool) {
	if e, ok := err.(*RateLimitError); ok {
		return e, true
	}
	return nil, false
}

type NotFoundError struct {
	Path string
	Body string
}

func (e *NotFoundError) Error() string {
	return "not found: " + e.Path
}

func AsNotFound(err error) (*NotFoundError, bool) {
	if e, ok := err.(*NotFoundError); ok {
		return e, true
	}
	return nil, false
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// ParsePairs extracts pair objects from either a raw array or {pairs:[...]}.
func ParsePairs(raw json.RawMessage) []map[string]any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var arr []map[string]any
	if err := json.Unmarshal(raw, &arr); err == nil {
		return arr
	}
	var wrap struct {
		Pairs []map[string]any `json:"pairs"`
	}
	if err := json.Unmarshal(raw, &wrap); err == nil {
		return wrap.Pairs
	}
	return nil
}

// BestPair picks the highest-liquidity pair, preferring the given chain.
func BestPair(pairs []map[string]any, preferChain string) map[string]any {
	if len(pairs) == 0 {
		return nil
	}
	best := pairs[0]
	bestLiq := pairLiquidityUSD(best)
	for _, p := range pairs[1:] {
		liq := pairLiquidityUSD(p)
		chain := asString(p["chainId"])
		bestChain := asString(best["chainId"])
		if preferChain != "" {
			if chain == preferChain && bestChain != preferChain {
				best, bestLiq = p, liq
				continue
			}
			if chain != preferChain && bestChain == preferChain {
				continue
			}
		}
		if liq > bestLiq {
			best, bestLiq = p, liq
		}
	}
	return best
}

func pairLiquidityUSD(p map[string]any) float64 {
	liq, _ := p["liquidity"].(map[string]any)
	if liq == nil {
		return 0
	}
	return asFloat(liq["usd"])
}

func PairPriceUSD(p map[string]any) float64 {
	if p == nil {
		return 0
	}
	return asFloat(p["priceUsd"])
}

func PairMarketCapUSD(p map[string]any) float64 {
	if p == nil {
		return 0
	}
	if v := asFloat(p["marketCap"]); v > 0 {
		return v
	}
	return asFloat(p["fdv"])
}

func asString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case json.Number:
		return t.String()
	default:
		return ""
	}
}

func asFloat(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case json.Number:
		f, _ := t.Float64()
		return f
	case string:
		f, _ := strconv.ParseFloat(strings.TrimSpace(t), 64)
		return f
	case int:
		return float64(t)
	case int64:
		return float64(t)
	default:
		return 0
	}
}

// SanitizePair removes vendor-branded fields we don't want to surface as product copy.
// Keeps useful chart URL under "chartUrl".
func SanitizePair(p map[string]any) map[string]any {
	if p == nil {
		return nil
	}
	out := make(map[string]any, len(p))
	for k, v := range p {
		if k == "url" {
			out["chartUrl"] = v
			continue
		}
		out[k] = v
	}
	return out
}

func SanitizePairs(pairs []map[string]any) []map[string]any {
	out := make([]map[string]any, 0, len(pairs))
	for _, p := range pairs {
		out = append(out, SanitizePair(p))
	}
	return out
}
