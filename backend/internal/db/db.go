package db

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	// Supabase (and most cloud Postgres) require TLS. When we set TLSConfig
	// ourselves, Go needs ServerName for SNI — otherwise:
	// "tls: either ServerName or InsecureSkipVerify must be specified".
	if needsTLS(databaseURL, cfg.ConnConfig.Host) {
		cfg.ConnConfig.TLSConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
			ServerName: tlsServerName(cfg.ConnConfig.Host),
		}
		// Remote pooler (Supabase): fewer warm conns, longer dial — Railway ↔ Sydney is slow.
		cfg.MaxConns = 16
		cfg.MinConns = 1
		cfg.ConnConfig.ConnectTimeout = 15 * time.Second
	} else {
		cfg.MaxConns = 32
		cfg.MinConns = 8
		cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	}
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 10 * time.Minute
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
