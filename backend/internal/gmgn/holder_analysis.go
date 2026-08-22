package gmgn

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"time"
)

type HolderAnalysis struct {
	Mint           string         `json:"mint"`
	Chain          string         `json:"chain"`
	MarketCapUSD   float64        `json:"marketCapUsd"`
	PriceUSD       float64        `json:"priceUsd"`
	Concentration  map[string]any `json:"concentration"`
	SupplyBuckets  map[string]any `json:"supplyBuckets"`
	Risk           map[string]any `json:"risk"`
	Quality        map[string]any `json:"quality"`
	Related        map[string]any `json:"related"`
	Dev            map[string]any `json:"dev"`
	BuyingPower    map[string]any `json:"buyingPower"`
	Rating         map[string]any `json:"rating"`
	TopHolders     []map[string]any `json:"topHolders,omitempty"`
	CreatedTokens  any            `json:"createdTokens,omitempty"`
	SampleSize     int            `json:"sampleSize"`
}

func (c *Client) HolderAnalysis(ctx context.Context, mint string) (*HolderAnalysis, error) {
	chain := DefaultChain
	holdersRaw, err := c.TokenHolders(ctx, chain, mint, HolderListParams{Limit: 100, OrderBy: "amount_percentage", Direction: "desc"})
	if err != nil {
		return nil, err
	}
	devsRaw, err := c.TokenHolders(ctx, chain, mint, HolderListParams{Limit: 20, OrderBy: "amount_percentage", Direction: "desc", Tag: "dev"})
	if err != nil {
		return nil, err
	}
	holders := unwrapHolderList(holdersRaw)
	devs := unwrapHolderList(devsRaw)
	now := time.Now().Unix()

	var normal, burn, dex []map[string]any
	for _, h := range holders {
		switch asInt(h["addr_type"]) {
		case 1:
			burn = append(burn, h)
		case 2:
			dex = append(dex, h)
		default:
			normal = append(normal, h)
		}
	}

	var supplyList, priceList []float64
	for _, h := range normal {
		bal := asFloat(h["balance"])
		pct := asFloat(h["amount_percentage"])
		usd := asFloat(h["usd_value"])
		if pct > 0 && bal > 0 {
			supplyList = append(supplyList, bal/pct)
		}
		if bal > 0 && usd > 0 {
			priceList = append(priceList, usd/bal)
		}
	}
	totalSupply := median(supplyList)
	if totalSupply <= 0 {
		totalSupply = 1_000_000_000
	}
	curPrice := median(priceList)
	curMC := totalSupply * curPrice

	sumPct := func(list []map[string]any) float64 {
		var s float64
		for _, h := range list {
			s += asFloat(h["amount_percentage"])
		}
		return s
	}
	topN := func(n int) float64 {
		var s float64
		for i, h := range holders {
			if i >= n {
				break
			}
			s += asFloat(h["amount_percentage"])
		}
		return s
	}

	var airdrop, bundlers, rats, snipers, fresh, wash, smart, kol, whales, diamond []map[string]any
	for _, h := range normal {
		mtags := stringTags(h["maker_token_tags"])
		tags := stringTags(h["tags"])
		if asInt(h["buy_tx_count_cur"]) == 0 && asFloat(h["balance"]) > 0 {
			airdrop = append(airdrop, h)
		}
		if hasTag(mtags, "bundler") {
			bundlers = append(bundlers, h)
		}
		if hasTag(mtags, "rat_trader") {
			rats = append(rats, h)
		}
		if hasTag(mtags, "sniper") {
			snipers = append(snipers, h)
		}
		if hasTag(tags, "fresh_wallet") {
			fresh = append(fresh, h)
		}
		if hasTag(tags, "wash_trader") {
			wash = append(wash, h)
		}
		if hasTag(tags, "smart_degen") || hasTag(tags, "pump_smart") {
			smart = append(smart, h)
		}
		if hasTag(tags, "kol") || hasTag(tags, "renowned") {
			kol = append(kol, h)
		}
		if hasTag(mtags, "whale") {
			whales = append(whales, h)
		}
		if asInt(h["sell_tx_count_cur"]) == 0 && asFloat(h["balance"]) > 0 {
			diamond = append(diamond, h)
		}
	}

	riskSet := map[string]struct{}{}
	for _, group := range [][]map[string]any{bundlers, rats, snipers, fresh, wash} {
		for _, h := range group {
			riskSet[asString(h["address"])] = struct{}{}
		}
	}
	var riskPct float64
	for _, h := range normal {
		if _, ok := riskSet[asString(h["address"])]; ok {
			riskPct += asFloat(h["amount_percentage"])
		}
	}
	airdropPct := sumPct(airdrop)
	normalPct := sumPct(normal)
	badSet := map[string]struct{}{}
	for _, h := range airdrop {
		badSet[asString(h["address"])] = struct{}{}
	}
	for a := range riskSet {
		badSet[a] = struct{}{}
	}
	var badPct float64
	for _, h := range normal {
		if _, ok := badSet[asString(h["address"])]; ok {
			badPct += asFloat(h["amount_percentage"])
		}
	}
	healthyPct := math.Max(normalPct-badPct, 0)
	healthyRatio := 0.0
	if normalPct > 0 {
		healthyRatio = healthyPct / normalPct
	}

	// related wallets
	fromMap := map[string][]map[string]any{}
	for _, h := range normal {
		nt := asMap(h["native_transfer"])
		fa := asString(nt["from_address"])
		if fa != "" {
			fromMap[fa] = append(fromMap[fa], h)
		}
	}
	var sameSrcGroups int
	var sameSrcWallets int
	var sameSrcPct float64
	related := map[string]struct{}{}
	for _, ws := range fromMap {
		if len(ws) < 2 {
			continue
		}
		sameSrcGroups++
		sameSrcWallets += len(ws)
		for _, h := range ws {
			sameSrcPct += asFloat(h["amount_percentage"])
			related[asString(h["address"])] = struct{}{}
		}
	}
	const window int64 = 1800
	bucket := map[int64][]map[string]any{}
	for _, h := range normal {
		nt := asMap(h["native_transfer"])
		ts := int64(asFloat(nt["timestamp"]))
		if ts <= 0 {
			continue
		}
		k := (ts / window) * window
		bucket[k] = append(bucket[k], h)
	}
	var winPct float64
	for _, ws := range bucket {
		if len(ws) < 2 {
			continue
		}
		for _, h := range ws {
			winPct += asFloat(h["amount_percentage"])
			related[asString(h["address"])] = struct{}{}
		}
	}
	var relatedPct, relatedUSD float64
	for _, h := range normal {
		if _, ok := related[asString(h["address"])]; ok {
			relatedPct += asFloat(h["amount_percentage"])
			relatedUSD += asFloat(h["usd_value"])
		}
	}

	creator := map[string]any(nil)
	for _, d := range devs {
		if hasTag(stringTags(d["maker_token_tags"]), "creator") {
			creator = d
			break
		}
	}
	var created any
	if creator != nil {
		if raw, err := c.CreatedTokens(ctx, chain, asString(creator["address"]), CreatedTokensParams{OrderBy: "market_cap", Direction: "desc"}); err == nil {
			created = jsonRawOrNil(raw)
		}
	}
	devRealized := 0.0
	devHolding := 0
	var devHoldPct float64
	for _, d := range devs {
		devRealized += asFloat(d["realized_profit"])
		if asFloat(d["balance"]) >= 1 {
			devHolding++
			devHoldPct += asFloat(d["amount_percentage"])
		}
	}

	nativePrice := 160.0
	nativeDenom := 1e9
	var zeroN, lowN, midN, highN int
	var zeroP, lowP, midP, highP float64
	for _, h := range normal {
		usd := asFloat(h["native_balance"]) / nativeDenom * nativePrice
		pct := asFloat(h["amount_percentage"])
		switch {
		case usd == 0:
			zeroN++
			zeroP += pct
		case usd <= 200:
			lowN++
			lowP += pct
		case usd <= 1200:
			midN++
			midP += pct
		default:
			highN++
			highP += pct
		}
	}

	var biggestPct float64
	for _, h := range normal {
		if p := asFloat(h["amount_percentage"]); p > biggestPct {
			biggestPct = p
		}
	}

	var dangers, warns, goods []string
	if biggestPct > 0.15 {
		dangers = append(dangers, fmt.Sprintf("Largest wallet holds %.1f%% — extreme concentration", biggestPct*100))
	}
	if sumPct(rats) > 0.05 {
		dangers = append(dangers, fmt.Sprintf("Rat traders hold %.1f%% — dump risk", sumPct(rats)*100))
	}
	if creator != nil {
		toOut := asMap(creator["token_transfer_out"])
		toAddr := asString(toOut["address"])
		for _, h := range holders {
			if asString(h["address"]) == toAddr && toAddr != "" {
				dangers = append(dangers, "Dev transferred chips to an internal wallet")
				break
			}
		}
	}
	if devHolding > 0 && devHoldPct > 0.01 {
		warns = append(warns, fmt.Sprintf("Dev still holds %.2f%%", devHoldPct*100))
	}
	if airdropPct > 0.15 {
		warns = append(warns, fmt.Sprintf("Airdrop supply %.1f%% — opaque origin", airdropPct*100))
	}
	if riskPct > 0.3 {
		warns = append(warns, fmt.Sprintf("Risk wallets hold %.1f%% — low chip quality", riskPct*100))
	}
	if relatedPct > 0.1 {
		warns = append(warns, fmt.Sprintf("Linked wallets (%d) hold %.1f%%", len(related), relatedPct*100))
	}
	ratingCode, ratingText := "normal", "Normal"
	switch {
	case len(dangers) > 0:
		ratingCode, ratingText = "not_recommended", "Not Recommended"
	case len(warns) >= 2:
		ratingCode, ratingText = "caution", "Caution"
	case len(warns) == 1:
		ratingCode, ratingText = "light", "Light Position"
	}
	if sumPct(burn) > 0.05 {
		goods = append(goods, fmt.Sprintf("Burned %.1f%% permanently", sumPct(burn)*100))
	}
	if len(kol) > 0 {
		goods = append(goods, fmt.Sprintf("%d KOL(s) holding (%.2f%%)", len(kol), sumPct(kol)*100))
	}
	if sumPct(diamond) > 0.4 {
		goods = append(goods, fmt.Sprintf("Diamond hands hold %.1f%%", sumPct(diamond)*100))
	}

	topHolders := make([]map[string]any, 0, 5)
	sortedNormal := append([]map[string]any(nil), normal...)
	sort.Slice(sortedNormal, func(i, j int) bool {
		return asFloat(sortedNormal[i]["amount_percentage"]) > asFloat(sortedNormal[j]["amount_percentage"])
	})
	for i, h := range sortedNormal {
		if i >= 5 {
			break
		}
		topHolders = append(topHolders, map[string]any{
			"address":           asString(h["address"]),
			"amountPercentage":  asFloat(h["amount_percentage"]),
			"usdValue":          asFloat(h["usd_value"]),
			"avgCost":           asFloat(h["avg_cost"]),
			"unrealizedPnl":     asFloat(h["unrealized_pnl"]),
			"tags":              stringTags(h["tags"]),
			"makerTokenTags":    stringTags(h["maker_token_tags"]),
			"buyTxCount":        asInt(h["buy_tx_count_cur"]),
			"sellTxCount":       asInt(h["sell_tx_count_cur"]),
			"startHoldingAt":    asInt(h["start_holding_at"]),
			"holdingAgeSeconds": max64(0, now-int64(asFloat(h["start_holding_at"]))),
		})
	}

	creatorAddr := ""
	if creator != nil {
		creatorAddr = asString(creator["address"])
	}
	return &HolderAnalysis{
		Mint:         mint,
		Chain:        chain,
		MarketCapUSD: curMC,
		PriceUSD:     curPrice,
		SampleSize:   len(holders),
		Concentration: map[string]any{
			"top10Pct":         topN(10) * 100,
			"top20Pct":         topN(20) * 100,
			"largestWalletPct": biggestPct * 100,
		},
		SupplyBuckets: map[string]any{
			"burnPct":      sumPct(burn) * 100,
			"dexPct":       sumPct(dex) * 100,
			"normalPct":    normalPct * 100,
			"healthyRatio": healthyRatio,
			"healthyPct":   healthyPct * 100,
		},
		Risk: map[string]any{
			"airdropWallets": len(airdrop),
			"airdropPct":     airdropPct * 100,
			"riskWallets":    len(riskSet),
			"riskPct":        riskPct * 100,
			"bundlers":       len(bundlers),
			"ratTraders":     len(rats),
			"snipers":        len(snipers),
			"freshWallets":   len(fresh),
			"washTraders":    len(wash),
		},
		Quality: map[string]any{
			"smartMoney":   len(smart),
			"smartPct":     sumPct(smart) * 100,
			"kol":          len(kol),
			"kolPct":       sumPct(kol) * 100,
			"whales":       len(whales),
			"whalePct":     sumPct(whales) * 100,
			"diamondHands": len(diamond),
			"diamondPct":   sumPct(diamond) * 100,
		},
		Related: map[string]any{
			"wallets":           len(related),
			"holdPct":           relatedPct * 100,
			"usdValue":          relatedUSD,
			"sameSourceGroups":  sameSrcGroups,
			"sameSourceWallets": sameSrcWallets,
			"sameSourcePct":     sameSrcPct * 100,
			"timeWindowPct":     winPct * 100,
		},
		Dev: map[string]any{
			"wallets":        len(devs),
			"holdingWallets": devHolding,
			"holdingPct":     devHoldPct * 100,
			"realizedProfit": devRealized,
			"creatorAddress": creatorAddr,
		},
		BuyingPower: map[string]any{
			"zeroNative": map[string]any{"wallets": zeroN, "holdPct": zeroP * 100},
			"low":        map[string]any{"wallets": lowN, "holdPct": lowP * 100},
			"mid":        map[string]any{"wallets": midN, "holdPct": midP * 100},
			"high":       map[string]any{"wallets": highN, "holdPct": highP * 100},
		},
		Rating: map[string]any{
			"code":      ratingCode,
			"label":     ratingText,
			"dangers":   dangers,
			"warnings":  warns,
			"positives": goods,
		},
		TopHolders:    topHolders,
		CreatedTokens: created,
	}, nil
}

func median(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	cp := append([]float64(nil), xs...)
	sort.Float64s(cp)
	return cp[len(cp)/2]
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func jsonRawOrNil(raw []byte) any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	return json.RawMessage(raw)
}
