package gmgn

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strconv"
)

// TokenInfoFull uses flexible numeric types — upstream often returns numbers as strings.
type TokenInfoFull struct {
	Address            string          `json:"address"`
	Symbol             string          `json:"symbol"`
	Name               string          `json:"name"`
	Decimals           flexInt         `json:"decimals"`
	Liquidity          flexNum         `json:"liquidity"`
	HolderCount        flexInt         `json:"holder_count"`
	TotalSupply        flexNum         `json:"total_supply"`
	CirculatingSupply  flexNum         `json:"circulating_supply"`
	Price              Price           `json:"price"`
	Logo               string          `json:"logo,omitempty"`
	CreationTimestamp  flexInt         `json:"creation_timestamp,omitempty"`
	OpenTimestamp      flexInt         `json:"open_timestamp,omitempty"`
	BiggestPoolAddress string          `json:"biggest_pool_address,omitempty"`
	Launchpad          string          `json:"launchpad,omitempty"`
	LaunchpadStatus    flexNum         `json:"launchpad_status,omitempty"`
	LaunchpadProgress  flexNum         `json:"launchpad_progress,omitempty"`
	LaunchpadPlatform  string          `json:"launchpad_platform,omitempty"`
	AthPrice           flexNum         `json:"ath_price,omitempty"`
	Pool               json.RawMessage `json:"pool,omitempty"`
	Dev                json.RawMessage `json:"dev,omitempty"`
	Link               json.RawMessage `json:"link,omitempty"`
	Stat               json.RawMessage `json:"stat,omitempty"`
	WalletTagsStat     json.RawMessage `json:"wallet_tags_stat,omitempty"`
}

func (t *TokenInfoFull) MarketCapUSD() float64 {
	if t == nil {
		return 0
	}
	p := t.Price.Price.Float()
	supply := t.CirculatingSupply.Float()
	if supply <= 0 {
		supply = t.TotalSupply.Float()
	}
	if p <= 0 || supply <= 0 {
		return 0
	}
	return p * supply
}

func (c *Client) TokenInfoFull(ctx context.Context, chain, mint string) (*TokenInfoFull, error) {
	if chain == "" {
		chain = DefaultChain
	}
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("address", mint)
	raw, err := c.getData(ctx, "/v1/token/info", q)
	if err != nil {
		return nil, err
	}
	var info TokenInfoFull
	if err := decodeLoose(raw, &info); err != nil {
		// Fallback: return empty shell + keep price via soft map extract
		return softTokenInfo(raw, mint)
	}
	if info.Address == "" {
		info.Address = mint
	}
	return &info, nil
}

func softTokenInfo(raw json.RawMessage, mint string) (*TokenInfoFull, error) {
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil, fmt.Errorf("token info decode: %w", err)
	}
	info := &TokenInfoFull{Address: mint}
	_ = decodeLoose(m["address"], &info.Address)
	_ = decodeLoose(m["symbol"], &info.Symbol)
	_ = decodeLoose(m["name"], &info.Name)
	_ = decodeLoose(m["decimals"], &info.Decimals)
	_ = decodeLoose(m["liquidity"], &info.Liquidity)
	_ = decodeLoose(m["holder_count"], &info.HolderCount)
	_ = decodeLoose(m["total_supply"], &info.TotalSupply)
	_ = decodeLoose(m["circulating_supply"], &info.CirculatingSupply)
	_ = decodeLoose(m["price"], &info.Price)
	_ = decodeLoose(m["logo"], &info.Logo)
	info.Pool = m["pool"]
	info.Dev = m["dev"]
	info.Link = m["link"]
	info.Stat = m["stat"]
	info.WalletTagsStat = m["wallet_tags_stat"]
	return info, nil
}

func (c *Client) TokenSecurity(ctx context.Context, chain, mint string) (json.RawMessage, error) {
	return c.getRaw(ctx, "/v1/token/security", chain, mint, nil)
}

