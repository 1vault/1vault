use anchor_lang::prelude::*;

use super::PositionStatus;

#[account]
#[derive(InitSpace)]
pub struct VaultPosition {
    pub vault: Pubkey,
    pub position_id: u64,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub entry_value: u64,
    pub current_value: u64,
    pub output_amount: u64,
    pub take_profit_bps: u16,
    pub stop_loss_bps: u16,
    pub status: PositionStatus,
    pub opened_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct InvestorPosition {
    pub vault: Pubkey,
    pub investor: Pubkey,
    pub position_id: u64,
    pub vault_position_id: u64,
    pub entry_value: u64,
    pub current_value: u64,
    pub output_amount: u64,
    pub status: PositionStatus,
    pub bump: u8,
}
