use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct ReferralAccount {
    pub user: Pubkey,
    pub referrer: Pubkey,
    pub claimable_rewards: u64,
    pub total_earned: u64,
    pub bump: u8,
}
