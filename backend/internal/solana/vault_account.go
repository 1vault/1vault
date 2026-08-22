package solana

import (
	"encoding/binary"
	"fmt"

	"github.com/gagliardetto/solana-go"
)

const vaultAcceptedMintsSlots = 5

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
// Deployed layout includes book_mode (u8) + management_fee_bps (u16) after performance_fee_bps.
func DecodeVaultNextIDs(data []byte) (nextTradeID, nextPositionID uint64, err error) {
	o, err := vaultPerfFeeOffset(data)
	if err != nil {
		return 0, 0, err
	}
	o += 2 // performance_fee_bps
	o += 3 // book_mode + management_fee_bps (deployed)
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
	o += 2 + 3 + 1 // perf, book/mgmt, status
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
