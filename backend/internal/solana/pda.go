package solana

import (
	"bytes"
	"encoding/binary"

	"github.com/gagliardetto/solana-go"
	"github.com/mr-tron/base58"
)

var (
	SystemProgramID = solana.SystemProgramID
	TokenProgramID  = solana.TokenProgramID
	ATAProgramID    = solana.SPLAssociatedTokenAccountProgramID
	RentSysvar      = solana.SysVarRentPubkey
	WSOL            = solana.MustPublicKeyFromBase58("So11111111111111111111111111111111111111112")
)

func MustPK(s string) solana.PublicKey {
	return solana.MustPublicKeyFromBase58(s)
}

func ParsePK(s string) (solana.PublicKey, error) {
	return solana.PublicKeyFromBase58(s)
}

func U64LE(v uint64) []byte {
	b := make([]byte, 8)
	binary.LittleEndian.PutUint64(b, v)
	return b
}

func U16LE(v uint16) []byte {
	b := make([]byte, 2)
	binary.LittleEndian.PutUint16(b, v)
	return b
}

func U8(v uint8) []byte {
	return []byte{v}
}

func EncodeBytes(data []byte) []byte {
	out := make([]byte, 4+len(data))
	binary.LittleEndian.PutUint32(out, uint32(len(data)))
	copy(out[4:], data)
	return out
}

func EncodeString(s string) []byte {
	return EncodeBytes([]byte(s))
}

func EncodePubkeyVec(keys []solana.PublicKey) []byte {
	out := make([]byte, 4+len(keys)*32)
	binary.LittleEndian.PutUint32(out, uint32(len(keys)))
	for i, k := range keys {
		copy(out[4+i*32:], k[:])
	}
	return out
}

func PDA(program solana.PublicKey, seeds ...[]byte) (solana.PublicKey, uint8, error) {
	return solana.FindProgramAddress(seeds, program)
}

func MustPDA(program solana.PublicKey, seeds ...[]byte) solana.PublicKey {
	pk, _, err := PDA(program, seeds...)
	if err != nil {
		panic(err)
	}
	return pk
}

func ProtocolPDA(program solana.PublicKey) solana.PublicKey {
	return MustPDA(program, []byte("protocol"))
}

func StrategistPDA(program, strategist solana.PublicKey) solana.PublicKey {
	return MustPDA(program, []byte("strategist"), strategist[:])
}

func LicensePDA(program, strategist solana.PublicKey) solana.PublicKey {
	return MustPDA(program, []byte("license"), strategist[:])
}

func LicenseVaultPDA(program, strategist solana.PublicKey) solana.PublicKey {
	return MustPDA(program, []byte("license_vault"), strategist[:])
}

func VaultPDA(program, strategist solana.PublicKey, vaultID uint64) solana.PublicKey {
	return MustPDA(program, []byte("vault"), strategist[:], U64LE(vaultID))
}

func ShareMintPDA(program, vault solana.PublicKey) solana.PublicKey {
	return MustPDA(program, []byte("share_mint"), vault[:])
}

func VaultFeePDA(program, vault solana.PublicKey) solana.PublicKey {
	return MustPDA(program, []byte("vault_fee"), vault[:])
}

func VaultLicensePDA(program, vault solana.PublicKey) solana.PublicKey {
	return MustPDA(program, []byte("vault_license"), vault[:])
}

func InvestorConfigPDA(program, vault, investor solana.PublicKey) solana.PublicKey {
	return MustPDA(program, []byte("investor_config"), vault[:], investor[:])
}

func TradePDA(program, vault solana.PublicKey, tradeID uint64) solana.PublicKey {
	return MustPDA(program, []byte("trade"), vault[:], U64LE(tradeID))
}

func VaultPositionPDA(program, vault solana.PublicKey, positionID uint64) solana.PublicKey {
	return MustPDA(program, []byte("vault_position"), vault[:], U64LE(positionID))
}

func FeeUnwrapPDA(program, vault, owner solana.PublicKey) solana.PublicKey {
	return MustPDA(program, []byte("fee_unwrap"), vault[:], owner[:])
}

func ATA(mint, owner solana.PublicKey) solana.PublicKey {
	addr, _, err := solana.FindAssociatedTokenAddress(owner, mint)
	if err != nil {
		panic(err)
	}
	return addr
}

func Meta(pubkey solana.PublicKey, isSigner, isWritable bool) solana.AccountMeta {
	return solana.AccountMeta{PublicKey: pubkey, IsSigner: isSigner, IsWritable: isWritable}
}

func Ix(program solana.PublicKey, data []byte, accounts ...solana.AccountMeta) solana.Instruction {
	metas := make([]*solana.AccountMeta, len(accounts))
	for i := range accounts {
		m := accounts[i]
		metas[i] = &m
	}
	return solana.NewInstruction(program, metas, data)
}

func Concat(parts ...[]byte) []byte {
	return bytes.Join(parts, nil)
}

func Base58(pk solana.PublicKey) string {
	return base58.Encode(pk[:])
}
