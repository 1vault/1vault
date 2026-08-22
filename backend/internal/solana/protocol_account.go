package solana

import (
	"fmt"

	"github.com/gagliardetto/solana-go"
)

const maxAllowedDexSlots = 5

// DecodeProtocolTradePrograms reads allowed DEX and launchpad program lists from ProtocolConfig account data.
func DecodeProtocolTradePrograms(data []byte) (dex []solana.PublicKey, launchpad []solana.PublicKey, err error) {
	if len(data) < 8+32*3+8+2+1+1+32*maxAllowedDexSlots+1 {
		return nil, nil, fmt.Errorf("protocol account too short")
	}
	o := 8 // discriminator
	o += 32 * 3 // authority, treasury, platform_token_mint
	o += 8      // license_lock_amount
	o += 2      // performance_fee_bps
	o++         // is_paused
	dexCount := int(data[o])
	o++
	for i := 0; i < maxAllowedDexSlots; i++ {
		pk := solana.PublicKeyFromBytes(data[o : o+32])
		if i < dexCount && !pk.IsZero() {
			dex = append(dex, pk)
		}
		o += 32
	}
	if o >= len(data) {
		return dex, launchpad, nil
	}
	lpCount := int(data[o])
	o++
	for i := 0; i < maxAllowedDexSlots && o+32 <= len(data); i++ {
		pk := solana.PublicKeyFromBytes(data[o : o+32])
		if i < lpCount && !pk.IsZero() {
			launchpad = append(launchpad, pk)
		}
		o += 32
	}
	return dex, launchpad, nil
}

// TradeVenueDex / TradeVenueLaunchpad match on-chain TradeVenue enum (Dex=0 default).
const (
	TradeVenueDex       = 0
	TradeVenueLaunchpad = 1
)
