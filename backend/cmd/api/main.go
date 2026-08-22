package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/1vault/backend/internal/config"
	"github.com/1vault/backend/internal/db"
	"github.com/1vault/backend/internal/handlers"
	"github.com/joho/godotenv"
)

func main() {
	root := findRoot()
	loadEnv(root)

	cfg := config.Load()

	ctx := context.Background()
	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	migDir := filepath.Join(root, "migrations")
	if err := db.Migrate(ctx, pool, migDir); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	api := handlers.NewAPI(cfg, pool)
	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      0, // required for long-lived WebSocket streams
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	go func() {
		log.Printf("[1vault-backend] go http://localhost:%s", cfg.Port)
		log.Printf("[1vault-backend] docs http://localhost:%s/v1/docs", cfg.Port)
		log.Printf("[1vault-backend] root %s", root)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

// loadEnv loads backend/.env even when the process is started from bin/.
func loadEnv(root string) {
	candidates := []string{
		filepath.Join(root, ".env"),
		".env",
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, ".env"),
			filepath.Join(exeDir, "..", ".env"),
		)
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates,
			filepath.Join(wd, ".env"),
			filepath.Join(wd, "..", ".env"),
		)
	}
	seen := map[string]struct{}{}
	for _, p := range candidates {
		p = filepath.Clean(p)
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			if err := godotenv.Load(p); err == nil {
				log.Printf("[1vault-backend] env %s", p)
				return
			}
		}
	}
	_ = godotenv.Load()
}

func findRoot() string {
	starts := []string{}
	if wd, err := os.Getwd(); err == nil {
		starts = append(starts, wd)
	}
	if exe, err := os.Executable(); err == nil {
		starts = append(starts, filepath.Dir(exe), filepath.Dir(filepath.Dir(exe)))
	}
	for _, start := range starts {
		for d := start; d != "/" && d != "." && d != ""; d = filepath.Dir(d) {
			if _, err := os.Stat(filepath.Join(d, "go.mod")); err == nil {
				return d
			}
			// deployed binary next to migrations/docs without go.mod
			if _, err := os.Stat(filepath.Join(d, "migrations")); err == nil {
				if _, err2 := os.Stat(filepath.Join(d, ".env")); err2 == nil || d != start {
					if _, err3 := os.Stat(filepath.Join(d, "docs")); err3 == nil {
						return d
					}
				}
			}
		}
	}
	wd, _ := os.Getwd()
	return wd
}
