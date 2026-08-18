use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VaultStakeState {
    pub vault: Pubkey,
    pub stake_account: Pubkey,
    pub validator_vote_account: Pubkey,
    pub staked_lamports: u64,
    pub pending_unstake: u64,
    pub last_synced_at: i64,
    pub bump: u8,
}
