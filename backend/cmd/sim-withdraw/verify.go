//go:build ignore

package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"strings"

	"github.com/1vault/backend/internal/cluster"
	s "github.com/1vault/backend/internal/solana"
	"github.com/1vault/backend/internal/txprep"
	"github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

func main() {
	rpcURL := os.Getenv("RPC_URL")
	if rpcURL == "" {
		rpcURL = "https://devnet.helius-rpc.com/?api-key=411af969-853a-430a-b169-c052862261b8"
	}
	vault := s.MustPK("51UmWAMsiQxJ4gngVabo7r7pRJx63marsxNppby8UmsW")
	investor := s.MustPK("ETCBEqkrKYM6S7M7nqAJadmkDKZrTmftZLwsaoXFtpMR")
	addr := cluster.AddressesFor(cluster.Devnet, rpcURL, "")
	rpcClient := txprep.NewRPC(rpcURL)
	vd, _ := rpcClient.AccountData(vault)
	vta, _ := s.DecodeVaultTokenAccount(vd)

	prep, err := txprep.NewBuilder(addr, rpcClient).WithdrawOpts(txprep.WithdrawParams{
		Investor: investor, Vault: vault, VaultTokenAccount: vta, Shares: 110_000_000,
	})
	if err != nil {
		fmt.Println("build", err)
		return
	}
	raw, _ := base64.StdEncoding.DecodeString(prep.TransactionBase64)
	tx, err := solana.TransactionFromBytes(raw)
	if err != nil {
		fmt.Println("decode", err)
		return
	}
	r := rpc.New(rpcURL)
	ctx := context.Background()
	bh, _ := r.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	tx.Message.RecentBlockhash = bh.Value.Blockhash
	sim, err := r.SimulateTransaction(ctx, tx)
	if err != nil {
		fmt.Println("sim", err)
		return
	}
	if sim.Value.Err != nil {
		fmt.Println("FAILED", sim.Value.Err)
		for _, l := range sim.Value.Logs {
			if strings.Contains(l, "AnchorError") || strings.Contains(l, "Program log") {
				fmt.Println(l)
			}
		}
	} else {
		fmt.Println("OK withdraw simulation passed")
	}
}
