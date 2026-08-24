package solana

import (
	"encoding/binary"
	"fmt"
)

// VaultFeeStateAccountLen is 8 (discriminator) + VaultFeeState::INIT_SPACE.
const VaultFeeStateAccountLen = 8 + 32 + 32 + 8 + 8 + 8 + 1 // 97

// DecodeVaultFeeClaimable returns accrued_performance_fees - claimed_performance_fees.
func DecodeVaultFeeClaimable(data []byte) (uint64, error) {
	if len(data) < VaultFeeStateAccountLen {
		return 0, fmt.Errorf("vault fee state account len %d want >= %d", len(data), VaultFeeStateAccountLen)
	}
	o := 8 + 32 + 32 // disc + vault + strategist
	accrued := binary.LittleEndian.Uint64(data[o : o+8])
	claimed := binary.LittleEndian.Uint64(data[o+8 : o+16])
	if claimed > accrued {
		return 0, nil
	}
	return accrued - claimed, nil
}
