package signing_test

import (
	"encoding/base64"
	"testing"

	"github.com/1vault/backend/internal/signing"
	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/programs/system"
)

func twoSignerTx(t *testing.T) (tx *solana.Transaction, fee solana.PrivateKey, co solana.PrivateKey) {
	t.Helper()
	feeW := solana.NewWallet()
	coW := solana.NewWallet()
	fee, co = feeW.PrivateKey, coW.PrivateKey
	var bh solana.Hash
	copy(bh[:], []byte("abcdefghijklmnopqrstuvwxyz012345"))

	// Transfer + make co a signer via an instruction that requires it as signer.
	// Use SystemProgram Allocate which needs the account as signer.
	ixTransfer := system.NewTransferInstruction(1, fee.PublicKey(), co.PublicKey()).Build()
	ixAlloc := system.NewAllocateInstruction(0, co.PublicKey()).Build()
	built, err := solana.NewTransaction(
		[]solana.Instruction{ixTransfer, ixAlloc},
		bh,
		solana.TransactionPayer(fee.PublicKey()),
	)
	if err != nil {
		t.Fatal(err)
	}
	return built, fee, co
}

func TestMergePartialPreservesEOA(t *testing.T) {
	tx, fee, co := twoSignerTx(t)
	signers := tx.Message.AccountKeys[:tx.Message.Header.NumRequiredSignatures]
	if len(signers) < 2 {
		t.Fatalf("expected >=2 signers, got %d", len(signers))
	}

	// EOA partial-sign only (fee payer)
	if _, err := tx.PartialSign(func(key solana.PublicKey) *solana.PrivateKey {
		if key.Equals(fee.PublicKey()) {
			return &fee
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	raw, err := tx.MarshalBinary()
	if err != nil {
		t.Fatal(err)
	}

	details := []signing.Detail{
		{Pubkey: fee.PublicKey().String(), SignerKind: signing.KindEOA, UserMustSign: true},
		{Pubkey: co.PublicKey().String(), SignerKind: signing.KindEphemeral, UserMustSign: false},
	}
	keys := map[string]solana.PrivateKey{co.PublicKey().String(): co}
	merged, err := signing.MergePartial(raw, details, keys)
	if err != nil {
		t.Fatal(err)
	}

	out, err := solana.TransactionFromBytes(merged)
	if err != nil {
		t.Fatal(err)
	}
	msg, err := out.Message.MarshalBinary()
	if err != nil {
		t.Fatal(err)
	}
	for i, pk := range out.Message.AccountKeys[:out.Message.Header.NumRequiredSignatures] {
		if out.Signatures[i].IsZero() {
			t.Fatalf("empty signature slot %d for %s", i, pk)
		}
		if !out.Signatures[i].Verify(pk, msg) {
			t.Fatalf("signature verify failed for %s at index %d", pk, i)
		}
	}
	_ = base64.StdEncoding.EncodeToString(merged)
}

func TestMergePartialAfterRemarshal(t *testing.T) {
	// Simulate: encode → decode → re-encode (like web3.js roundtrip) then merge.
	tx, fee, co := twoSignerTx(t)
	if _, err := tx.PartialSign(func(key solana.PublicKey) *solana.PrivateKey {
		if key.Equals(fee.PublicKey()) {
			return &fee
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	raw, _ := tx.MarshalBinary()

	// Roundtrip through TransactionFromBytes + MarshalBinary (gagliardetto only)
	mid, err := solana.TransactionFromBytes(raw)
	if err != nil {
		t.Fatal(err)
	}
	raw2, err := mid.MarshalBinary()
	if err != nil {
		t.Fatal(err)
	}

	details := []signing.Detail{
		{Pubkey: fee.PublicKey().String(), SignerKind: signing.KindEOA, UserMustSign: true},
		{Pubkey: co.PublicKey().String(), SignerKind: signing.KindEphemeral, UserMustSign: false},
	}
	merged, err := signing.MergePartial(raw2, details, map[string]solana.PrivateKey{co.PublicKey().String(): co})
	if err != nil {
		t.Fatal(err)
	}
	out, _ := solana.TransactionFromBytes(merged)
	msg, _ := out.Message.MarshalBinary()
	for i, pk := range out.Message.AccountKeys[:out.Message.Header.NumRequiredSignatures] {
		if !out.Signatures[i].Verify(pk, msg) {
			t.Fatalf("verify failed index %d %s", i, pk)
		}
	}
}
