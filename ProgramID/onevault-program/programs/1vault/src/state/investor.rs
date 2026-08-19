use anchor_lang::prelude::*;

use super::{AllocationMode, DcaMode};

#[account]
#[derive(InitSpace)]
pub struct InvestorVaultConfig {
    pub vault: Pubkey,
    pub investor: Pubkey,
    pub auto_follow: bool,
    pub allocation_mode: AllocationMode,
    pub position_size: u64,
    pub max_position_bps: u16,
    pub max_exposure_bps: u16,
    pub max_open_positions: u8,
    pub follow_dca: bool,
    pub dca_mode: DcaMode,
    pub dca_allocation_bps: u16,
    pub open_positions_count: u8,
    pub total_exposure_value: u64,
    pub follow_partial_exit: bool,
    pub follow_full_exit: bool,
    pub follow_tp_sl: bool,
    pub max_slippage_bps: u16,
    pub bump: u8,
    /// Retail mandate: take-profit in bps of entry. Degen still executes the close.
    pub take_profit_bps: u16,
    /// Retail mandate: stop-loss in bps of entry.
    pub stop_loss_bps: u16,
}

impl InvestorVaultConfig {
    pub fn default_settings(vault: Pubkey, investor: Pubkey, bump: u8) -> Self {
        Self {
            vault,
            investor,
            auto_follow: true,
            allocation_mode: AllocationMode::Percentage,
            position_size: 0,
            max_position_bps: 5_000,
            max_exposure_bps: 8_000,
            max_open_positions: 3,
            follow_dca: false,
            dca_mode: DcaMode::FollowStrategist,
            dca_allocation_bps: 0,
            open_positions_count: 0,
            total_exposure_value: 0,
            follow_partial_exit: true,
            follow_full_exit: true,
            follow_tp_sl: true,
            max_slippage_bps: 100,
            bump,
            take_profit_bps: 2_000,
            stop_loss_bps: 500,
        }
    }
}
