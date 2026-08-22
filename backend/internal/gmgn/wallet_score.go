package gmgn

import (
	"context"
	"encoding/json"
	"math"
	"sort"
)

type WalletScoreParams struct {
	LatencyS    float64 // default 3
	SlippagePct float64 // default 0.05 one-sided
	GasUSD      float64 // default 0.2
	Sample      int     // activity rows, default 200 max 400
}

type WalletScore struct {
	Wallet          string         `json:"wallet"`
	Chain           string         `json:"chain"`
	Identity        string         `json:"identity,omitempty"`
	Stats           map[string]any `json:"stats"`
	ActivitySummary map[string]any `json:"activitySummary"`
	StyleTags       []map[string]string `json:"styleTags"`
	TrackRecord     map[string]any `json:"trackRecord"`
	CopyTrade       map[string]any `json:"copyTrade"`
	Backtest        map[string]any `json:"backtest"`
	DevReputation   map[string]any `json:"devReputation,omitempty"`
	SelfDealing     bool           `json:"selfDealing"`
	Verdict         map[string]any `json:"verdict"`
	Skipped         bool           `json:"skipped,omitempty"`
	SkipReason      string         `json:"skipReason,omitempty"`
}

func (c *Client) WalletScore(ctx context.Context, wallet string, p WalletScoreParams) (*WalletScore, error) {
	chain := DefaultChain
	if p.LatencyS <= 0 {
		p.LatencyS = 3
	}
	if p.SlippagePct <= 0 {
		p.SlippagePct = 0.05
	}
	if p.GasUSD <= 0 {
		p.GasUSD = 0.2
	}
	if p.Sample <= 0 {
		p.Sample = 200
	}
	if p.Sample > 400 {
		p.Sample = 400
	}

	statsRaw, err := c.WalletStats(ctx, chain, []string{wallet}, "7d")
	if err != nil {
		return nil, err
	}
	statsRoot, err := decodeMap(statsRaw)
	if err != nil {
		return nil, err
	}
	// Batch responses may wrap as list or keyed map — normalize to one wallet object.
	statsObj := normalizeStatsObj(statsRoot, wallet)

	pnl := asMap(statsObj["pnl_stat"])
	common := asMap(statsObj["common"])
	buy := asInt(mapGet(statsObj, "buy", "buy_count"))
	sell := asInt(mapGet(statsObj, "sell", "sell_count"))
	trades := buy + sell
	tokenNum := asInt(pnl["token_num"])
	if tokenNum <= 0 {
		tokenNum = 1
	}
	dist := map[string]int{
		"gt_5":   asInt(pnl["pnl_gt_5x_num"]),
		"x2_5":   asInt(pnl["pnl_2x_5x_num"]),
		"x0_2":   asInt(pnl["pnl_0x_2x_num"]),
		"n50_0":  asInt(pnl["pnl_nd5_0x_num"]),
		"lt_n50": asInt(pnl["pnl_lt_nd5_num"]),
	}
	realized := asFloat(statsObj["realized_profit"])
	boughtCost := asFloat(mapGet(statsObj, "bought_cost", "total_cost"))
	createdCount := asInt(common["created_token_count"])
	roi := asFloat(mapGet(statsObj, "realized_profit_pnl", "pnl"))
	winrate := asFloat(pnl["winrate"])
	avgHold := asFloat(pnl["avg_holding_period"])
	avgBuy := 0.0
	if buy > 0 {
		avgBuy = boughtCost / float64(buy)
	}
	avgTrade := 0.0
	if sell > 0 {
		avgTrade = realized / float64(sell)
	}
	identity := firstNonEmpty(
		asString(common["twitter_name"]),
		asString(common["name"]),
		asString(common["ens"]),
	)

	out := &WalletScore{
		Wallet: wallet,
		Chain:  chain,
		Identity: identity,
		Stats: map[string]any{
			"realizedProfit": realized,
			"roi":            roi,
			"winrate":        winrate,
			"buy":            buy,
			"sell":           sell,
			"trades":         trades,
			"tokenNum":       tokenNum,
			"boughtCost":     boughtCost,
			"avgBuyUsd":      avgBuy,
			"avgTradeUsd":    avgTrade,
			"avgHoldSeconds": avgHold,
			"createdTokenCount": createdCount,
			"dist":           dist,
		},
	}

	if trades == 0 {
		out.Skipped = true
		out.SkipReason = "No buy/sell activity in the last 7 days"
		out.Verdict = map[string]any{"code": "insufficient_data", "label": "Insufficient data"}
		return out, nil
	}

	acts, err := c.sampleActivity(ctx, chain, wallet, p.Sample)
	if err != nil {
		return nil, err
	}
	summ := summarizeActivity(acts)
	out.ActivitySummary = summ

	var dev map[string]any
	isDev := createdCount > 0 && float64(createdCount) > 0.5*float64(max(1, tokenNum))
	if isDev {
		if raw, err := c.CreatedTokens(ctx, chain, wallet, CreatedTokensParams{}); err == nil {
			dev = scoreDevReputation(ctx, c, chain, raw)
		}
	}

	tn := float64(max(1, tokenNum))
	early := asFloat(summ["entryUnder100k"])
	flip := asFloat(summ["fastFlipRate"])
	tags := styleTags(dev != nil, createdCount, tokenNum, trades, flip, early, avgHold, avgBuy, winrate, realized, dist, asFloat(summ["medianEntryMcap"]))
	out.StyleTags = tags

	tailF := 1 - float64(dist["lt_n50"])/tn
	upsideF := float64(dist["gt_5"]+dist["x2_5"]+dist["x0_2"]) / tn
	roiF := clamp01((roi + 0.05) / 0.35)
	winF := clamp01(winrate / 0.5)
	sizeF := clamp01((tn - 20) / 300)
	trackFacs := map[string]float64{"tail": tailF, "upside": upsideF, "roi": roiF, "win": winF, "size": sizeF}
	trackW := map[string]float64{"tail": 0.34, "upside": 0.28, "roi": 0.16, "win": 0.10, "size": 0.12}
	trackScore := 0.0
	for k, w := range trackW {
		trackScore += w * clamp01(trackFacs[k])
	}
	trackScore = math.Round(trackScore * 100)

	entryF := clamp01(0.12 + (1 - early))
	profitF := clamp01(avgTrade / 80.0)
	holdF := clamp01((1-flip*1.6) * clamp01(avgHold/172800+0.15))
	feasibleF := clamp01(1 - float64(trades)/2500.0)
	edgeF := clamp01(1 - 0.6*early - 0.6*flip)
	copyFacs := map[string]float64{"entry": entryF, "profit": profitF, "hold": holdF, "feasible": feasibleF, "edge": edgeF}
	copyW := map[string]float64{"entry": 0.22, "profit": 0.22, "hold": 0.20, "feasible": 0.18, "edge": 0.18}
	copyScore := 0.0
	for k, w := range copyW {
		copyScore += w * copyFacs[k]
	}
	copyScore = math.Round(copyScore * 100)

	selfDeal := dev != nil
	trackDisp := trackScore
	copyDisp := copyScore
	if selfDeal {
		trackDisp = math.Round(trackScore * 0.45)
		copyDisp = math.Round(copyScore * 0.45)
	}

	walletPct := roi
	if boughtCost > 0 {
		walletPct = realized / boughtCost
	}
	walletPct = clamp(walletPct, -0.9, 3.0)
	if walletPct == 0 {
		walletPct = 0.0001
	}
	driftPerS := 0.015 * (0.3 + 0.7*early)
	drift := p.LatencyS * driftPerS
	slip := 2 * p.SlippagePct
	gasPct := 0.0
	if avgBuy > 0 {
		gasPct = p.GasUSD / avgBuy
	}
	copyPct := walletPct - drift - slip - gasPct
	copy7d := 0.0
	if walletPct != 0 {
		copy7d = realized * (copyPct / walletPct)
	}

	out.SelfDealing = selfDeal
	out.TrackRecord = map[string]any{
		"score":     trackDisp,
		"rawScore":  trackScore,
		"factors":   factorScores(trackFacs, trackW),
	}
	out.CopyTrade = map[string]any{
		"score":    copyDisp,
		"rawScore": copyScore,
		"factors":  factorScores(copyFacs, copyW),
	}
	out.Backtest = map[string]any{
		"assumptions": map[string]any{
			"latencySeconds": p.LatencyS,
			"slippagePct":    p.SlippagePct,
			"gasUsd":         p.GasUSD,
		},
		"walletPct": walletPct,
		"copyPct":   copyPct,
		"drift":     drift,
		"slip":      slip,
		"gasPct":    gasPct,
		"wallet7d":  realized,
		"copy7d":    copy7d,
		"trap":      realized - copy7d,
	}
	if dev != nil {
		out.DevReputation = dev
	}
	out.Verdict = buildVerdict(trackDisp, copyDisp, dev)
	return out, nil
}

