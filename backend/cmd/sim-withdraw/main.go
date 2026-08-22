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
	investor := s.MustPK("ETCBEqkrKYM6S7M7nqAJadmkDKZrTmftZLwsaoXFtpMR")
	addr := cluster.AddressesFor(cluster.Devnet, rpcURL, "")
	program := s.MustPK(addr.ProgramID)
	shareMint := s.ShareMintPDA(program, vault)
	shareATA := s.ATA(shareMint, investor)
	cfg := s.InvestorConfigPDA(program, vault, investor)
	fmt.Println("program", program)
	fmt.Println("shareMint", shareMint)
	fmt.Println("shareATA", shareATA)
	fmt.Println("investorConfig", cfg)

	r := rpc.New(rpcURL)
	ctx := context.Background()
	for name, pk := range map[string]solana.PublicKey{
		"shareATA": shareATA, "investorConfig": cfg, "shareMint": shareMint,
	} {
		info, err := r.GetAccountInfo(ctx, pk)
		if err != nil || info == nil || info.Value == nil {
			fmt.Printf("%s: missing (%v)\n", name, err)
			continue
		}
		fmt.Printf("%s owner=%s lamports=%d data=%d\n", name, info.Value.Owner, info.Value.Lamports, len(info.Value.Data.GetBinary()))
	}

	rpcClient := txprep.NewRPC(rpcURL)
	vd, _ := rpcClient.AccountData(vault)
	vta, _ := s.DecodeVaultTokenAccount(vd)
	fmt.Println("vta", vta)

	prep, err := txprep.NewBuilder(addr, rpcClient).WithdrawOpts(txprep.WithdrawParams{
		Investor: investor, Vault: vault, VaultTokenAccount: vta, Shares: 110_000_000,
	})
	if err != nil {
		fmt.Println("build err", err)
		return
	}
	fmt.Println("prepared accounts", prep.Accounts)

	// decode + simulate
	raw, _ := base64.StdEncoding.DecodeString(prep.TransactionBase64)
	tx, err := solana.TransactionFromBytes(raw)
	if err != nil {
		fmt.Println("decode err", err)
		return
	}
	for i, ix := range tx.Message.Instructions {
		prog := tx.Message.AccountKeys[ix.ProgramIDIndex]
		fmt.Printf("ix %d program=%s accounts=%d data=%d\n", i, prog, len(ix.Accounts), len(ix.Data))
		if prog.Equals(program) && len(ix.Data) >= 8 {
			disc := ix.Data[:8]
			if string(disc) == string(s.DiscWithdraw) || (disc[0] == 183 && disc[1] == 18) {
				fmt.Println(" withdraw accounts:")
				for j, ai := range ix.Accounts {
					pk := tx.Message.AccountKeys[ai]
					info, _ := r.GetAccountInfo(ctx, pk)
					owner := "missing"
					if info != nil && info.Value != nil {
						owner = info.Value.Owner.String()
					}
					fmt.Printf("  [%d] %s owner=%s\n", j, pk, owner)
				}
			}
		}
	}

	sim, err := r.SimulateTransaction(ctx, tx)
	if err != nil {
		fmt.Println("sim err", err)
		return
	}
	if sim.Value.Err != nil {
		fmt.Println("sim failed", sim.Value.Err)
	}
	for _, l := range sim.Value.Logs {
		fmt.Println(l)
	}
}
