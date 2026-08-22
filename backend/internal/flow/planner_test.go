package flow_test

import (
	"testing"

	"github.com/1vault/backend/internal/flow"
)

func TestPlanCreateVault(t *testing.T) {
	steps, err := flow.PlanSteps(flow.StartParams{
		Mode:              flow.ModeCreateVault,
		Strategist:        "Strat1111111111111111111111111111111111111",
		VaultTokenAccount: "Vta111111111111111111111111111111111111111",
		VaultID:           9,
		Investors: []flow.InvestorIn{
			{Pubkey: "Strat1111111111111111111111111111111111111", Role: "strategies", Lamports: 1e8},
			{Pubkey: "Ret1111111111111111111111111111111111111111", Role: "investors", Lamports: 5e7},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(steps) < 5 {
		t.Fatalf("expected multi-step plan, got %d", len(steps))
	}
	if steps[0].Name != "register_strategist" || steps[2].Name != "create_vault" {
		t.Fatalf("unexpected order: %+v", steps)
	}
}

func TestPlanOpenPosition(t *testing.T) {
	steps, err := flow.PlanSteps(flow.StartParams{
		Mode:       flow.ModeOpenPosition,
		Strategist: "Strat1111111111111111111111111111111111111",
		OutputMint: "So11111111111111111111111111111111111111112",
		TradeID:    1,
		Amount:     30_000_000,
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"request_trade", "execute_trade", "open_position", "accrue_fees", "close_position", "claim_fees", "update_nav"}
	if len(steps) != len(want) {
		t.Fatalf("got %d steps want %d: %+v", len(steps), len(want), steps)
	}
	for i := range want {
		if steps[i].Name != want[i] {
			t.Fatalf("step %d: got %s want %s", i, steps[i].Name, want[i])
		}
	}
}

func TestPlanExitPosition(t *testing.T) {
	steps, err := flow.PlanSteps(flow.StartParams{
		Mode:       flow.ModeExitPosition,
		Strategist: "Strat1111111111111111111111111111111111111",
		PositionID: 1,
		TradeID:    2,
		InputMint:  "TokenMint111111111111111111111111111111111",
		ExitPercent: 50,
	})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"request_sell", "execute_trade", "exit_position", "update_nav"}
	if len(steps) != len(want) {
		t.Fatalf("got %d steps: %+v", len(steps), steps)
	}
	for i := range want {
		if steps[i].Name != want[i] {
			t.Fatalf("step %d: got %s want %s", i, steps[i].Name, want[i])
		}
	}
}
