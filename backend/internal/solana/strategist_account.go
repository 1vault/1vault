package solana

import (
	"encoding/binary"
	"fmt"
)

// StrategistAccountLen is 8 (discriminator) + Strategist::INIT_SPACE.
const StrategistAccountLen = 8 + 32 + 8 + 8 + 1 + 1 // 58

// DecodeStrategistActiveVaultCount reads Strategist.active_vault_count.
func DecodeStrategistActiveVaultCount(data []byte) (uint64, error) {
	if len(data) < StrategistAccountLen {
		return 0, fmt.Errorf("strategist account len %d want >= %d", len(data), StrategistAccountLen)
	}
	o := 8 + 32 + 8 // disc + owner + vault_count
	return binary.LittleEndian.Uint64(data[o : o+8]), nil
}

// DecodeStrategistLicenseActive reads Strategist.is_active (license currently locked).
func DecodeStrategistLicenseActive(data []byte) (bool, error) {
	if len(data) < StrategistAccountLen {
		return false, fmt.Errorf("strategist account len %d want >= %d", len(data), StrategistAccountLen)
	}
	o := 8 + 32 + 8 + 8 // disc + owner + vault_count + active_vault_count
	return data[o] != 0, nil
}