func normalizeStatsObj(root map[string]any, wallet string) map[string]any {
	if root == nil {
		return map[string]any{}
	}
	// Already a single stats object
	if root["pnl_stat"] != nil || root["buy"] != nil || root["realized_profit"] != nil {
		return root
	}
	if list := asSlice(root["list"]); len(list) > 0 {
		if m := asMap(list[0]); m != nil {
			return m
		}
	}
	if m := asMap(root[wallet]); m != nil {
		return m
	}
	for _, v := range root {
		if m := asMap(v); m != nil {
			if m["pnl_stat"] != nil || m["realized_profit"] != nil {
				return m
			}
		}
	}
	return root
}

func (c *Client) sampleActivity(ctx context.Context, chain, wallet string, target int) ([]map[string]any, error) {
	target = max(20, min(target, 400))
	var acts []map[string]any
	var cursor string
	for try := 0; try < 4; try++ {
		limit := min(100, target-len(acts))
		raw, err := c.WalletActivity(ctx, chain, wallet, WalletActivityParams{Limit: limit, Cursor: cursor})
		if err != nil {
			return nil, err
		}
		m, err := decodeMap(raw)
		if err != nil {
			return nil, err
		}
		page := asSlice(m["activities"])
		for _, item := range page {
			if hm := asMap(item); hm != nil {
				acts = append(acts, hm)
			}
		}
		cursor = asString(m["next"])
		if cursor == "" || len(page) == 0 || len(acts) >= target {
			break
		}
	}
	if len(acts) > target {
		acts = acts[:target]
	}
	return acts, nil
}

