package txprep

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"

	s "github.com/1vault/backend/internal/solana"
	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

const accountCacheTTL = 3 * time.Second

type accountCacheEntry struct {
	data    []byte
	exists  bool
	missing bool
	at      time.Time
}

type RPC struct {
	client *rpc.Client

	mu    sync.Mutex
	cache map[string]accountCacheEntry

	bhMu  sync.Mutex
	bh    solana.Hash
	bhAt  time.Time
	bhOK  bool
}

func NewRPC(url string) *RPC {
	return &RPC{
		client: rpc.New(url),
		cache:  make(map[string]accountCacheEntry),
	}
}

func (r *RPC) LatestBlockhash() (solana.Hash, error) {
	r.bhMu.Lock()
	if r.bhOK && time.Since(r.bhAt) < 1500*time.Millisecond {
		h := r.bh
		r.bhMu.Unlock()
		return h, nil
	}
	r.bhMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := r.client.GetLatestBlockhash(ctx, rpc.CommitmentConfirmed)
	if err != nil {
		return solana.Hash{}, err
	}
	h := out.Value.Blockhash
	r.bhMu.Lock()
	r.bh = h
	r.bhAt = time.Now()
	r.bhOK = true
	r.bhMu.Unlock()
	return h, nil
}

// SendRaw broadcasts a signed transaction. Preflight at confirmed catches
// program errors before the tx lands (avoids wasted fees / opaque confirm fails).
func (r *RPC) SendRaw(raw []byte) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	opts := rpc.TransactionOpts{
		SkipPreflight:       false,
		PreflightCommitment: rpc.CommitmentConfirmed,
		MaxRetries:          ptrUint(2),
	}
	sig, err := r.client.SendRawTransactionWithOpts(ctx, raw, opts)
	if err != nil {
		return "", err
	}
	return sig.String(), nil
}

func ptrUint(n uint) *uint { return &n }

// Status polls signature confirmation. searchHistory=false for hot path
// (just-submitted sigs). Pass searchHistory=true on late/timeout retries.
func (r *RPC) Status(signature string) (map[string]any, error) {
	return r.StatusOpts(signature, false)
}

func (r *RPC) StatusOpts(signature string, searchHistory bool) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	sig, err := solana.SignatureFromBase58(signature)
	if err != nil {
		return nil, err
	}
	out, err := r.client.GetSignatureStatuses(ctx, searchHistory, sig)
	if err != nil {
		return nil, err
	}
	if out == nil || len(out.Value) == 0 || out.Value[0] == nil {
		return map[string]any{"signature": signature, "status": "unknown"}, nil
	}
	st := out.Value[0]
	status := "processed"
	if st.ConfirmationStatus != "" {
		status = string(st.ConfirmationStatus)
	}
	errObj := any(nil)
	if st.Err != nil {
		errObj = st.Err
		status = "failed"
	}
	return map[string]any{
		"signature": signature,
		"status":    status,
		"slot":      st.Slot,
		"err":       errObj,
	}, nil
}

func (r *RPC) cacheGet(pubkey solana.PublicKey) (accountCacheEntry, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	e, ok := r.cache[pubkey.String()]
	if !ok || time.Since(e.at) > accountCacheTTL {
		return accountCacheEntry{}, false
	}
	return e, true
}

func (r *RPC) cachePut(pubkey solana.PublicKey, data []byte, exists bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cache == nil {
		r.cache = make(map[string]accountCacheEntry)
	}
	r.cache[pubkey.String()] = accountCacheEntry{
		data:    data,
		exists:  exists,
		missing: !exists,
		at:      time.Now(),
	}
}

