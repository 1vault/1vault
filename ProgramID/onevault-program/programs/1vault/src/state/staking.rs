use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct StakingPool {
    pub platform_token_mint: Pubkey,
    pub total_staked: u64,
    pub reward_per_token: u128,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct StakerAccount {
    pub owner: Pubkey,
    pub staked_amount: u64,
    pub stake_start: i64,
    pub lock_duration_secs: i64,
    pub tier: u8,
    pub fee_discount_bps: u16,
    pub pending_rewards: u64,
    pub reward_debt: u128,
    pub bump: u8,
}