func summarizeActivity(acts []map[string]any) map[string]any {
	var mcaps []float64
	byTok := map[string][]map[string]any{}
	var gasVals []float64
	for _, a := range acts {
		et := eventType(a)
		tok := asMap(a["token"])
		addr := asString(tok["address"])
		byTok[addr] = append(byTok[addr], a)
		if et == "buy" {
			supply := asFloat(tok["total_supply"])
			px := asFloat(a["price_usd"])
			if supply > 0 && px > 0 {
				mcaps = append(mcaps, px*supply)
			}
		}
		if g := asFloat(a["gas_usd"]); g > 0 {
			gasVals = append(gasVals, g)
		}
	}
	sort.Float64s(mcaps)
	entryUnder := 0.0
	medianMC := 0.0
	if len(mcaps) > 0 {
		var under int
		for _, m := range mcaps {
			if m < 100_000 {
				under++
			}
		}
		entryUnder = float64(under) / float64(len(mcaps))
		medianMC = mcaps[len(mcaps)/2]
	}
	pairs, fast := 0, 0
	for _, evs := range byTok {
		sort.Slice(evs, func(i, j int) bool {
			return asFloat(evs[i]["timestamp"]) < asFloat(evs[j]["timestamp"])
		})
		var lastBuy float64
		hasBuy := false
		for _, e := range evs {
			et := eventType(e)
			if et == "buy" {
				lastBuy = asFloat(e["timestamp"])
				hasBuy = true
			} else if et == "sell" && hasBuy {
				pairs++
				if asFloat(e["timestamp"])-lastBuy <= 5 {
					fast++
				}
				hasBuy = false
			}
		}
	}
	fastFlip := 0.0
	if pairs > 0 {
		fastFlip = float64(fast) / float64(pairs)
	}
	avgGas := 0.0
	if len(gasVals) > 0 {
		var s float64
		for _, g := range gasVals {
			s += g
		}
		avgGas = s / float64(len(gasVals))
	}
	return map[string]any{
		"sampled":          len(acts),
		"entryUnder100k":   round4(entryUnder),
		"medianEntryMcap":  round2(medianMC),
		"fastFlipRate":     round4(fastFlip),
		"avgGasUsd":        round4(avgGas),
	}
}

