package txprep_test

import (
	"os"
	"testing"

	"github.com/1vault/backend/internal/cluster"
	"github.com/1vault/backend/internal/txprep"
	"github.com/gagliardetto/solana-go"
)

func TestRegisterStrategistPrep(t *testing.T) {
	rpc := os.Getenv("DEVNET_RPC_URL")
	if rpc == "" {
		rpc = "https://api.devnet.solana.com"
	}
	addr := cluster.AddressesFor(cluster.Devnet, rpc, "")
	b := txprep.NewBuilder(addr, txprep.NewRPC(addr.RPCURL))
	st := solana.NewWallet().PublicKey()
	p, err := b.RegisterStrategist(st)
	if err != nil {
		t.Fatal(err)
	}
	if p.TransactionBase64 == "" || p.RecentBlockhash == "" {
		t.Fatalf("empty prep: %+v", p)
	}
	if len(p.Signers) != 1 || p.FeePayer != st.String() {
		t.Fatalf("signers/feePayer mismatch: %+v", p)
	}
	t.Logf("blockhash=%s txBytes~%d", p.RecentBlockhash, len(p.TransactionBase64)*3/4)
}
