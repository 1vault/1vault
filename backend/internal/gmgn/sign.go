package gmgn

import (
	"crypto"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"net/url"
	"sort"
	"strings"

	"github.com/youmark/pkcs8"
)

func normalizePEM(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	raw = strings.ReplaceAll(raw, `\n`, "\n")
	return raw
}

func parsePrivateKey(pemStr, passphrase string) (any, error) {
	pemStr = normalizePEM(pemStr)
	if pemStr == "" {
		return nil, fmt.Errorf("empty private key")
	}
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, fmt.Errorf("invalid PEM private key")
	}
	der := block.Bytes
	pass := []byte(strings.TrimSpace(passphrase))

	if block.Type == "ENCRYPTED PRIVATE KEY" {
		if len(pass) == 0 {
			return nil, fmt.Errorf("encrypted private key requires passphrase")
		}
		key, err := pkcs8.ParsePKCS8PrivateKey(der, pass)
		if err != nil {
			return nil, fmt.Errorf("decrypt private key: %w", err)
		}
		return key, nil
	}
	if x509.IsEncryptedPEMBlock(block) { //nolint:staticcheck
		if len(pass) == 0 {
			return nil, fmt.Errorf("encrypted private key requires passphrase")
		}
		var err error
		der, err = x509.DecryptPEMBlock(block, pass) //nolint:staticcheck
		if err != nil {
			return nil, fmt.Errorf("decrypt private key: %w", err)
		}
	}
	if key, err := x509.ParsePKCS8PrivateKey(der); err == nil {
		return key, nil
	}
	if key, err := x509.ParsePKCS1PrivateKey(der); err == nil {
		return key, nil
	}
	if key, err := x509.ParseECPrivateKey(der); err == nil {
		return key, nil
	}
	return nil, fmt.Errorf("unsupported private key type")
}

func encodeURIComponent(s string) string {
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
			c == '-' || c == '_' || c == '.' || c == '!' || c == '~' || c == '*' || c == '\'' || c == '(' || c == ')' {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

// sortedQuery builds the signature query string (encodeURIComponent style).
func sortedQuery(q url.Values) string {
	keys := make([]string, 0, len(q))
	for k := range q {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(q))
	for _, k := range keys {
		vs := append([]string(nil), q[k]...)
		sort.Strings(vs)
		ek := encodeURIComponent(k)
		for _, v := range vs {
			parts = append(parts, ek+"="+encodeURIComponent(v))
		}
	}
	return strings.Join(parts, "&")
}

func buildSignMessage(subPath string, q url.Values, body string, timestamp int64) string {
	return fmt.Sprintf("%s:%s:%s:%d", subPath, sortedQuery(q), body, timestamp)
}

func signMessage(key any, message string) (string, error) {
	msg := []byte(message)
	switch k := key.(type) {
	case ed25519.PrivateKey:
		sig := ed25519.Sign(k, msg)
		return base64.StdEncoding.EncodeToString(sig), nil
	case *rsa.PrivateKey:
		sum := sha256.Sum256(msg)
		sig, err := rsa.SignPSS(rand.Reader, k, crypto.SHA256, sum[:], &rsa.PSSOptions{SaltLength: 32})
		if err != nil {
			return "", err
		}
		return base64.StdEncoding.EncodeToString(sig), nil
	default:
		return "", fmt.Errorf("unsupported key type %T", key)
	}
}
