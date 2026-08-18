use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Strategist {
    pub owner: Pubkey,
    pub vault_count: u64,
    pub active_vault_count: u64,
    pub is_active: bool,
    pub bump: u8,
}
