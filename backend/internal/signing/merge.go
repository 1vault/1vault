package signing

import (
	"errors"
	"fmt"

	bin "github.com/gagliardetto/binary"
	"github.com/gagliardetto/solana-go"
)

var (
	ErrMissingEOASignature = errors.New("missing EOA signature")
	ErrWrongSigner         = errors.New("wrong signer for transaction")
)

// wireLayout splits a legacy Solana tx into signature slots + message bytes
// without re-encoding the message (critical for multi-party partial signing).
func wireLayout(txBytes []byte) (numSigs int, sigStart int, msgStart int, padded []byte, err error) {
	dec := bin.NewBinDecoder(txBytes)
	n, err := dec.ReadCompactU16()
	if err != nil {
		return 0, 0, 0, nil, fmt.Errorf("read num signatures: %w", err)
	}
	sigStart = int(dec.Position())
	msgStart = sigStart + n*64
	if msgStart > len(txBytes) {
		return 0, 0, 0, nil, fmt.Errorf("tx truncated: need %d bytes, have %d", msgStart, len(txBytes))
	}
	if n >= 1 && n <= 16 {
		return n, sigStart, msgStart, txBytes, nil
	}
	// Unsigned gagliardetto txs often encode n=0 then the message — pad slots.
	if n == 0 && msgStart < len(txBytes) {
		numRequired := int(txBytes[msgStart])
		if numRequired < 1 || numRequired > 16 {
			return 0, 0, 0, nil, fmt.Errorf("invalid signature count %d", n)
		}
		count := encodeCompactU16(numRequired)
		out := make([]byte, len(count)+numRequired*64+len(txBytes)-msgStart)
		copy(out, count)
		copy(out[len(count)+numRequired*64:], txBytes[msgStart:])
		return numRequired, len(count), len(count) + numRequired*64, out, nil
	}
	return 0, 0, 0, nil, fmt.Errorf("invalid signature count %d", n)
}

func encodeCompactU16(n int) []byte {
	var out []byte
	_ = bin.EncodeCompactU16Length(&out, n)
	return out
}

func MergePartial(txBytes []byte, details []Detail, serverKeys map[string]solana.PrivateKey) ([]byte, error) {
	numSigs, sigStart, msgStart, txBytes, err := wireLayout(txBytes)
	if err != nil {
		return nil, err
	}
	tx, err := solana.TransactionFromBytes(txBytes)
	if err != nil {
		return nil, fmt.Errorf("invalid transaction: %w", err)
	}
	msgBytes := txBytes[msgStart:]
	signerKeys := tx.Message.AccountKeys
	if int(tx.Message.Header.NumRequiredSignatures) != numSigs {
		return nil, fmt.Errorf("signature count mismatch header=%d wire=%d",
			tx.Message.Header.NumRequiredSignatures, numSigs)
	}

	signerIndex := func(pubkey string) (int, error) {
		pk, err := solana.PublicKeyFromBase58(pubkey)
		if err != nil {
			return -1, err
		}
		limit := numSigs
		if limit > len(signerKeys) {
			limit = len(signerKeys)
		}
		for i := 0; i < limit; i++ {
			if signerKeys[i].Equals(pk) {
				return i, nil
			}
		}
		return -1, fmt.Errorf("signer %s not in transaction", pubkey)
	}

	out := make([]byte, len(txBytes))
	copy(out, txBytes)

	for _, d := range details {
		if !d.UserMustSign {
			continue
		}
		idx, err := signerIndex(d.Pubkey)
		if err != nil {
			return nil, ErrWrongSigner
		}
		slot := out[sigStart+idx*64 : sigStart+(idx+1)*64]
		var zero [64]byte
		if string(slot) == string(zero[:]) {
			return nil, fmt.Errorf("%w: %s", ErrMissingEOASignature, d.Pubkey)
		}
		pk := signerKeys[idx]
		var sig solana.Signature
		copy(sig[:], slot)
		if !sig.Verify(pk, msgBytes) {
			return nil, fmt.Errorf("%w: invalid signature for %s (message mismatch — client must not recompile tx)", ErrMissingEOASignature, d.Pubkey)
		}
	}

	for _, d := range details {
		if d.UserMustSign {
			continue
		}
		sk, ok := serverKeys[d.Pubkey]
		if !ok {
			return nil, fmt.Errorf("server signer not configured for %s", d.Pubkey)
		}
		idx, err := signerIndex(d.Pubkey)
		if err != nil {
			return nil, err
		}
		sig, err := sk.Sign(msgBytes)
		if err != nil {
			return nil, fmt.Errorf("sign %s: %w", d.Pubkey, err)
		}
		copy(out[sigStart+idx*64:sigStart+(idx+1)*64], sig[:])
	}
	return out, nil
}

func SignFully(txBytes []byte, serverKeys map[string]solana.PrivateKey) ([]byte, error) {
	numSigs, sigStart, msgStart, txBytes, err := wireLayout(txBytes)
	if err != nil {
		return nil, err
	}
	tx, err := solana.TransactionFromBytes(txBytes)
	if err != nil {
		return nil, err
	}
	msgBytes := txBytes[msgStart:]
	out := make([]byte, len(txBytes))
	copy(out, txBytes)
	limit := numSigs
	if limit > len(tx.Message.AccountKeys) {
		limit = len(tx.Message.AccountKeys)
	}
	for i := 0; i < limit; i++ {
		pk := tx.Message.AccountKeys[i]
		sk, ok := serverKeys[pk.String()]
		if !ok {
			continue
		}
		sig, err := sk.Sign(msgBytes)
		if err != nil {
			return nil, err
		}
		copy(out[sigStart+i*64:sigStart+(i+1)*64], sig[:])
	}
	return out, nil
}
