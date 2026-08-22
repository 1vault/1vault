package flow

import "fmt"

func PlanSteps(p StartParams) ([]plannedStep, error) {
	if p.Strategist == "" {
		return nil, fmt.Errorf("strategist required")
	}
	switch p.Mode {
	case ModeCreateVault:
		if p.VaultID == 0 {
			return nil, fmt.Errorf("vaultId required")
		}
		steps := []plannedStep{
			{Name: "register_strategist", SignerRole: "strategist", SignerPubkey: p.Strategist},
			{Name: "lock_license", SignerRole: "strategist", SignerPubkey: p.Strategist},
			{Name: "create_vault", SignerRole: "vault_token", SignerPubkey: p.Strategist, Meta: map[string]any{"coSign": p.VaultTokenAccount}},
		}
		for i, inv := range p.Investors {
			if inv.Pubkey == "" {
				continue
			}
			steps = append(steps,
				plannedStep{Name: "create_investor_config", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i}},
				plannedStep{Name: "update_investor_config", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i}},
			)
			af := true
			if inv.AutoFollow != nil {
				af = *inv.AutoFollow
			}
			if af {
				steps = append(steps, plannedStep{Name: "follow_on", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i}})
			}
			if inv.Lamports > 0 {
				steps = append(steps, plannedStep{Name: "park", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i, "lamports": inv.Lamports}})
			}
		}
		return steps, nil

	case ModeDeposit:
		if len(p.Investors) == 0 {
			return nil, fmt.Errorf("investors required")
		}
		var steps []plannedStep
		for i, inv := range p.Investors {
			if inv.Lamports == 0 {
				return nil, fmt.Errorf("investors[%d].lamports required", i)
			}
			steps = append(steps,
				plannedStep{Name: "create_investor_config", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i}},
				plannedStep{Name: "update_investor_config", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i}},
				plannedStep{Name: "park", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i, "lamports": inv.Lamports}},
			)
		}
		return steps, nil

	case ModeConfigureFollow:
		if len(p.Investors) == 0 {
			return nil, fmt.Errorf("investors required")
		}
		var steps []plannedStep
		for i, inv := range p.Investors {
			steps = append(steps,
				plannedStep{Name: "create_investor_config", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i}},
				plannedStep{Name: "update_investor_config", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i}},
			)
			af := true
			if inv.AutoFollow != nil {
				af = *inv.AutoFollow
			}
			if af {
				steps = append(steps, plannedStep{Name: "follow_on", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i}})
			} else {
				steps = append(steps, plannedStep{Name: "follow_off", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": i}})
			}
		}
		return steps, nil

	case ModeWithdraw:
		if len(p.Investors) == 0 {
			return nil, fmt.Errorf("investors required")
		}
		inv := p.Investors[0]
		if inv.Shares == 0 {
			return nil, fmt.Errorf("investors[0].shares required")
		}
		return []plannedStep{
			{Name: "withdraw", SignerRole: "investor", SignerPubkey: inv.Pubkey, Meta: map[string]any{"i": 0, "shares": inv.Shares}},
		}, nil

	case ModeOpenPosition:
		if p.SkipTradeSteps {
			if p.TradeID == 0 || p.PositionID == 0 {
				return nil, fmt.Errorf("tradeId and positionId required when skipTradeSteps")
			}
		} else if p.OutputMint == "" || p.TradeID == 0 || p.Amount == 0 {
			return nil, fmt.Errorf("outputMint, tradeId, amount required")
		}
		steps := []plannedStep{}
		if !p.SkipTradeSteps {
			steps = append(steps,
				plannedStep{Name: "request_trade", SignerRole: "strategist", SignerPubkey: p.Strategist},
				plannedStep{Name: "execute_trade", SignerRole: "strategist", SignerPubkey: p.Strategist},
			)
		}
		steps = append(steps,
			plannedStep{Name: "open_position", SignerRole: "strategist", SignerPubkey: p.Strategist},
			plannedStep{Name: "accrue_fees", SignerRole: "strategist", SignerPubkey: p.Strategist},
			plannedStep{Name: "close_position", SignerRole: "strategist", SignerPubkey: p.Strategist},
			plannedStep{Name: "claim_fees", SignerRole: "strategist", SignerPubkey: p.Strategist},
			plannedStep{Name: "update_nav", SignerRole: "strategist", SignerPubkey: p.Strategist},
		)
		return steps, nil

	case ModeExitPosition:
		if p.PositionID == 0 || p.TradeID == 0 {
			return nil, fmt.Errorf("positionId and tradeId required")
		}
		if p.InputMint == "" {
			return nil, fmt.Errorf("inputMint (token to sell) required")
		}
		return []plannedStep{
			{Name: "request_sell", SignerRole: "strategist", SignerPubkey: p.Strategist},
			{Name: "execute_trade", SignerRole: "strategist", SignerPubkey: p.Strategist},
			{Name: "exit_position", SignerRole: "strategist", SignerPubkey: p.Strategist},
			{Name: "update_nav", SignerRole: "strategist", SignerPubkey: p.Strategist},
		}, nil

	case ModeClaimFees:
		return []plannedStep{
			{Name: "accrue_fees", SignerRole: "strategist", SignerPubkey: p.Strategist},
			{Name: "claim_fees", SignerRole: "strategist", SignerPubkey: p.Strategist},
		}, nil

	case ModeCloseVault:
		return []plannedStep{
			{Name: "initiate_close", SignerRole: "strategist", SignerPubkey: p.Strategist},
			{Name: "close_vault", SignerRole: "strategist", SignerPubkey: p.Strategist},
			{Name: "unlock_license", SignerRole: "strategist", SignerPubkey: p.Strategist},
		}, nil

	default:
		return nil, fmt.Errorf("unsupported mode %q", p.Mode)
	}
}
