package auth

import (
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mr-tron/base58"
)

func BuildBindMessage(domain, pubkey, nonce, issuedAt string) string {
	return strings.Join([]string{
		domain + " wants you to bind your Solana wallet to 1Vault.",
		"",
		"Wallet: " + pubkey,
		"Nonce: " + nonce,
		"Issued At: " + issuedAt,
	}, "\n")
}

func VerifyWalletSignature(pubkeyB58, message, signature string) bool {
	pub, err := base58.Decode(pubkeyB58)
	if err != nil || len(pub) != ed25519.PublicKeySize {
		return false
	}
	sig, err := decodeSig(signature)
	if err != nil || len(sig) != ed25519.SignatureSize {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(pub), []byte(message), sig)
}

func decodeSig(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "[") {
		var nums []byte
		if err := json.Unmarshal([]byte(s), &nums); err == nil && len(nums) > 0 {
			return nums, nil
		}
		var ints []int
		if err := json.Unmarshal([]byte(s), &ints); err != nil {
			return nil, err
		}
		out := make([]byte, len(ints))
		for i, v := range ints {
			out[i] = byte(v)
		}
		return out, nil
	}
	return base58.Decode(s)
}

func DecodePubkey(pubkeyB58 string) error {
	pub, err := base58.Decode(pubkeyB58)
	if err != nil {
		return err
	}
	if len(pub) != ed25519.PublicKeySize {
		return fmt.Errorf("invalid pubkey length")
	}
	return nil
}
