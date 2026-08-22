package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"

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
	strategist := s.MustPK("9WDdee1AwqRCJ2WSr9dDAcaoCXPkfd19vR5RQdc2zcan")
	demoMint := s.MustPK("6U3BSubjSMqk3nFNWdnFxLF636FUAqf8ANCTZDfJnbRd")
	r := txprep.NewRPC(rpcURL)
	addr := cluster.AddressesFor(cluster.Devnet, rpcURL, "")
	b := txprep.NewBuilder(addr, r)
	vd, _ := r.AccountData(vault)
	desc, slip, _ := s.DecodeVaultDescriptionAndSlippage(vd)
	_, np, _ := s.DecodeVaultNextIDs(vd)

	upd, err := b.UpdateVaultRisk(txprep.UpdateVaultRiskParams{
		Strategist: strategist, Vault: vault, Description: desc, MaxSlippageBps: slip,
		AcceptedMints: []solana.PublicKey{s.WSOL, demoMint},
	})
	if err != nil {
		panic(err)
	}
	raw, _ := base64.StdEncoding.DecodeString(upd.TransactionBase64)
	tx, _ := solana.TransactionFromBytes(raw)
	client := rpc.New(rpcURL)
	sim, err := client.SimulateTransactionWithOpts(context.Background(), tx, &rpc.SimulateTransactionOpts{
		Commitment: rpc.CommitmentConfirmed,
	})
	if err != nil {
		panic(err)
	}
	if sim.Value.Err != nil {
		fmt.Println("update_vault FAIL", sim.Value.Err)
		for _, l := range sim.Value.Logs {
			fmt.Println(" ", l)
		}
		return
	}
	fmt.Println("update_vault sim OK")

	op, _ := b.OpenPosition(txprep.OpenPositionParams{
		Strategist: strategist, Vault: vault, TradeID: 5, PositionID: np,
		EntryValue: 30_000_000, OutputAmount: 30_000_000,
	})
	raw2, _ := base64.StdEncoding.DecodeString(op.TransactionBase64)
	tx2, _ := solana.TransactionFromBytes(raw2)
	sim2, _ := client.SimulateTransactionWithOpts(context.Background(), tx2, &rpc.SimulateTransactionOpts{
		Commitment: rpc.CommitmentConfirmed,
	})
	if sim2.Value.Err != nil {
		fmt.Println("open_position still FAIL (allowlist not on-chain yet):", sim2.Value.Err)
	} else {
		fmt.Println("open_position sim OK")
	}
}
