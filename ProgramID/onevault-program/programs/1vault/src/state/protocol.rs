use anchor_lang::prelude::*;

use crate::constants::MAX_ALLOWED_DEX;
use super::TradeVenue;

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub platform_token_mint: Pubkey,
    pub license_lock_amount: u64,
    pub performance_fee_bps: u16,
    pub is_paused: bool,
    pub allowed_dex_count: u8,
    pub allowed_dex_programs: [Pubkey; MAX_ALLOWED_DEX],
    pub launchpad_program_count: u8,
    pub launchpad_programs: [Pubkey; MAX_ALLOWED_DEX],
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

    pub fn is_launchpad_allowed(&self, program: &Pubkey) -> bool {
        self.launchpad_programs[..self.launchpad_program_count as usize]
            .iter()
            .any(|p| p == program)
    }

    pub fn is_trade_program_allowed(&self, program: &Pubkey, venue: TradeVenue) -> bool {
        match venue {
            TradeVenue::Launchpad => self.is_launchpad_allowed(program),
            TradeVenue::Dex => self.is_dex_allowed(program),
        }
    }
}
