package solana

import (
	"encoding/binary"
	"fmt"

	"github.com/gagliardetto/solana-go"
)

const vaultAcceptedMintsSlots = 5

// CurrentVaultAccountLen is 8 (discriminator) + Vault::INIT_SPACE for the
// deployed book_mode / early_exit_fee_bps layout.
const CurrentVaultAccountLen = 565

// VaultLayoutError explains why an on-chain vault cannot be used with the deployed program.
type VaultLayoutError struct {
	Pubkey string
	Len    int
	Reason string
}

func (e *VaultLayoutError) Error() string {
	return fmt.Sprintf(
		"vault %s has incompatible on-chain layout (%s, len=%d); create a new vault after the book_mode upgrade — legacy vaults cannot initiate_close/close",
		e.Pubkey, e.Reason, e.Len,
	)
}

// ValidateVaultAccountData checks the account can be deserialized as the current Vault struct.
// Legacy sizes: 594 (pre-simplification), 562 (pre-book_mode). Those hit Anchor 3003 AccountDidNotDeserialize.
func ValidateVaultAccountData(pubkey solana.PublicKey, data []byte) error {
	if len(data) < 8 {
		return &VaultLayoutError{Pubkey: pubkey.String(), Len: len(data), Reason: "empty or missing account"}
	}
	if len(data) != CurrentVaultAccountLen {
		reason := "legacy account size"
		switch len(data) {
		case 594:
			reason = "legacy layout (pre-simplification)"
		case 562:
			reason = "legacy layout (missing book_mode/early_exit_fee_bps)"
		}
		return &VaultLayoutError{Pubkey: pubkey.String(), Len: len(data), Reason: reason}
	}
	o := 8 + 32 + 8
	var err error
	o, err = skipBorshString(data, o)
	if err != nil {
		return &VaultLayoutError{Pubkey: pubkey.String(), Len: len(data), Reason: "invalid name: " + err.Error()}
	}
	o, err = skipBorshString(data, o)
	if err != nil {
		return &VaultLayoutError{Pubkey: pubkey.String(), Len: len(data), Reason: "invalid description: " + err.Error()}
	}
	o += 32 + 1 + 32*vaultAcceptedMintsSlots + 32 + 32 + 8*4
	if o+2+1+2+1 > len(data) {
		return &VaultLayoutError{Pubkey: pubkey.String(), Len: len(data), Reason: "truncated after fees"}
	}
	o += 2 // performance_fee_bps
	book := data[o]
	if book > 1 {
		return &VaultLayoutError{Pubkey: pubkey.String(), Len: len(data), Reason: fmt.Sprintf("invalid book_mode=%d", book)}
	}
	o += 1 + 2 // book_mode + early_exit_fee_bps
	status := data[o]
	if status > 3 {
		return &VaultLayoutError{Pubkey: pubkey.String(), Len: len(data), Reason: fmt.Sprintf("invalid status=%d", status)}
	}
	return nil
}

// VaultStatus matches on-chain VaultStatus enum.
type VaultStatus uint8

const (
	VaultStatusActive  VaultStatus = 0
	VaultStatusPaused  VaultStatus = 1
	VaultStatusClosing VaultStatus = 2
	VaultStatusClosed  VaultStatus = 3
)

func (s VaultStatus) String() string {
	switch s {
	case VaultStatusActive:
		return "Active"
	case VaultStatusPaused:
		return "Paused"
	case VaultStatusClosing:
		return "Closing"
	case VaultStatusClosed:
		return "Closed"
	default:
		return fmt.Sprintf("Unknown(%d)", s)
	}
}

// DecodeVaultStatus reads Vault.status from current-layout account data.
func DecodeVaultStatus(data []byte) (VaultStatus, error) {
	if len(data) != CurrentVaultAccountLen {
		return 0, fmt.Errorf("vault account len %d want %d", len(data), CurrentVaultAccountLen)
	}
	o, err := vaultPerfFeeOffset(data)
	if err != nil {
		return 0, err
	}
	o += 2 // performance_fee_bps
	o += 3 // book_mode + early_exit_fee_bps
	if o >= len(data) {
		return 0, fmt.Errorf("vault account truncated before status")
	}
	st := VaultStatus(data[o])
	if st > VaultStatusClosed {
		return 0, fmt.Errorf("invalid vault status %d", st)
	}
	return st, nil
}

// RequireVaultActive returns a clear error when park/deposit/config cannot run.
func RequireVaultActive(pubkey solana.PublicKey, data []byte) error {
	if err := ValidateVaultAccountData(pubkey, data); err != nil {
		return err
	}
	st, err := DecodeVaultStatus(data)
	if err != nil {
		return err
	}
	if st == VaultStatusActive {
		return nil
	}
	return fmt.Errorf(
		"vault %s is %s (not Active) — Anchor reports this as VaultPaused (6008); pick an Active vault or create a new one before Park",
		pubkey, st,
	)
}

