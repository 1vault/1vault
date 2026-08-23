package db

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}

	host := cfg.ConnConfig.Host
	serverName := tlsServerName(host)
	remote := needsTLS(databaseURL, host)

	if remote {
		tlsCfg, err := buildTLSConfig(serverName)
		if err != nil {
			return nil, err
		}
		cfg.ConnConfig.TLSConfig = tlsCfg

		// Supabase session pooler (5432) is capped (~15). Keep app pool tiny.
		// Prefer transaction pooler :6543 in DATABASE_URL when possible.
		cfg.MaxConns = int32(envInt("DB_MAX_CONNS", 4))
		cfg.MinConns = int32(envInt("DB_MIN_CONNS", 0))
		cfg.ConnConfig.ConnectTimeout = 20 * time.Second
		if port := cfg.ConnConfig.Port; port == 5432 && strings.Contains(strings.ToLower(host), "pooler.supabase.") {
			log.Printf("[db] supabase session pooler :5432 — use :6543 (transaction) if you hit max clients")
		}
	} else {
		cfg.MaxConns = 32
		cfg.MinConns = 8
		cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	}

	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = 30 * time.Second

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

func buildTLSConfig(serverName string) (*tls.Config, error) {
	roots, err := loadRootCAs()
	if err != nil {
		return nil, fmt.Errorf("tls root cas: %w", err)
	}

	cfg := &tls.Config{
		MinVersion: tls.VersionTLS12,
		ServerName: serverName,
		RootCAs:    roots,
	}

	// Escape hatch only — Railway/distroless without CA bundle.
	if truthy(os.Getenv("DATABASE_SSL_INSECURE")) {
		log.Printf("[db] WARNING: DATABASE_SSL_INSECURE=1 — TLS verify disabled")
		cfg.InsecureSkipVerify = true
	}
	return cfg, nil
}

func loadRootCAs() (*x509.CertPool, error) {
	roots, err := x509.SystemCertPool()
	if err != nil || roots == nil {
		roots = x509.NewCertPool()
	}
	loaded := err == nil && roots != nil
	for _, p := range []string{
		"/etc/ssl/certs/ca-certificates.crt",
		"/etc/pki/tls/certs/ca-bundle.crt",
		"/etc/ssl/cert.pem",
	} {
		b, readErr := os.ReadFile(p)
		if readErr != nil {
			continue
		}
		if roots.AppendCertsFromPEM(b) {
			loaded = true
		}
	}
	if loaded {
		return roots, nil
	}
	if truthy(os.Getenv("DATABASE_SSL_INSECURE")) {
		return x509.NewCertPool(), nil
	}
	return nil, fmt.Errorf("no CA certificates found (install ca-certificates or set DATABASE_SSL_INSECURE=1)")
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
