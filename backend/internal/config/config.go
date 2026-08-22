package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port              string
	DatabaseURL       string
	JWTSecret         string
	JWTAccessTTL      time.Duration
	JWTRefreshTTLDays int
	CORSOrigins       []string
	DefaultCluster    string
	TwitterClientID   string
	TwitterSecret     string
	TwitterCallback   string
	FrontendURL       string
	AdminIngestKey    string
	IndexerIngestURL  string
	KeeperKeypair     string
	DevnetRPCURL      string
	MainnetRPCURL     string
	GMGNAPIKey        string
	GMGNBaseURL       string
	GMGNPrivateKey    string
	GMGNPassphrase    string
	DexBaseURL        string
	DexWSURL          string
}

func Load() Config {
	ttl := parseDuration(getenv("JWT_ACCESS_TTL", "15m"), 15*time.Minute)
	return Config{
		Port:              getenv("PORT", "3090"),
		DatabaseURL:       mustEnv("DATABASE_URL"),
		JWTSecret:         mustEnv("JWT_SECRET"),
		JWTAccessTTL:      ttl,
		JWTRefreshTTLDays: getenvInt("JWT_REFRESH_TTL_DAYS", 30),
		CORSOrigins:       splitCSV(getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:5174")),
		DefaultCluster:    getenv("DEFAULT_CLUSTER", "devnet"),
		TwitterClientID:   os.Getenv("TWITTER_CLIENT_ID"),
		TwitterSecret:     os.Getenv("TWITTER_CLIENT_SECRET"),
		TwitterCallback:   getenv("TWITTER_CALLBACK_URL", "http://localhost:3090/v1/auth/twitter/callback"),
		FrontendURL:       getenv("FRONTEND_URL", "http://localhost:3000"),
		AdminIngestKey:    os.Getenv("ADMIN_INGEST_KEY"),
		IndexerIngestURL:  getenv("INDEXER_INGEST_URL", "http://127.0.0.1:3001/api/ingest"),
		KeeperKeypair:     os.Getenv("KEEPER_KEYPAIR"),
		DevnetRPCURL:      os.Getenv("DEVNET_RPC_URL"),
		MainnetRPCURL:     os.Getenv("MAINNET_RPC_URL"),
		GMGNAPIKey:        strings.TrimSpace(os.Getenv("GMGN_API_KEY")),
		GMGNBaseURL:       getenv("GMGN_BASE_URL", "https://openapi.gmgn.ai"),
		GMGNPrivateKey:    os.Getenv("GMGN_PRIVATE_KEY"),
		GMGNPassphrase:    os.Getenv("GMGN_PRIVATE_KEY_PASSPHRASE"),
		DexBaseURL:        getenv("DEX_BASE_URL", "https://api.dexscreener.com"),
		DexWSURL:          getenv("DEX_WS_URL", "wss://api.dexscreener.com"),
	}
}

func (c Config) GMGNConfigured() bool {
	return c.GMGNAPIKey != ""
}

func (c Config) TwitterConfigured() bool {
	return c.TwitterClientID != "" && c.TwitterSecret != ""
}

func getenv(k, def string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return def
}

func mustEnv(k string) string {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		panic("missing required env: " + k)
	}
	return v
}

func getenvInt(k string, def int) int {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func parseDuration(s string, def time.Duration) time.Duration {
	d, err := time.ParseDuration(s)
	if err != nil {
		return def
	}
	return d
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
