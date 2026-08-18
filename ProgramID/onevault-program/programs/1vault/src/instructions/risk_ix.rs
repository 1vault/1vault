use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::OneVaultError;
use crate::events::RiskCircuitBreakerTripped;
use crate::state::{CircuitBreakerReason, ProtocolConfig, Vault, VaultRiskState};

#[derive(Accounts)]
pub struct InitVaultRisk<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub vault: Account<'info, Vault>,

    #[account(init, payer = payer, space = 8 + VaultRiskState::INIT_SPACE,
        seeds = [VAULT_RISK_SEED, vault.key().as_ref()], bump)]
    pub vault_risk_state: Account<'info, VaultRiskState>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_vault_risk(ctx: Context<InitVaultRisk>) -> Result<()> {
    let risk = &mut ctx.accounts.vault_risk_state;
    risk.vault = ctx.accounts.vault.key();
    risk.daily_loss_limit_bps = DEFAULT_DAILY_LOSS_LIMIT_BPS;
    risk.daily_loss_bps = 0;
    risk.max_drawdown_bps = DEFAULT_MAX_DRAWDOWN_BPS;
    risk.current_drawdown_bps = 0;
    risk.peak_nav = 0;
    risk.last_reset_day = VaultRiskState::day_index(Clock::get()?.unix_timestamp);
    risk.circuit_breaker_active = false;
    risk.bump = ctx.bumps.vault_risk_state;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateVaultRisk<'info> {
    pub strategist: Signer<'info>,

    #[account(seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [VAULT_RISK_SEED, vault.key().as_ref()], bump = vault_risk_state.bump,
        constraint = vault_risk_state.vault == vault.key())]
    pub vault_risk_state: Account<'info, VaultRiskState>,
}

pub fn handle_update_vault_risk(
    ctx: Context<UpdateVaultRisk>,
    daily_loss_limit_bps: Option<u16>,
    max_drawdown_bps: Option<u16>,
) -> Result<()> {
    let risk = &mut ctx.accounts.vault_risk_state;
    if let Some(v) = daily_loss_limit_bps {
        require!(v <= BPS_DENOMINATOR as u16, OneVaultError::InvalidFeeConfig);
        risk.daily_loss_limit_bps = v;
    }
    if let Some(v) = max_drawdown_bps {
        require!(v <= BPS_DENOMINATOR as u16, OneVaultError::InvalidFeeConfig);
        risk.max_drawdown_bps = v;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct ResetVaultRisk<'info> {
    pub authority: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump,
        constraint = protocol_config.authority == authority.key() @ OneVaultError::Unauthorized)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut, seeds = [VAULT_RISK_SEED, vault.key().as_ref()], bump = vault_risk_state.bump,
        constraint = vault_risk_state.vault == vault.key())]
    pub vault_risk_state: Account<'info, VaultRiskState>,

    pub vault: Account<'info, Vault>,
}

pub fn handle_reset_vault_risk(ctx: Context<ResetVaultRisk>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let risk = &mut ctx.accounts.vault_risk_state;
    risk.circuit_breaker_active = false;
    risk.daily_loss_bps = 0;
    risk.last_reset_day = VaultRiskState::day_index(now);
    Ok(())
}

pub fn assert_vault_risk_allows_trade(risk: &VaultRiskState) -> Result<()> {
    require!(risk.is_trade_allowed(), OneVaultError::CircuitBreakerActive);
    Ok(())
}

pub fn refresh_vault_risk_from_nav(
    vault_key: Pubkey,
    vault: &Vault,
    risk: &mut VaultRiskState,
) -> Result<bool> {
    let now = Clock::get()?.unix_timestamp;
    risk.maybe_reset_day(now);
    let nav = vault.nav()?;
    risk.record_nav(nav)?;
    if !risk.evaluate_limits(now)? {
        emit!(RiskCircuitBreakerTripped {
            vault: vault_key,
            reason: CircuitBreakerReason::MaxDrawdown as u8,
            drawdown_bps: risk.current_drawdown_bps,
            timestamp: now,
        });
        return Ok(false);
    }
    Ok(true)
}

pub fn record_position_loss(
    vault_key: Pubkey,
    vault: &Vault,
    risk: &mut VaultRiskState,
    loss_bps: u16,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    risk.maybe_reset_day(now);
    risk.record_daily_loss(loss_bps);
    let nav = vault.nav()?;
    risk.record_nav(nav)?;
    if !risk.evaluate_limits(now)? {
        emit!(RiskCircuitBreakerTripped {
            vault: vault_key,
            reason: CircuitBreakerReason::DailyLossLimit as u8,
            drawdown_bps: risk.daily_loss_bps,
            timestamp: now,
        });
    }
    Ok(())
}