func (c *Client) TokenPool(ctx context.Context, chain, mint string) (json.RawMessage, error) {
	return c.getRaw(ctx, "/v1/token/pool_info", chain, mint, nil)
}

type HolderListParams struct {
	Limit     int    `json:"limit"`
	OrderBy   string `json:"orderBy"`
	Direction string `json:"direction"`
	Tag       string `json:"tag,omitempty"`
}

func (c *Client) TokenHolders(ctx context.Context, chain, mint string, p HolderListParams) (json.RawMessage, error) {
	return c.tokenList(ctx, "/v1/market/token_top_holders", chain, mint, p)
}

func (c *Client) TokenTraders(ctx context.Context, chain, mint string, p HolderListParams) (json.RawMessage, error) {
	return c.tokenList(ctx, "/v1/market/token_top_traders", chain, mint, p)
}

func (c *Client) tokenList(ctx context.Context, path, chain, mint string, p HolderListParams) (json.RawMessage, error) {
	extra := url.Values{}
	if p.Limit > 0 {
		if p.Limit > 100 {
			p.Limit = 100
		}
		extra.Set("limit", strconv.Itoa(p.Limit))
	}
	if p.OrderBy != "" {
		extra.Set("order_by", p.OrderBy)
	}
	if p.Direction != "" {
		extra.Set("direction", p.Direction)
	}
	if p.Tag != "" {
		extra.Set("tag", p.Tag)
	}
	return c.getRaw(ctx, path, chain, mint, extra)
}

func (c *Client) getRaw(ctx context.Context, path, chain, mint string, extra url.Values) (json.RawMessage, error) {
	if chain == "" {
		chain = DefaultChain
	}
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("address", mint)
	for k, vs := range extra {
		for _, v := range vs {
			q.Add(k, v)
		}
	}
	raw, err := c.getData(ctx, path, q)
	if err != nil {
		return nil, err
	}
	if len(raw) == 0 {
		return json.RawMessage("null"), nil
	}
	return raw, nil
}

type Research struct {
	Mint      string          `json:"mint"`
	Chain     string          `json:"chain"`
	Info      *TokenInfoFull  `json:"info"`
	MarketCap float64         `json:"marketCapUsd"`
	PriceUSD  float64         `json:"priceUsd"`
	Liquidity float64         `json:"liquidityUsd"`
	Security  json.RawMessage `json:"security,omitempty"`
	Pool      json.RawMessage `json:"pool,omitempty"`
}

func (c *Client) Research(ctx context.Context, mint string) (*Research, error) {
	type res struct {
		raw json.RawMessage
		err error
	}
	infoCh := make(chan *TokenInfoFull, 1)
	infoErrCh := make(chan error, 1)
	secCh := make(chan res, 1)
	poolCh := make(chan res, 1)

	go func() {
		info, err := c.TokenInfoFull(ctx, DefaultChain, mint)
		if err != nil {
			infoErrCh <- err
			return
		}
		infoCh <- info
	}()
	go func() {
		raw, err := c.TokenSecurity(ctx, DefaultChain, mint)
		secCh <- res{raw, err}
	}()
	go func() {
		raw, err := c.TokenPool(ctx, DefaultChain, mint)
		poolCh <- res{raw, err}
	}()

	var info *TokenInfoFull
	select {
	case err := <-infoErrCh:
		return nil, fmt.Errorf("token info: %w", err)
	case info = <-infoCh:
	}

	out := &Research{
		Mint:      mint,
		Chain:     DefaultChain,
		Info:      info,
		MarketCap: info.MarketCapUSD(),
		PriceUSD:  info.Price.Price.Float(),
		Liquidity: info.Liquidity.Float(),
	}
	if sec := <-secCh; sec.err == nil {
		out.Security = sec.raw
	}
	if pool := <-poolCh; pool.err == nil {
		out.Pool = pool.raw
	} else if len(info.Pool) > 0 {
		out.Pool = info.Pool
	}
	return out, nil
}
