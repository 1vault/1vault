//! Integration tests for 1Vault MVP (Phase 1)

use anchor_lang::prelude::Pubkey;

#[test]
fn protocol_constants_match_spec() {
    assert_eq!(onevault::DEFAULT_WITHDRAWAL_FEE_BPS, 50);
    assert_eq!(onevault::DEFAULT_LICENSE_LOCK_AMOUNT, 1_000_000_000_000);
    assert_eq!(onevault::BPS_DENOMINATOR, 10_000);
}

#[test]
fn program_id_is_set() {
    use anchor_lang::prelude::Pubkey;
    assert_ne!(onevault::ID, Pubkey::default());
}

#[test]
fn deposit_and_withdraw_use_same_nav_basis() {
    use onevault::state::{MevMode, StrategyType, Vault, VaultStatus};

    let vault = Vault {
        strategist: Pubkey::default(),
        vault_id: 1,
        name: "t".into(),
        description: String::new(),
        strategy_type: StrategyType::Custom,
        yield_strategy: onevault::YieldStrategy::None,
        base_mint: Pubkey::default(),
        accepted_mint_count: 1,
        accepted_mints: [Pubkey::default(); onevault::MAX_ACCEPTED_MINTS],
        share_mint: Pubkey::default(),
        vault_token_account: Pubkey::default(),
        total_shares: 1_000,
        total_assets: 600,
        position_value: 400,
        staked_value: 0,
        high_water_mark: onevault::SHARE_PRICE_SCALE,
        performance_fee_bps: 2_000,
        status: VaultStatus::Active,
        mev_mode: MevMode::Standard,
        max_position_bps: 5_000,
        max_exposure_bps: 8_000,
        max_open_positions: 3,
        max_slippage_bps: 100,
        dca_enabled: false,
        dca_count: 0,
        dca_allocation_bps: 0,
        open_positions_count: 0,
        pending_trades_count: 0,
        active_followers: 0,
        estimated_follower_capital: 0,
        next_trade_id: 1,
        next_position_id: 1,
        bump: 0,
        share_mint_bump: 0,
    };

    let nav = vault.nav().unwrap();
    assert_eq!(nav, 1_000);

    let deposit = 100u64;
    let shares = (deposit as u128 * vault.total_shares as u128 / nav as u128) as u64;
    assert_eq!(shares, 100);

    let withdraw_shares = 100u64;
    let gross = (withdraw_shares as u128 * nav as u128 / vault.total_shares as u128) as u64;
    assert_eq!(gross, 100);
}

#[test]
fn close_payout_is_pro_rata_and_last_holder_gets_dust() {
    use onevault::state::Vault;

    let mut remaining_shares = 300u64;
    let mut remaining_nav = 1_000u64;

    let a = Vault::close_payout(100, remaining_shares, remaining_nav).unwrap();
    remaining_shares -= 100;
    remaining_nav -= a;
    let b = Vault::close_payout(100, remaining_shares, remaining_nav).unwrap();
    remaining_shares -= 100;
    remaining_nav -= b;
    let c = Vault::close_payout(100, remaining_shares, remaining_nav).unwrap();

    assert_eq!(a, 333);
    assert_eq!(b, 333);
    assert_eq!(c, 334);
    assert_eq!(a + b + c, 1_000);
    assert_eq!(c, remaining_nav);
}

