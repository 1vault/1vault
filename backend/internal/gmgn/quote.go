package gmgn

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"strconv"
	"time"
)

type TokenInfo struct {
	Address           string  `json:"address"`
	Symbol            string  `json:"symbol"`
	Name              string  `json:"name"`
	Decimals          flexInt `json:"decimals"`
	Liquidity         flexNum `json:"liquidity"`
	HolderCount       flexInt `json:"holder_count"`
	TotalSupply       flexNum `json:"total_supply"`
	CirculatingSupply flexNum `json:"circulating_supply"`
	Price             Price   `json:"price"`
}

type Price struct {
	Price          flexNum `json:"price"`
	PriceChange1h  flexNum `json:"price_change_percent1h"`
	PriceChange24h flexNum `json:"price_change_percent24h"`
	Volume1h       flexNum `json:"volume_1h"`
	Volume24h      flexNum `json:"volume_24h"`
	HotLevel       flexNum `json:"hot_level"`
}

type Candle struct {
	Time   flexInt `json:"time"` // ms
	Open   flexNum `json:"open"`
	Close  flexNum `json:"close"`
	High   flexNum `json:"high"`
	Low    flexNum `json:"low"`
	Volume flexNum `json:"volume"`
	Amount flexNum `json:"amount"`
}

type klineData struct {
	List []Candle `json:"list"`
}

func (c *Client) TokenInfo(ctx context.Context, chain, mint string) (*TokenInfo, error) {
	if chain == "" {
		chain = DefaultChain
	}
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("address", mint)
	var info TokenInfo
	if err := c.get(ctx, "/v1/token/info", q, &info); err != nil {
		return nil, err
	}
	return &info, nil
}

func (c *Client) Kline(ctx context.Context, chain, mint, resolution string, from, to int64) ([]Candle, error) {
	if chain == "" {
		chain = DefaultChain
	}
	if resolution == "" {
		resolution = "1m"
	}
	q := url.Values{}
	q.Set("chain", chain)
	q.Set("address", mint)
	q.Set("resolution", resolution)
	if from > 0 {
		q.Set("from", strconv.FormatInt(from, 10))
	}
	if to > 0 {
		q.Set("to", strconv.FormatInt(to, 10))
	}
	raw, err := c.getData(ctx, "/v1/market/token_kline", q)
	if err != nil {
		return nil, err
	}
	var data klineData
	if err := decodeLoose(raw, &data); err == nil && len(data.List) > 0 {
		return data.List, nil
	}
	var list []Candle
	if err := decodeLoose(raw, &list); err == nil {
		return list, nil
	}
	return data.List, nil
}

func LastCloseUSD(candles []Candle) (float64, bool) {
	if len(candles) == 0 {
		return 0, false
	}
	v := candles[len(candles)-1].Close.Float()
	if v <= 0 {
		return 0, false
	}
	return v, true
}

type Quote struct {
	Mint        string  `json:"mint"`
	Chain       string  `json:"chain"`
	Symbol      string  `json:"symbol,omitempty"`
	Name        string  `json:"name,omitempty"`
	Decimals    int     `json:"decimals"`
	PriceUSD    float64 `json:"priceUsd"`
	Liquidity   float64 `json:"liquidityUsd,omitempty"`
	Source      string  `json:"source"`
	SOLPriceUSD float64 `json:"solPriceUsd,omitempty"`
}

func (c *Client) Quote(ctx context.Context, mint string) (*Quote, error) {
	info, err := c.TokenInfo(ctx, DefaultChain, mint)
	if err == nil && info.Price.Price.Float() > 0 {
		return &Quote{
			Mint:      mint,
			Chain:     DefaultChain,
			Symbol:    info.Symbol,
			Name:      info.Name,
			Decimals:  info.Decimals.IntVal(),
			PriceUSD:  info.Price.Price.Float(),
			Liquidity: info.Liquidity.Float(),
			Source:    "token_info",
		}, nil
	}
	infoErr := err
	// Don't amplify load on hard upstream failures / rate limits.
	if _, ok := AsRateLimit(infoErr); ok {
		return nil, infoErr
	}
	to := time.Now().Unix()
	from := to - 3600
	candles, err := c.Kline(ctx, DefaultChain, mint, "1m", from, to)
	if err != nil {
		if infoErr != nil {
			return nil, fmt.Errorf("token info: %v; kline: %w", infoErr, err)
		}
		return nil, err
	}
	closeUSD, ok := LastCloseUSD(candles)
	if !ok {
		if infoErr != nil {
			return nil, fmt.Errorf("no price from token info or kline: %w", infoErr)
		}
		return nil, fmt.Errorf("no kline close price for %s", mint)
	}
	q := &Quote{
		Mint:     mint,
		Chain:    DefaultChain,
		PriceUSD: closeUSD,
		Source:   "kline",
	}
	if info != nil {
		q.Symbol = info.Symbol
		q.Name = info.Name
		q.Decimals = info.Decimals.IntVal()
		q.Liquidity = info.Liquidity.Float()
	}
	return q, nil
}

