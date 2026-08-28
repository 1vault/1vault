package solana

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var (
	reCustomErr = regexp.MustCompile(`(?i)(?:Custom|custom program error)[:\s]+(?:0x)?([0-9a-fA-F]+)`)
	reAnchorNum = regexp.MustCompile(`(?i)Error Number:\s*(\d+)`)
)

// AnchorErrorMessages maps common OneVault custom error numbers to clear copy.
var AnchorErrorMessages = map[int]string{
	6006: "Not enough 1VL licence tokens",
	6008: "Vault is not Active (paused/closing/closed)",
	6009: "Vault is already Closed",
	6011: "Vault is not Closing — run initiate_close first",
	6015: "Vault still has open positions or pending trades",
	6017: "Strategist still has active vaults — close them before unlocking 1VL",
	6026: "Trade is not pending / invalid trade state",
	6033: "Nothing to claim — no accrued performance fees",
	3003: "Vault account layout incompatible (legacy) — create a new vault",
}

// FriendlyTxError turns raw RPC/simulation/Anchor errors into a short user message.
func FriendlyTxError(err error) string {
	if err == nil {
		return ""
	}
	msg := err.Error()
	if code, ok := extractAnchorCode(msg); ok {
		if mapped, hit := AnchorErrorMessages[code]; hit {
			return fmt.Sprintf("%s (Anchor %d)", mapped, code)
		}
		return fmt.Sprintf("Program rejected transaction (Anchor error %d)", code)
	}
	low := strings.ToLower(msg)
	switch {
	case strings.Contains(low, "blockhash not found"):
		return "Transaction blockhash expired — refresh and retry"
	case strings.Contains(low, "insufficient funds"), strings.Contains(low, "insufficient lamports"):
		return "Not enough SOL for fees"
	case strings.Contains(low, "already in use"), strings.Contains(low, "already been processed"):
		return "Transaction already processed"
	case strings.Contains(low, "account not found"):
		return "Required on-chain account not found"
	default:
		return msg
	}
}

func extractAnchorCode(msg string) (int, bool) {
	if m := reAnchorNum.FindStringSubmatch(msg); len(m) == 2 {
		n, err := strconv.Atoi(m[1])
		if err == nil {
			return n, true
		}
	}
	if m := reCustomErr.FindStringSubmatch(msg); len(m) == 2 {
		raw := m[1]
		// Prefer hex when prefixed 0x in the match context or value looks hex-only with letters.
		if strings.Contains(strings.ToLower(m[0]), "0x") {
			n, err := strconv.ParseInt(raw, 16, 64)
			if err == nil {
				return int(n), true
			}
		}
		if n, err := strconv.Atoi(raw); err == nil {
			return n, true
		}
		if n, err := strconv.ParseInt(raw, 16, 64); err == nil {
			return int(n), true
		}
	}
	return 0, false
}
