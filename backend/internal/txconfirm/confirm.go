package txconfirm

import (
	"context"
	"sync"
	"time"

	"github.com/1vault/backend/internal/indexer"
	"github.com/1vault/backend/internal/txprep"
)

type IngestInfo struct {
	OK     bool   `json:"ok"`
	Events int    `json:"events,omitempty"`
	Error  string `json:"error,omitempty"`
}

type Result struct {
	Signature string      `json:"signature"`
	Status    string      `json:"status"`
	Slot      uint64      `json:"slot,omitempty"`
	Err       any         `json:"err,omitempty"`
	Ingest    *IngestInfo `json:"ingest,omitempty"`
}

type Tracker struct {
	mu    sync.RWMutex
	items map[string]Result
}

var DefaultTracker = &Tracker{items: map[string]Result{}}

func (t *Tracker) Set(sig string, r Result) {
	t.mu.Lock()
	t.items[sig] = r
	t.mu.Unlock()
}

func (t *Tracker) Get(sig string) (Result, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	r, ok := t.items[sig]
	return r, ok
}

func (t *Tracker) MergeStatus(sig string, st map[string]any) map[string]any {
	if st == nil {
		st = map[string]any{}
	}
	if r, ok := t.Get(sig); ok && r.Ingest != nil {
		st["ingest"] = r.Ingest
	}
	return st
}

type Options struct {
	RPCURL      string
	Indexer     *indexer.Client
	AutoIngest  bool
	OnConfirmed func(signature string, ingest IngestInfo)
}

const (
	confirmPollInterval = 120 * time.Millisecond
	confirmMaxAttempts  = 160 // ~19s at 120ms
	// After this many polls without finding the sig, enable searchTransactionHistory.
	confirmSearchHistoryAfter = 40
)

func ConfirmAndIngest(ctx context.Context, signature string, opt Options) Result {
	rpcClient := txprep.NewRPC(opt.RPCURL)
	out := Result{Signature: signature, Status: "submitted"}
	DefaultTracker.Set(signature, out)

	var lastErr string
	for i := 0; i < confirmMaxAttempts; i++ {
		select {
		case <-ctx.Done():
			out.Status = "timeout"
			DefaultTracker.Set(signature, out)
			return out
		default:
		}
		searchHistory := i >= confirmSearchHistoryAfter
		st, err := rpcClient.StatusOpts(signature, searchHistory)
		if err != nil {
			lastErr = err.Error()
			time.Sleep(confirmPollInterval)
			continue
		}
		status, _ := st["status"].(string)
		if slot, ok := st["slot"].(uint64); ok {
			out.Slot = slot
		}
		if status == "failed" {
			out.Status = "failed"
			out.Err = st["err"]
			DefaultTracker.Set(signature, out)
			return out
		}
		// Accept confirmed/finalized. processed alone is not enough for subsequent
		// AccountData(confirmed) reads in the next flow step.
		if status == "confirmed" || status == "finalized" {
			out.Status = status
			DefaultTracker.Set(signature, out)
			// Ingest in background so flow AdvanceToReady is not blocked on indexer.
			if opt.AutoIngest && opt.Indexer != nil && opt.Indexer.Enabled() {
				sig := signature
				go func() {
					ingCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
					defer cancel()
					ing, err := opt.Indexer.Ingest(ingCtx, sig)
					info := IngestInfo{OK: ing.OK, Events: ing.Events}
					if err != nil {
						info.OK = false
						info.Error = err.Error()
					} else if ing.Error != "" {
						info.Error = ing.Error
					}
					cur, _ := DefaultTracker.Get(sig)
					cur.Ingest = &info
					if cur.Signature == "" {
						cur.Signature = sig
						cur.Status = out.Status
						cur.Slot = out.Slot
					}
					DefaultTracker.Set(sig, cur)
					if opt.OnConfirmed != nil {
						opt.OnConfirmed(sig, info)
					}
				}()
			}
			return out
		}
		time.Sleep(confirmPollInterval)
	}
	out.Status = "timeout"
	if lastErr != "" {
		out.Err = lastErr
	}
	DefaultTracker.Set(signature, out)
	return out
}

func RunAsync(signature string, opt Options) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		defer cancel()
		ConfirmAndIngest(ctx, signature, opt)
	}()
}