func (r *RPC) AccountData(pubkey solana.PublicKey) ([]byte, error) {
	if e, ok := r.cacheGet(pubkey); ok {
		if e.missing || !e.exists {
			return nil, fmt.Errorf("account not found: %s", pubkey)
		}
		return e.data, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	info, err := r.client.GetAccountInfoWithOpts(ctx, pubkey, &rpc.GetAccountInfoOpts{
		Commitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		if err == rpc.ErrNotFound {
			r.cachePut(pubkey, nil, false)
			return nil, fmt.Errorf("account not found: %s", pubkey)
		}
		return nil, err
	}
	if info == nil || info.Value == nil {
		r.cachePut(pubkey, nil, false)
		return nil, fmt.Errorf("account not found: %s", pubkey)
	}
	data := info.Value.Data.GetBinary()
	r.cachePut(pubkey, data, true)
	return data, nil
}

func (r *RPC) AccountExists(pubkey solana.PublicKey) (bool, error) {
	if e, ok := r.cacheGet(pubkey); ok {
		return e.exists, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	info, err := r.client.GetAccountInfoWithOpts(ctx, pubkey, &rpc.GetAccountInfoOpts{
		Commitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		if err == rpc.ErrNotFound {
			r.cachePut(pubkey, nil, false)
			return false, nil
		}
		msg := err.Error()
		if msg == "not found" || msg == "NotFound" {
			r.cachePut(pubkey, nil, false)
			return false, nil
		}
		return false, err
	}
	exists := info != nil && info.Value != nil
	var data []byte
	if exists {
		data = info.Value.Data.GetBinary()
	}
	r.cachePut(pubkey, data, exists)
	return exists, nil
}

// AccountsData fetches many accounts in one RPC round-trip and warms the cache.
func (r *RPC) AccountsData(pubkeys []solana.PublicKey) (map[string][]byte, error) {
	out := make(map[string][]byte, len(pubkeys))
	if len(pubkeys) == 0 {
		return out, nil
	}
	need := make([]solana.PublicKey, 0, len(pubkeys))
	seen := make(map[string]struct{}, len(pubkeys))
	for _, pk := range pubkeys {
		key := pk.String()
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		if e, ok := r.cacheGet(pk); ok {
			if e.exists {
				out[key] = e.data
			}
			continue
		}
		need = append(need, pk)
	}
	if len(need) == 0 {
		return out, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()
	res, err := r.client.GetMultipleAccountsWithOpts(ctx, need, &rpc.GetMultipleAccountsOpts{
		Commitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		return nil, err
	}
	if res == nil {
		return out, nil
	}
	for i, pk := range need {
		key := pk.String()
		if i >= len(res.Value) || res.Value[i] == nil {
			r.cachePut(pk, nil, false)
			continue
		}
		data := res.Value[i].Data.GetBinary()
		r.cachePut(pk, data, true)
		out[key] = data
	}
	return out, nil
}

func DecodeSignedTx(b64 string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(b64)
}

func IngestSignature(indexerURL, signature string) (any, error) {
	body, _ := json.Marshal(map[string]string{"signature": signature})
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, indexerURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var data any
	if json.Unmarshal(raw, &data) != nil {
		data = string(raw)
	}
	if res.StatusCode >= 300 {
		return data, fmt.Errorf("ingest failed: %d", res.StatusCode)
	}
	return data, nil
}

func requestTradeData(p RequestTradeParams) []byte {
	action := byte(0) // Buy
	if p.Action == "sell" || p.Action == "Sell" {
		action = 1
	}
	mode := byte(0) // Fixed
	if p.PositionMode == "percentage" || p.PositionMode == "Percentage" {
		mode = 1
	}
	slip := p.SlippageBps
	if slip == 0 {
		slip = 100
	}
	return s.Concat(
		s.DiscRequestTrade,
		s.U64LE(p.TradeID),
		[]byte{action},
		p.InputMint[:],
		p.OutputMint[:],
		[]byte{mode},
		s.U64LE(p.Amount),
		s.U16LE(slip),
		s.U64LE(p.MinAmountOut),
		s.U16LE(p.TakeProfit),
		s.U16LE(p.StopLoss),
		s.U64LE(p.LinkedPositionID),
		[]byte{0}, // Dex
	)
}