func eventType(a map[string]any) string {
	s := asString(mapGet(a, "event_type", "type"))
	return stringsToLower(s)
}

func stringsToLower(s string) string {
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

func scoreDevReputation(ctx context.Context, c *Client, chain string, raw json.RawMessage) map[string]any {
	m, err := decodeMap(raw)
	if err != nil {
		return nil
	}
	toksAny := asSlice(m["tokens"])
	toks := make([]map[string]any, 0, len(toksAny))
	for _, t := range toksAny {
		if hm := asMap(t); hm != nil {
			toks = append(toks, hm)
		}
	}
	openCount := asInt(m["open_count"])
	innerCount := asInt(m["inner_count"])
	if len(toks) == 0 && openCount == 0 && innerCount == 0 {
		return nil
	}
	alive := 0
	for _, t := range toks {
		if asBool(t["is_open"]) && asFloat(t["pool_liquidity"]) >= 4000 {
			alive++
		}
	}
	total := len(toks)
	rugRate := 0.0
	if total > 0 {
		rugRate = float64(total-alive) / float64(total)
	}
	athMC := asFloat(asMap(m["creator_ath_info"])["ath_mc"])

	sort.Slice(toks, func(i, j int) bool {
		return asFloat(toks[i]["create_timestamp"]) > asFloat(toks[j]["create_timestamp"])
	})
	checked, unsafeN := 0, 0
	n := min(3, len(toks))
	for i := 0; i < n; i++ {
		addr := asString(toks[i]["token_address"])
		if addr == "" {
			continue
		}
		secRaw, err := c.TokenSecurity(ctx, chain, addr)
		if err != nil {
			continue
		}
		sec, err := decodeMap(secRaw)
		if err != nil {
			continue
		}
		checked++
		bad := false
		if stringsToLower(asString(sec["is_honeypot"])) == "yes" {
			bad = true
		} else if chain == "sol" {
			if !asBool(sec["renounced_mint"]) || !asBool(sec["renounced_freeze_account"]) {
				bad = true
			}
		} else if stringsToLower(asString(sec["open_source"])) == "no" {
			bad = true
		}
		if bad {
			unsafeN++
		}
	}
	secRisk := 0.0
	if checked > 0 {
		secRisk = float64(unsafeN) / float64(checked)
	}
	surv := 1 - rugRate
	if total == 0 {
		surv = clamp01(asFloat(m["open_ratio"]))
	}
	athTrack := clamp01((math.Log10(math.Max(1, athMC)) - 5) / 2)
	s := 0.25 + 0.55*surv
	s -= 0.30 * clamp01((float64(innerCount)-50)/950)
	s += 0.15 * athTrack * surv
	s -= 0.35 * secRisk
	return map[string]any{
		"openCount":    openCount,
		"innerCount":   innerCount,
		"analyzed":     total,
		"alive":        alive,
		"rugged":       max(0, total-alive),
		"rugRate":      round3(rugRate),
		"athMc":        athMC,
		"secChecked":   checked,
		"secUnsafe":    unsafeN,
		"secRiskRate":  round3(secRisk),
		"score":        round3(clamp01(s)),
		"score100":     int(math.Round(clamp01(s) * 100)),
	}
}

func styleTags(isDev bool, created, tokenNum, trades int, flip, early, avgHold, avgBuy, winrate, realized float64, dist map[string]int, medianMC float64) []map[string]string {
	var tags []map[string]string
	add := func(emoji, text string) {
		tags = append(tags, map[string]string{"emoji": emoji, "text": text})
	}
	tn := max(1, tokenNum)
	bigWin := float64(dist["gt_5"]+dist["x2_5"]) / float64(tn)
	bigLoss := float64(dist["lt_n50"]) / float64(tn)
	if isDev {
		pctCreated := int(math.Round(float64(created) / float64(tn) * 100))
		add("🏭", "Token creator/Dev wallet — check Dev reputation")
		add("🏗️", "Self-dealer: majority of traded tokens are own launches")
		_ = pctCreated
	}
	if trades >= 2000 {
		add("🤖", "Bot/Quant: very high 7D trade count")
	}
	if flip >= 0.3 {
		add("⚡", "Flash flipper: many positions round-trip within 5s")
	}
	if !isDev && early >= 0.8 {
		add("🎯", "Sniper: most entries under $100k mcap")
	}
	if avgHold >= 5*86400 && trades < 200 {
		add("💎", "Diamond hands: holds long, trades rarely")
	}
	if avgBuy >= 5000 {
		add("🐋", "Whale: large average position size")
	}
	if !isDev && winrate >= 0.65 && trades >= 15 {
		add("🏆", "High win-rate")
	}
	if avgHold > 0 && avgHold < 3600 && flip < 0.3 && trades >= 30 {
		add("🐇", "Quick-draw: short average hold")
	}
	if !isDev && medianMC > 0 && medianMC < 30000 {
		add("🔦", "Obscure hunter: very low median entry mcap")
	}
	if realized > 20000 && bigLoss <= 0.05 {
		add("📈", "True skill: net profitable with few big losses")
	} else if bigLoss >= 0.3 && realized < 0 {
		add("🩸", "Bag holder: many >50% losses")
	} else if bigWin >= 0.02 && winrate < 0.35 && realized > 0 {
		add("🎰", "Gambler: low win-rate, carried by big hits")
	}
	if trades < 60 && realized > 0 && flip < 0.1 {
		add("🐌", "Slow & steady — easiest to copy")
	}
	if len(tags) == 0 {
		add("🧭", "Regular trader: no standout style tags")
	}
	return tags
}

func factorScores(facs, weights map[string]float64) []map[string]any {
	keys := make([]string, 0, len(facs))
	for k := range facs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]map[string]any, 0, len(keys))
	for _, k := range keys {
		out = append(out, map[string]any{
			"key":    k,
			"score":  int(math.Round(100 * clamp01(facs[k]))),
			"weight": weights[k],
		})
	}
	return out
}

