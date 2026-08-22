package main

import (
	"encoding/binary"
	"fmt"

	s "github.com/1vault/backend/internal/solana"
	"github.com/gagliardetto/solana-go"
	"github.com/1vault/backend/internal/txprep"
)

func main() {
	rpc := txprep.NewRPC("https://devnet.helius-rpc.com/?api-key=411af969-853a-430a-b169-c052862261b8")
	program := s.MustPK("2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP")
	vault := s.MustPK("51UmWAMsiQxJ4gngVabo7r7pRJx63marsxNppby8UmsW")
	vd, _ := rpc.AccountData(vault)
	fmt.Println("vault len", len(vd))
	// accepted mints
	o := 8 + 32 + 8
	skip := func() {
		n := int(binary.LittleEndian.Uint32(vd[o : o+4]))
		o += 4 + n
	}
	skip()
	skip()
	o += 32 // base_mint
	cnt := int(vd[o])
	o++
	fmt.Println("accepted_mint_count", cnt)
	for i := 0; i < cnt && i < 5; i++ {
		m := solana.PublicKeyFromBytes(vd[o+i*32 : o+i*32+32])
		fmt.Println(" accepted", i, m)
	}
	// scan for next_trade_id=6 and next_position_id candidates
	for off := 360; off < 420; off++ {
		if off+16 <= len(vd) {
			a := binary.LittleEndian.Uint64(vd[off : off+8])
			b := binary.LittleEndian.Uint64(vd[off+8 : off+16])
			if a >= 1 && a <= 10 && b >= 1 && b <= 10 {
				fmt.Printf("off %d: u64=%d u64=%d\n", off, a, b)
			}
		}
	}
	for id := uint64(1); id <= 5; id++ {
		d, err := rpc.AccountData(s.TradePDA(program, vault, id))
		if err != nil {
			continue
		}
		fmt.Printf("\ntrade %d len=%d\n", id, len(d))
		if len(d) >= 146 {
			in := solana.PublicKeyFromBytes(d[82:114])
			out := solana.PublicKeyFromBytes(d[114:146])
			fmt.Printf("  input_mint=%s output_mint=%s\n", in, out)
		}
		for off := 160; off < 200 && off < len(d); off++ {
			if d[off] <= 3 {
				fmt.Printf("  byte@%d=%d\n", off, d[off])
			}
		}
	}
}