func (c *Client) cachedSOLPrice(ctx context.Context) float64 {
	c.solMu.Lock()
	if c.solPrice > 0 && time.Since(c.solPriceAt) < 20*time.Second {
		p := c.solPrice
		c.solMu.Unlock()
		return p
	}
	c.solMu.Unlock()

	sol, err := c.Quote(ctx, WSOLMint)
	if err != nil || sol == nil || sol.PriceUSD <= 0 {
		c.solMu.Lock()
		p := c.solPrice // stale ok
		c.solMu.Unlock()
		return p
	}
	c.solMu.Lock()
	c.solPrice = sol.PriceUSD
	c.solPriceAt = time.Now()
	c.solMu.Unlock()
	return sol.PriceUSD
}

func (c *Client) QuoteWithSOL(ctx context.Context, mint string) (*Quote, error) {
	q, err := c.Quote(ctx, mint)
	if err != nil {
		return nil, err
	}
	if mint == WSOLMint {
		q.SOLPriceUSD = q.PriceUSD
		c.solMu.Lock()
		c.solPrice = q.PriceUSD
		c.solPriceAt = time.Now()
		c.solMu.Unlock()
		return q, nil
	}
	if p := c.cachedSOLPrice(ctx); p > 0 {
		q.SOLPriceUSD = p
	}
	return q, nil
}

func ProceedsLamports(tokenQuote *Quote, rawAmount uint64, exitBps uint16) (uint64, float64, error) {
	if tokenQuote == nil || tokenQuote.PriceUSD <= 0 {
		return 0, 0, fmt.Errorf("invalid token price")
	}
	if tokenQuote.SOLPriceUSD <= 0 {
		return 0, 0, fmt.Errorf("SOL price unavailable")
	}
	if rawAmount == 0 {
		return 0, 0, fmt.Errorf("amount required")
	}
	if exitBps == 0 {
		exitBps = 10_000
	}
	decimals := tokenQuote.Decimals
	if decimals <= 0 {
		decimals = 6
	}
	human := float64(rawAmount) / math.Pow10(decimals)
	portion := float64(exitBps) / 10_000
	usd := human * tokenQuote.PriceUSD * portion
	lamports := usd / tokenQuote.SOLPriceUSD * 1e9
	if lamports < 0 {
		lamports = 0
	}
	return uint64(math.Round(lamports)), usd, nil
}

type Analyze struct {
	Quote       *Quote  `json:"quote"`
	Change1hPct float64 `json:"change1hPct,omitempty"`
	Open1hUSD   float64 `json:"open1hUsd,omitempty"`
	CloseUSD    float64 `json:"closeUsd,omitempty"`
	Volume1hUSD float64 `json:"volume1hUsd,omitempty"`
	CandleCount int     `json:"candleCount,omitempty"`
	KlineSource string  `json:"klineResolution,omitempty"`
}

func (c *Client) Analyze(ctx context.Context, mint string) (*Analyze, error) {
	type klineRes struct {
		candles []Candle
		err     error
	}
	qCh := make(chan struct {
		q   *Quote
		err error
	}, 1)
	kCh := make(chan klineRes, 1)
	go func() {
		q, err := c.QuoteWithSOL(ctx, mint)
		qCh <- struct {
			q   *Quote
			err error
		}{q, err}
	}()
	go func() {
		to := time.Now().Unix()
		from := to - 3600
		candles, err := c.Kline(ctx, DefaultChain, mint, "1m", from, to)
		kCh <- klineRes{candles, err}
	}()

	qr := <-qCh
	if qr.err != nil {
		return nil, qr.err
	}
	out := &Analyze{Quote: qr.q, CloseUSD: qr.q.PriceUSD}
	kr := <-kCh
	if kr.err == nil && len(kr.candles) > 0 {
		out.CandleCount = len(kr.candles)
		out.KlineSource = "1m"
		out.Open1hUSD = kr.candles[0].Open.Float()
		if close, ok := LastCloseUSD(kr.candles); ok {
			out.CloseUSD = close
		}
		var vol float64
		for _, cndl := range kr.candles {
			vol += cndl.Volume.Float()
		}
		out.Volume1hUSD = vol
		if out.Open1hUSD > 0 {
			out.Change1hPct = (out.CloseUSD - out.Open1hUSD) / out.Open1hUSD * 100
		}
	}
	return out, nil
}
