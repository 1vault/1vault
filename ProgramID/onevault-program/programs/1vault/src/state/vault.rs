use anchor_lang::prelude::*;

use crate::constants::MAX_ACCEPTED_MINTS;

use super::VaultStatus;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub strategist: Pubkey,
    pub vault_id: u64,
    #[max_len(64)]
    pub name: String,
    #[max_len(128)]
    pub description: String,
    pub base_mint: Pubkey,
    pub accepted_mint_count: u8,
    pub accepted_mints: [Pubkey; MAX_ACCEPTED_MINTS],
    pub share_mint: Pubkey,
    pub vault_token_account: Pubkey,
    pub total_shares: u64,
    pub total_assets: u64,
    pub position_value: u64,
    pub high_water_mark: u64,
    pub performance_fee_bps: u16,
    pub status: VaultStatus,
    pub max_slippage_bps: u16,
    pub open_positions_count: u8,
    pub pending_trades_count: u8,
    pub next_trade_id: u64,
    pub next_position_id: u64,
    pub bump: u8,
    pub share_mint_bump: u8,
}

impl Vault {
    pub fn share_price(&self) -> Result<u64> {
        if self.total_shares == 0 {
            return Ok(crate::constants::SHARE_PRICE_SCALE);
        }
        let nav = self.nav()?;
        let price = (nav as u128)
            .checked_mul(crate::constants::SHARE_PRICE_SCALE as u128)
            .and_then(|v| v.checked_div(self.total_shares as u128))
            .ok_or(error!(crate::OneVaultError::MathOverflow))?;
        Ok(price as u64)
    }

    pub fn nav(&self) -> Result<u64> {
        self.total_assets
            .checked_add(self.position_value)
            .ok_or(error!(crate::OneVaultError::MathOverflow))
    }

    pub fn close_payout(shares: u64, remaining_shares: u64, remaining_nav: u64) -> Result<u64> {
        if shares == 0 || remaining_shares == 0 {
            return Ok(0);
        }
        require!(
            shares <= remaining_shares,
            crate::OneVaultError::InsufficientShares
        );
        if shares == remaining_shares {
            return Ok(remaining_nav);
        }
        (shares as u128)
            .checked_mul(remaining_nav as u128)
            .and_then(|v| v.checked_div(remaining_shares as u128))
            .map(|v| v as u64)
            .ok_or(error!(crate::OneVaultError::MathOverflow))
    }

    pub fn is_operational(&self) -> bool {
        self.status == VaultStatus::Active
    }

    pub fn accepts_deposits(&self) -> bool {
        self.status == VaultStatus::Active
    }

    pub fn accepts_withdrawals(&self) -> bool {
        self.status != VaultStatus::Closed
    }

    pub fn is_liquid_for_close(&self) -> bool {
        self.open_positions_count == 0
            && self.pending_trades_count == 0
            && self.position_value == 0
    }

    pub fn is_mint_accepted(&self, mint: &Pubkey) -> bool {
        self.accepted_mints[..self.accepted_mint_count as usize]
            .iter()
            .any(|m| m == mint)
    }
}