func buildVerdict(track, copy float64, dev map[string]any) map[string]any {
	if dev != nil {
		ds := asInt(dev["score100"])
		if ds == 0 {
			ds = int(math.Round(asFloat(dev["score"]) * 100))
		}
		if ds < 40 {
			return map[string]any{"code": "dev_avoid", "label": "Token-creator wallet with weak Dev reputation — avoid new launches"}
		}
		return map[string]any{"code": "dev_caution", "label": "Token-creator wallet — check survival/security before following launches"}
	}
	if track >= 65 && copy < 35 {
		return map[string]any{"code": "high_skill_hard_copy", "label": "High track record, low copy-tradeability"}
	}
	if track >= 60 && copy >= 55 {
		return map[string]any{"code": "copy_worthy", "label": "Genuine track record and high copy-tradeability"}
	}
	if track < 40 {
		return map[string]any{"code": "weak", "label": "Weak track record — not recommended"}
	}
	return map[string]any{"code": "watch", "label": "Middling track record — verify with small size"}
}

func firstNonEmpty(xs ...string) string {
	for _, s := range xs {
		if s != "" {
			return s
		}
	}
	return ""
}

func clamp(x, lo, hi float64) float64 {
	if x < lo {
		return lo
	}
	if x > hi {
		return hi
	}
	return x
}

func round2(v float64) float64  { return math.Round(v*100) / 100 }
func round3(v float64) float64  { return math.Round(v*1000) / 1000 }
func round4(v float64) float64  { return math.Round(v*10000) / 10000 }

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