#[test]
fn vault_closing_allows_retail_withdraw() {
    use onevault::state::{MevMode, StrategyType, Vault, VaultStatus};

    let mut vault = Vault {
        strategist: Pubkey::default(),
        vault_id: 1,
        name: "t".into(),
        description: String::new(),
        strategy_type: StrategyType::Custom,
        yield_strategy: onevault::YieldStrategy::None,
        base_mint: Pubkey::default(),
        accepted_mint_count: 1,
        accepted_mints: [Pubkey::default(); onevault::MAX_ACCEPTED_MINTS],
        share_mint: Pubkey::default(),
        vault_token_account: Pubkey::default(),
        total_shares: 500,
        total_assets: 500,
        position_value: 0,
        staked_value: 0,
        high_water_mark: onevault::SHARE_PRICE_SCALE,
        performance_fee_bps: 2_000,
        status: VaultStatus::Active,
        mev_mode: MevMode::Standard,
        max_position_bps: 5_000,
        max_exposure_bps: 8_000,
        max_open_positions: 3,
        max_slippage_bps: 100,
        dca_enabled: false,
        dca_count: 0,
        dca_allocation_bps: 0,
        open_positions_count: 0,
        pending_trades_count: 0,
        active_followers: 0,
        estimated_follower_capital: 0,
        next_trade_id: 1,
        next_position_id: 1,
        bump: 0,
        share_mint_bump: 0,
    };

    assert!(vault.is_liquid_for_close());
    assert!(vault.accepts_deposits());
    assert!(vault.accepts_withdrawals());

    vault.status = VaultStatus::Closing;
    assert!(!vault.accepts_deposits());
    assert!(vault.accepts_withdrawals());

    vault.status = VaultStatus::Closed;
    assert!(!vault.accepts_withdrawals());
}

#[test]
fn tp_sl_triggers_at_threshold() {
    use onevault::state::{PositionStatus, VaultPosition};
    use onevault::utils::evaluate_tp_sl;

    let position = VaultPosition {
        vault: Pubkey::default(),
        position_id: 1,
        input_mint: Pubkey::default(),
        output_mint: Pubkey::default(),
        entry_value: 1_000,
        current_value: 1_000,
        output_amount: 0,
        take_profit_bps: 3_000,
        stop_loss_bps: 1_000,
        dca_entries_completed: 1,
        dca_entries_total: 1,
        status: PositionStatus::Open,
        opened_at: 0,
        bump: 0,
    };

    assert!(evaluate_tp_sl(&position, 1_299).unwrap().is_none());
    assert!(evaluate_tp_sl(&position, 1_300).unwrap().is_some());
    assert!(evaluate_tp_sl(&position, 900).unwrap().is_some());
}

#[test]
fn investor_defaults_include_tp_sl_mandate() {
    use onevault::state::InvestorVaultConfig;

    let cfg = InvestorVaultConfig::default_settings(Pubkey::default(), Pubkey::default(), 1);
    assert_eq!(cfg.take_profit_bps, 2_000);
    assert_eq!(cfg.stop_loss_bps, 500);
    assert!(cfg.auto_follow);
    assert!(cfg.follow_tp_sl);
}

#[test]
fn trade_mints_allow_any_launchpad_token() {
    use onevault::state::{MevMode, StrategyType, TradeAction, Vault, VaultStatus, YieldStrategy};
    use onevault::utils::validate_trade_mints;

    let base = Pubkey::new_unique();
    let meme = Pubkey::new_unique();
    let vault = Vault {
        strategist: Pubkey::default(),
        vault_id: 1,
        name: "t".into(),
        description: String::new(),
        strategy_type: StrategyType::Custom,
        yield_strategy: YieldStrategy::None,
        base_mint: base,
        accepted_mint_count: 1,
        accepted_mints: [base; onevault::MAX_ACCEPTED_MINTS],
        share_mint: Pubkey::default(),
        vault_token_account: Pubkey::default(),
        total_shares: 0,
        total_assets: 0,
        position_value: 0,
        staked_value: 0,
        high_water_mark: onevault::SHARE_PRICE_SCALE,
        performance_fee_bps: 0,
        status: VaultStatus::Active,
        mev_mode: MevMode::Standard,
        max_position_bps: 5_000,
        max_exposure_bps: 8_000,
        max_open_positions: 3,
        max_slippage_bps: 100,
        dca_enabled: false,
        dca_count: 0,
        dca_allocation_bps: 0,
        open_positions_count: 0,
        pending_trades_count: 0,
        active_followers: 0,
        estimated_follower_capital: 0,
        next_trade_id: 1,
        next_position_id: 1,
        bump: 0,
        share_mint_bump: 0,
    };

    assert!(validate_trade_mints(&vault, TradeAction::Buy, base, meme).is_ok());
    assert!(validate_trade_mints(&vault, TradeAction::Sell, meme, base).is_ok());
}