// DecodeVaultTokenAccount reads vault_token_account from on-chain Vault account data.
func DecodeVaultTokenAccount(data []byte) (solana.PublicKey, error) {
	if len(data) < 8+32+8+4 {
		return solana.PublicKey{}, fmt.Errorf("vault account too short")
	}
	o := 8 // Anchor account discriminator
	o += 32 // strategist
	o += 8  // vault_id
	o, err := skipBorshString(data, o)
	if err != nil {
		return solana.PublicKey{}, fmt.Errorf("vault name: %w", err)
	}
	o, err = skipBorshString(data, o)
	if err != nil {
		return solana.PublicKey{}, fmt.Errorf("vault description: %w", err)
	}
	o += 32 // base_mint
	if o >= len(data) {
		return solana.PublicKey{}, fmt.Errorf("vault account truncated before accepted_mints")
	}
	o++ // accepted_mint_count
	o += 32 * vaultAcceptedMintsSlots
	o += 32 // share_mint
	if o+32 > len(data) {
		return solana.PublicKey{}, fmt.Errorf("vault account missing vault_token_account")
	}
	return solana.PublicKeyFromBytes(data[o : o+32]), nil
}

func vaultPerfFeeOffset(data []byte) (int, error) {
	if len(data) < 8+32+8+4 {
		return 0, fmt.Errorf("vault account too short")
	}
	o := 8
	o += 32
	o += 8
	var e error
	o, e = skipBorshString(data, o)
	if e != nil {
		return 0, e
	}
	o, e = skipBorshString(data, o)
	if e != nil {
		return 0, e
	}
	o += 32
	if o >= len(data) {
		return 0, fmt.Errorf("truncated")
	}
	o++
	o += 32 * vaultAcceptedMintsSlots
	o += 32 + 32 + 8*4
	return o, nil
}

// DecodeVaultNextIDs returns next_trade_id and next_position_id from on-chain Vault account data.
// Deployed layout includes book_mode (u8) + early_exit_fee_bps (u16) after performance_fee_bps.
func DecodeVaultNextIDs(data []byte) (nextTradeID, nextPositionID uint64, err error) {
	o, err := vaultPerfFeeOffset(data)
	if err != nil {
		return 0, 0, err
	}
	o += 2 // performance_fee_bps
	o += 3 // book_mode + early_exit_fee_bps (deployed)
	o++    // status
	o += 2 // max_slippage_bps
	o++    // open_positions_count
	o++    // pending_trades_count
	if o+16 > len(data) {
		return 0, 0, fmt.Errorf("vault account missing next ids")
	}
	nextTradeID = binary.LittleEndian.Uint64(data[o : o+8])
	nextPositionID = binary.LittleEndian.Uint64(data[o+8 : o+16])
	if nextTradeID == 0 {
		nextTradeID = 1
	}
	if nextPositionID == 0 {
		nextPositionID = 1
	}
	return nextTradeID, nextPositionID, nil
}

// DecodeVaultDescriptionAndSlippage reads vault description + max_slippage_bps for update_vault risk params.
func DecodeVaultDescriptionAndSlippage(data []byte) (description string, maxSlippage uint16, err error) {
	o := 8 + 32 + 8
	o, err = skipBorshString(data, o) // name
	if err != nil {
		return "", 0, err
	}
	if o+4 > len(data) {
		return "", 0, fmt.Errorf("truncated description length")
	}
	n := int(binary.LittleEndian.Uint32(data[o : o+4]))
	o += 4
	if n < 0 || o+n > len(data) {
		return "", 0, fmt.Errorf("invalid description length")
	}
	description = string(data[o : o+n])
	o += n
	o += 32 // base_mint
	if o >= len(data) {
		return "", 0, fmt.Errorf("truncated before accepted_mints")
	}
	o++
	o += 32 * vaultAcceptedMintsSlots
	o += 32 + 32 + 8*4
	o += 2 + 3 + 1 // perf, book/early, status
	if o+2 > len(data) {
		return "", 0, fmt.Errorf("truncated before max_slippage")
	}
	maxSlippage = binary.LittleEndian.Uint16(data[o : o+2])
	return description, maxSlippage, nil
}

func skipBorshString(data []byte, offset int) (int, error) {
	if offset+4 > len(data) {
		return 0, fmt.Errorf("truncated string length at %d", offset)
	}
	n := int(binary.LittleEndian.Uint32(data[offset : offset+4]))
	offset += 4
	if n < 0 || offset+n > len(data) {
		return 0, fmt.Errorf("invalid string length %d at %d", n, offset-4)
	}
	return offset + n, nil
}
