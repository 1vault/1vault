package gmgn

import (
	"context"
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
)

type WalletHoldingsParams struct {
	Limit      int
	Cursor     string
	OrderBy    string
	Direction  string
	HideAirdrop bool
	HideClosed  bool
	HideAbnormal bool
	SellOut     bool
}

type WalletActivityParams struct {
	Token     string
	Limit     int
	Cursor    string
	Types     []string
}

type CreatedTokensParams struct {
	OrderBy      string
	Direction    string
	MigrateState string
}

func (c *Client) UserInfo(ctx context.Context) (json.RawMessage, error) {
	return c.getData(ctx, "/v1/user/info", nil)
}

func (c *Client) WalletHoldings(ctx context.Context, chain, wallet string, p WalletHoldingsParams) (json.RawMessage, error) {
	if chain == "" {
		chain = DefaultChain
	}
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("wallet_address", wallet)
	if p.Limit > 0 {
		if p.Limit > 50 {
			p.Limit = 50
		}
		q.Set("limit", strconv.Itoa(p.Limit))
	}
	if p.Cursor != "" {
		q.Set("cursor", p.Cursor)
	}
	if p.OrderBy != "" {
		q.Set("order_by", p.OrderBy)
	}
	if p.Direction != "" {
		q.Set("direction", p.Direction)
	}
	if p.HideAirdrop {
		q.Set("hide_airdrop", "true")
	}
	if p.HideClosed {
		q.Set("hide_closed", "true")
	}
	if p.HideAbnormal {
		q.Set("hide_abnormal", "true")
	}
	if p.SellOut {
		q.Set("sell_out", "true")
	}
	return c.getDataSigned(ctx, "/v1/user/wallet_holdings", q)
}

func (c *Client) WalletActivity(ctx context.Context, chain, wallet string, p WalletActivityParams) (json.RawMessage, error) {
	if chain == "" {
		chain = DefaultChain
	}
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("wallet_address", wallet)
	if p.Token != "" {
		q.Set("token_address", p.Token)
	}
	if p.Limit > 0 {
		q.Set("limit", strconv.Itoa(p.Limit))
	}
	if p.Cursor != "" {
		q.Set("cursor", p.Cursor)
	}
	for _, t := range p.Types {
		t = strings.TrimSpace(t)
		if t != "" {
			q.Add("type", t)
		}
	}
	return c.getData(ctx, "/v1/user/wallet_activity", q)
}

func (c *Client) WalletStats(ctx context.Context, chain string, wallets []string, period string) (json.RawMessage, error) {
	if chain == "" {
		chain = DefaultChain
	}
	if period == "" {
		period = "7d"
	}
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("period", period)
	for _, w := range wallets {
		w = strings.TrimSpace(w)
		if w != "" {
			q.Add("wallet_address", w)
		}
	}
	return c.getData(ctx, "/v1/user/wallet_stats", q)
}

func (c *Client) WalletProfits(ctx context.Context, chain string, wallets []string, period string) (json.RawMessage, error) {
	if chain == "" {
		chain = DefaultChain
	}
	if period == "" {
		period = "7d"
	}
	body := map[string]any{
		"chain":            chain,
		"period":           period,
		"wallet_addresses": wallets,
	}
	return c.postData(ctx, "/v1/user/wallet_profits", nil, body)
}

func (c *Client) WalletTokenBalance(ctx context.Context, chain, wallet, token string) (json.RawMessage, error) {
	if chain == "" {
		chain = DefaultChain
	}
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("wallet_address", wallet)
	q.Set("token_address", token)
	return c.getData(ctx, "/v1/user/wallet_token_balance", q)
}

func (c *Client) CreatedTokens(ctx context.Context, chain, wallet string, p CreatedTokensParams) (json.RawMessage, error) {
	if chain == "" {
		chain = DefaultChain
	}
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("wallet_address", wallet)
	if p.OrderBy != "" {
		q.Set("order_by", p.OrderBy)
	}
	if p.Direction != "" {
		q.Set("direction", p.Direction)
	}
	if p.MigrateState != "" {
		q.Set("migrate_state", p.MigrateState)
	}
	return c.getData(ctx, "/v1/user/created_tokens", q)
}
