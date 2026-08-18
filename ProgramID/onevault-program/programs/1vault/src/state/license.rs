use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct License {
    pub strategist: Pubkey,
    pub locked_amount: u64,
    pub is_active: bool,
    pub bump: u8,
}
