use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct VaultFeeState {
    pub vault: Pubkey,
    pub strategist: Pubkey,
    pub accrued_performance_fees: u64,
    pub accrued_protocol_fees: u64,
    pub claimed_performance_fees: u64,
    pub claimed_protocol_fees: u64,
    pub last_fee_share_price: u64,
    pub bump: u8,
}

impl VaultFeeState {
    pub fn claimable_performance(&self) -> u64 {
        self.accrued_performance_fees
            .saturating_sub(self.claimed_performance_fees)
    }

    pub fn claimable_protocol(&self) -> u64 {
        self.accrued_protocol_fees
            .saturating_sub(self.claimed_protocol_fees)
    }
}
