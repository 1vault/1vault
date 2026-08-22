package solana

import (
	"encoding/binary"

	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/programs/system"
	"github.com/gagliardetto/solana-go/programs/token"
)

// CreateIdempotentATA builds associated-token-account program createIdempotent ix.
func CreateIdempotentATA(payer, owner, mint solana.PublicKey) solana.Instruction {
	ata := ATA(mint, owner)
	return solana.NewInstruction(
		ATAProgramID,
		solana.AccountMetaSlice{
			{PublicKey: payer, IsSigner: true, IsWritable: true},
			{PublicKey: ata, IsSigner: false, IsWritable: true},
			{PublicKey: owner, IsSigner: false, IsWritable: false},
			{PublicKey: mint, IsSigner: false, IsWritable: false},
			{PublicKey: SystemProgramID, IsSigner: false, IsWritable: false},
			{PublicKey: TokenProgramID, IsSigner: false, IsWritable: false},
		},
		[]byte{1}, // CreateIdempotent
	)
}

func TransferLamports(from, to solana.PublicKey, lamports uint64) solana.Instruction {
	return system.NewTransferInstruction(lamports, from, to).Build()
}

func SyncNative(account solana.PublicKey) solana.Instruction {
	return token.NewSyncNativeInstruction(account).Build()
}

func CloseTokenAccount(account, dest, owner solana.PublicKey) solana.Instruction {
	return token.NewCloseAccountInstruction(account, dest, owner, nil).Build()
}

func SetComputeUnitLimit(units uint32) solana.Instruction {
	data := make([]byte, 5)
	data[0] = 2 // SetComputeUnitLimit
	binary.LittleEndian.PutUint32(data[1:], units)
	return solana.NewInstruction(
		solana.MustPublicKeyFromBase58("ComputeBudget111111111111111111111111111111"),
		nil,
		data,
	)
}

// SetComputeUnitPrice sets priority fee in micro-lamports per compute unit (gas tip).
func SetComputeUnitPrice(microLamports uint64) solana.Instruction {
	data := make([]byte, 9)
	data[0] = 3 // SetComputeUnitPrice
	binary.LittleEndian.PutUint64(data[1:], microLamports)
	return solana.NewInstruction(
		solana.MustPublicKeyFromBase58("ComputeBudget111111111111111111111111111111"),
		nil,
		data,
	)
}
