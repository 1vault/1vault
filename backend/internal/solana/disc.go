package solana

// Instruction discriminators from simulator/idl/onevault.json
var (
	DiscRegisterStrategist = []byte{240, 193, 64, 254, 68, 160, 134, 37}
	DiscLockLicense        = []byte{72, 55, 108, 218, 0, 122, 127, 106}
	DiscCreateVault        = []byte{29, 237, 247, 208, 193, 82, 54, 135}
	DiscDeposit            = []byte{242, 35, 198, 137, 82, 225, 242, 182}
	DiscWithdraw           = []byte{183, 18, 70, 156, 148, 109, 161, 34}
	DiscUpdateNav          = []byte{56, 16, 234, 109, 155, 165, 5, 0}
	DiscRequestTrade       = []byte{81, 46, 2, 77, 83, 249, 236, 17}
	DiscExecuteTrade       = []byte{77, 16, 192, 135, 13, 0, 106, 97}
	DiscOpenPosition       = []byte{135, 128, 47, 77, 15, 152, 240, 49}
	DiscClosePosition      = []byte{123, 134, 81, 0, 49, 68, 98, 98}
	DiscReducePosition     = []byte{96, 202, 33, 80, 24, 197, 33, 77}
	DiscUpdatePositionVal  = []byte{145, 223, 12, 91, 243, 113, 17, 102}
	DiscAccrueFees         = []byte{136, 229, 178, 88, 250, 122, 35, 46}
	DiscClaimFees          = []byte{82, 251, 233, 156, 12, 52, 184, 202}
	DiscInitiateVaultClose = []byte{229, 252, 232, 55, 28, 106, 95, 205}
	DiscCloseVault         = []byte{141, 103, 17, 126, 72, 75, 29, 29}
	DiscUnlockLicense      = []byte{221, 254, 125, 81, 195, 13, 71, 81}
	DiscForceCloseLegacy   = []byte{4, 63, 129, 80, 133, 247, 106, 95}
	DiscCreateInvestorCfg  = []byte{94, 162, 45, 56, 46, 136, 10, 251}
	DiscUpdateInvestorCfg  = []byte{86, 69, 194, 148, 87, 10, 47, 91}
	DiscFollowOn           = []byte{135, 121, 29, 109, 179, 193, 218, 149}
	DiscFollowOff          = []byte{98, 76, 67, 125, 101, 143, 184, 40}
	DiscUpdateVault        = []byte{67, 229, 185, 188, 226, 11, 210, 60}
	DiscKeeperRefresh      = []byte{241, 121, 91, 191, 36, 185, 253, 141}
)
