package txprep

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	s "github.com/1vault/backend/internal/solana"
	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

type RPC struct {
	client *rpc.Client
}

func NewRPC(url string) *RPC {
	return &RPC{client: rpc.New(url)}
}

func (r *RPC) LatestBlockhash() (solana.Hash, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	out, err := r.client.GetLatestBlockhash(ctx, rpc.CommitmentConfirmed)
	if err != nil {
		return solana.Hash{}, err
	}
	return out.Value.Blockhash, nil
}

// SendRaw broadcasts a signed transaction. SkipPreflight: backend already
// preflighted account layout / status before packing flow txs.
func (r *RPC) SendRaw(raw []byte) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	opts := rpc.TransactionOpts{
		SkipPreflight:       true,
		PreflightCommitment: rpc.CommitmentProcessed,
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

func (r *RPC) AccountData(pubkey solana.PublicKey) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	info, err := r.client.GetAccountInfoWithOpts(ctx, pubkey, &rpc.GetAccountInfoOpts{
		Commitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		if err == rpc.ErrNotFound {
			return nil, fmt.Errorf("account not found: %s", pubkey)
		}
		return nil, err
	}
	if info == nil || info.Value == nil {
		return nil, fmt.Errorf("account not found: %s", pubkey)
	}
	return info.Value.Data.GetBinary(), nil
}

func (r *RPC) AccountExists(pubkey solana.PublicKey) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	info, err := r.client.GetAccountInfoWithOpts(ctx, pubkey, &rpc.GetAccountInfoOpts{
		Commitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		if err == rpc.ErrNotFound {
			return false, nil
		}
		msg := err.Error()
		if msg == "not found" || msg == "NotFound" {
			return false, nil
		}
		return false, err
	}
	return info != nil && info.Value != nil, nil
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
