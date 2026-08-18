use anchor_lang::prelude::*;

use crate::constants::MAX_ALLOWED_DEX;
use crate::constants::MAX_STAKING_TIERS;
use super::MevMode;
use super::TradeVenue;

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub platform_token_mint: Pubkey,
    pub license_lock_amount: u64,
    pub withdrawal_fee_bps: u16,
    pub referral_fee_share_bps: u16,
    pub performance_fee_bps: u16,
    pub protocol_fee_share_bps: u16,
    pub is_paused: bool,
    pub allowed_dex_count: u8,
    pub allowed_dex_programs: [Pubkey; MAX_ALLOWED_DEX],
    pub protected_dex_count: u8,
    pub protected_dex_programs: [Pubkey; MAX_ALLOWED_DEX],
    pub launchpad_program_count: u8,
    pub launchpad_programs: [Pubkey; MAX_ALLOWED_DEX],
    pub tier_thresholds: [u64; MAX_STAKING_TIERS],
    pub tier_discounts_bps: [u16; MAX_STAKING_TIERS],
    pub upgrade_multisig: Pubkey,
    pub multisig_enabled: bool,
    pub bump: u8,
}

impl ProtocolConfig {
    pub fn is_dex_allowed(&self, program: &Pubkey) -> bool {
        self.allowed_dex_programs[..self.allowed_dex_count as usize]
            .iter()
            .any(|p| p == program)
    }

    pub fn is_protected_dex(&self, program: &Pubkey) -> bool {
        self.protected_dex_programs[..self.protected_dex_count as usize]
            .iter()
            .any(|p| p == program)
    }

    pub fn is_launchpad_allowed(&self, program: &Pubkey) -> bool {
        self.launchpad_programs[..self.launchpad_program_count as usize]
            .iter()
            .any(|p| p == program)
    }

    pub fn is_trade_program_allowed(&self, program: &Pubkey, mode: MevMode, venue: TradeVenue) -> bool {
        match venue {
            TradeVenue::Launchpad => self.is_launchpad_allowed(program),
            TradeVenue::Dex => self.is_dex_allowed_for_mev(program, mode),
        }
    }

    pub fn is_dex_allowed_for_mev(&self, program: &Pubkey, mode: MevMode) -> bool {
        match mode {
            MevMode::Standard => self.is_dex_allowed(program),
            MevMode::Protected => self.is_protected_dex(program),
        }
    }

    pub fn staking_discount_bps(&self, staked_amount: u64) -> u16 {
        let mut discount = 0u16;
        for i in (0..MAX_STAKING_TIERS).rev() {
            if staked_amount >= self.tier_thresholds[i] {
                discount = self.tier_discounts_bps[i];
                break;
            }
        }
        discount
    }
}
