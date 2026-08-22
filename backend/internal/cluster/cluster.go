package cluster

import (
	"os"
	"strings"
)

type Cluster string

const (
	Devnet  Cluster = "devnet"
	Mainnet Cluster = "mainnet-beta"
)

// DexProgramEntry is one PROGRAM_IDS slot in priority order (1 = highest).
type DexProgramEntry struct {
	Rank        int    `json:"rank"`
	ProgramID   string `json:"programId"`
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
}

type Addresses struct {
	Cluster           Cluster `json:"cluster"`
	ProgramID         string  `json:"programId"`
	ProtocolConfig    string  `json:"protocolConfig"`
	PlatformWallet    string  `json:"platformWallet"`
	DegenFeeWallet    string  `json:"strategiesFeeWallet"`
	LicenseMint       string  `json:"licenseMint"`
	WsolMint          string  `json:"wsolMint"`
	LicenseLockAmount string  `json:"licenseLockAmount"`
	PerformanceFeeBps int     `json:"performanceFeeBps"`
	RPCURL            string  `json:"rpcUrl"`
	// AllowedDexPrograms from PROGRAM_IDS (CSV). Order is priority; first = default execute_trade.
	AllowedDexPrograms []string          `json:"allowedDexPrograms,omitempty"`
	AllowedDexProgram  string            `json:"allowedDexProgram,omitempty"`
	DexPrograms        []DexProgramEntry `json:"dexPrograms,omitempty"`
}

const wsol = "So11111111111111111111111111111111111111112"

func Parse(raw string) (Cluster, bool) {
	v := strings.ToLower(strings.TrimSpace(raw))
	switch v {
	case "devnet":
		return Devnet, true
	case "mainnet", "mainnet-beta":
		return Mainnet, true
	default:
		return "", false
	}
}

func AddressesFor(c Cluster, devnetRPC, mainnetRPC string) Addresses {
	dexes := parseProgramIDs()
	defaultDex := ""
	if len(dexes) > 0 {
		defaultDex = dexes[0]
	}
	// Optional single override wins as the default execute_trade program.
	if v := strings.TrimSpace(os.Getenv("ALLOWED_DEX_PROGRAM")); v != "" {
		defaultDex = v
		if !containsPK(dexes, v) {
			dexes = append([]string{v}, dexes...)
		}
	}
	labeled := labelDexPrograms(dexes)

	if c == Devnet {
		rpc := devnetRPC
		if rpc == "" {
			rpc = "https://api.devnet.solana.com"
		}
		return Addresses{
			Cluster:            Devnet,
			ProgramID:          "2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP",
			ProtocolConfig:     "2WXErzw6DEZsVQ2QD3oTcwumCknpzhLf99akKu7qweQR",
			PlatformWallet:     "9YajdkrkvyzDm57bPSijfy6sFNj9wuqQtYmuYUXZtPDx",
			DegenFeeWallet:     "EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286",
			LicenseMint:        "4R9AHfF2wE8X8252Swra3ncvKVDe3m73k8EfP99zz6YK",
			WsolMint:           wsol,
			LicenseLockAmount:  "1000000000000",
			PerformanceFeeBps:  2000,
			RPCURL:             rpc,
			AllowedDexPrograms: dexes,
			AllowedDexProgram:  defaultDex,
			DexPrograms:        labeled,
		}
	}
	rpc := mainnetRPC
	if rpc == "" {
		rpc = "https://api.mainnet-beta.solana.com"
	}
	return Addresses{
		Cluster:            Mainnet,
		ProgramID:          envOr("MAINNET_PROGRAM_ID", "11111111111111111111111111111111"),
		ProtocolConfig:     envOr("MAINNET_PROTOCOL_CONFIG", "11111111111111111111111111111111"),
		PlatformWallet:     envOr("MAINNET_PLATFORM_WALLET", "11111111111111111111111111111111"),
		DegenFeeWallet:     envOr("MAINNET_STRATEGIES_FEE_WALLET", envOr("MAINNET_DEGEN_FEE_WALLET", "11111111111111111111111111111111")),
		LicenseMint:        envOr("MAINNET_LICENSE_MINT", "11111111111111111111111111111111"),
		WsolMint:           wsol,
		LicenseLockAmount:  "1000000000000",
		PerformanceFeeBps:  2000,
		RPCURL:             rpc,
		AllowedDexPrograms: dexes,
		AllowedDexProgram:  defaultDex,
		DexPrograms:        labeled,
	}
}

// Known PROGRAM_IDS labels (priority order from product env).
var knownDexMeta = map[string]struct{ Name, Description string }{
	"6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": {
		"Pump.fun Bonding Curve", "early stage <40K MC, freshest signal",
	},
	"pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA": {
		"Pump.fun AMM", "post-graduation pool",
	},
	"pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ": {
		"Pump.fun Fee", "creator fee events → trend signal",
	},
	"dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN": {
		"Meteora DBC", "dynamic bonding curve, alt launch",
	},
	"675kPX9MHTjS2zt1qfr1iGq9WZ3YdExgkt1PyfuzMdud": {
		"Raydium AMM v4", "graduated migration to Raydium",
	},
	"LBUZKhRxPF3XUpBCj4kGkTq6v4D4ew3Efr2E1V9LG8K": {
		"Meteora DLMM", "graduated migration to DLMM",
	},
}

func labelDexPrograms(ids []string) []DexProgramEntry {
	out := make([]DexProgramEntry, 0, len(ids))
	for i, id := range ids {
		e := DexProgramEntry{Rank: i + 1, ProgramID: id}
		if m, ok := knownDexMeta[id]; ok {
			e.Name = m.Name
			e.Description = m.Description
		}
		out = append(out, e)
	}
	return out
}

func parseProgramIDs() []string {
	raw := strings.TrimSpace(os.Getenv("PROGRAM_IDS"))
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := map[string]struct{}{}
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}

func containsPK(list []string, pk string) bool {
	for _, v := range list {
		if v == pk {
			return true
		}
	}
	return false
}

func RedactRPC(url string) string {
	if i := strings.Index(strings.ToLower(url), "api-key="); i >= 0 {
		rest := url[i+8:]
		if j := strings.Index(rest, "&"); j >= 0 {
			return url[:i+8] + "***" + rest[j:]
		}
		return url[:i+8] + "***"
	}
	return url
}

func envOr(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}
