use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::OneVaultError;
use crate::instructions::risk_ix::refresh_vault_risk_from_nav;
use crate::state::{ProtocolConfig, Vault, VaultRiskState};

/// Permissionless keeper: refresh NAV + risk metrics for a vault.
#[derive(Accounts)]
pub struct KeeperRefreshVault<'info> {
    #[account(mut, seeds = [VAULT_SEED, vault.strategist.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [VAULT_RISK_SEED, vault.key().as_ref()], bump = vault_risk_state.bump,
        constraint = vault_risk_state.vault == vault.key())]
    pub vault_risk_state: Account<'info, VaultRiskState>,

    #[account(constraint = vault_token_account.key() == vault.vault_token_account)]
    pub vault_token_account: Account<'info, anchor_spl::token::TokenAccount>,
}

pub fn handle_keeper_refresh_vault(ctx: Context<KeeperRefreshVault>) -> Result<()> {
    let vault_key = ctx.accounts.vault.key();
    let vault = &mut ctx.accounts.vault;
    vault.total_assets = ctx.accounts.vault_token_account.amount;
    refresh_vault_risk_from_nav(vault_key, vault, &mut ctx.accounts.vault_risk_state)?;
    Ok(())
}

#[derive(Accounts)]
pub struct KeeperResetRisk<'info> {
    pub keeper: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump,
        constraint = protocol_config.authority == keeper.key() @ OneVaultError::Unauthorized)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [VAULT_RISK_SEED, vault.key().as_ref()], bump = vault_risk_state.bump,
        constraint = vault_risk_state.vault == vault.key())]
    pub vault_risk_state: Account<'info, VaultRiskState>,
}

pub fn handle_keeper_reset_risk(ctx: Context<KeeperResetRisk>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let risk = &mut ctx.accounts.vault_risk_state;
    risk.circuit_breaker_active = false;
    risk.daily_loss_bps = 0;
    risk.last_reset_day = VaultRiskState::day_index(now);
    Ok(())
}
