package db

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	databaseURL = normalizeDatabaseURL(databaseURL)

	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}

	host := cfg.ConnConfig.Host
	port := cfg.ConnConfig.Port
	remote := needsTLS(databaseURL, host)
	pooler := isTransactionPooler(host, port)

	if remote {
		cfg.ConnConfig.TLSConfig = &tls.Config{
			MinVersion:         tls.VersionTLS12,
			ServerName:         tlsServerName(host),
			InsecureSkipVerify: !truthy(os.Getenv("DATABASE_SSL_VERIFY")),
		}
		if cfg.ConnConfig.TLSConfig.InsecureSkipVerify {
			log.Printf("[db] TLS on (encrypt); cert verify skipped — set DATABASE_SSL_VERIFY=1 to enforce")
		}

		// Supabase pooler limits are low; keep pool tiny.
		cfg.MaxConns = int32(envInt("DB_MAX_CONNS", 3))
		cfg.MinConns = int32(envInt("DB_MIN_CONNS", 0))
		cfg.ConnConfig.ConnectTimeout = 20 * time.Second
	} else {
		cfg.MaxConns = 32
		cfg.MinConns = 8
		cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	}

	// PgBouncer / Supabase transaction pooler multiplexes backend sessions.
	// pgx's named prepared-statement cache then hits SQLSTATE 42P05
	// ("prepared statement … already exists"). Simple protocol avoids PREPARE.
	if pooler || truthy(os.Getenv("DATABASE_SIMPLE_PROTOCOL")) {
		cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
		log.Printf("[db] query mode=simple_protocol (transaction pooler / PgBouncer safe)")
	}

	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = 30 * time.Second

	log.Printf("[db] connecting host=%s port=%d maxConns=%d", host, port, cfg.MaxConns)

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}

// normalizeDatabaseURL fixes common Supabase Railway pitfalls:
// - session pooler :5432 → transaction pooler :6543 (avoids EMAXCONNSESSION)
// - ensure sslmode=require
func normalizeDatabaseURL(raw string) string {
	raw = strings.TrimSpace(raw)
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return raw
	}
	host := strings.ToLower(u.Hostname())
	changed := false

	if strings.Contains(host, "pooler.supabase.") {
		port := u.Port()
		if port == "" || port == "5432" {
			u.Host = net.JoinHostPort(u.Hostname(), "6543")
			changed = true
			log.Printf("[db] supabase session :5432 → transaction :6543")
		}
	}

	q := u.Query()
	if q.Get("sslmode") == "" && (strings.Contains(host, "supabase.") || needsTLS(raw, host)) {
		q.Set("sslmode", "require")
		u.RawQuery = q.Encode()
		changed = true
	}

	if !changed {
		return raw
	}
	return u.String()
}

// isTransactionPooler detects Supabase/PgBouncer transaction mode (port 6543
// or pooler.supabase host). Session pooler (:5432) keeps prepared statements
// per backend session; transaction mode does not.
func isTransactionPooler(host string, port uint16) bool {
	h := strings.ToLower(host)
	if strings.Contains(h, "pooler.supabase.") {
		return true
	}
	if port == 6543 {
		return true
	}
	return false
}

func needsTLS(databaseURL, host string) bool {
	u := strings.ToLower(databaseURL)
	h := strings.ToLower(host)
	if strings.Contains(u, "sslmode=disable") {
		return false
	}
	if strings.Contains(u, "supabase.") || strings.Contains(h, "supabase.") {
		return true
	}
	if strings.Contains(u, "sslmode=require") ||
		strings.Contains(u, "sslmode=verify-ca") ||
		strings.Contains(u, "sslmode=verify-full") {
		return true
	}
	return false
}

func tlsServerName(host string) string {
	host = strings.TrimSpace(host)
	if h, _, err := net.SplitHostPort(host); err == nil {
		return h
	}
	return host
}

func envInt(k string, def int) int {
	v := strings.TrimSpace(os.Getenv(k))
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return def
	}
	return n
}

func truthy(v string) bool {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func Migrate(ctx context.Context, pool *pgxpool.Pool, dir string) error {
	if _, err := pool.Exec(ctx, `CREATE EXTENSION IF NOT EXISTS pgcrypto`); err != nil {
		return fmt.Errorf("pgcrypto: %w", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	for _, name := range files {
		b, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return err
		}
		if _, err := pool.Exec(ctx, string(b)); err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
	}
	return nil
}
