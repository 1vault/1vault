use anchor_lang::prelude::*;

use super::{PositionMode, TradeAction, TradeStatus, TradeVenue};

#[account]
#[derive(InitSpace)]
pub struct TradeRequest {
    pub vault: Pubkey,
    pub strategist: Pubkey,
    pub trade_id: u64,
    pub action: TradeAction,
    pub trade_venue: TradeVenue,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub position_mode: PositionMode,
    pub amount: u64,
    pub max_slippage_bps: u16,
    pub min_amount_out: u64,
    pub take_profit_bps: u16,
    pub stop_loss_bps: u16,
    pub linked_position_id: u64,
    pub status: TradeStatus,
    pub created_at: i64,
    pub bump: u8,
}
