use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{
    InvestorPosition, InvestorVaultConfig, PositionStatus, ProtocolConfig, Vault, VaultPosition,
};
use crate::utils::calc_investor_allocation;

fn apply_mirror_allocation(
    config: &InvestorVaultConfig,
    vault: &Vault,
    vault_position: &VaultPosition,
    investor_capital: u64,
    strategist_entry_value: u64,
) -> Result<u64> {
    if vault_position.dca_entries_completed > 1 && !config.follow_dca {
        return Ok(0);
    }

    let allocation = calc_investor_allocation(
        config.allocation_mode,
        config.position_size,
        investor_capital,
        strategist_entry_value,
        vault,
        config.dca_mode,
        config.dca_allocation_bps,
        vault_position.dca_entries_total,
    )?;

    if allocation == 0 {
        return Ok(0);
    }

    let max_position = crate::utils::apply_bps(investor_capital, config.max_position_bps)?;
    require!(allocation <= max_position, OneVaultError::InvestorRiskExceeded);

    let new_exposure = config
        .total_exposure_value
        .checked_add(allocation)
        .ok_or(OneVaultError::MathOverflow)?;
    let max_exposure = crate::utils::apply_bps(investor_capital, config.max_exposure_bps)?;
    require!(
        new_exposure <= max_exposure,
        OneVaultError::InvestorMaxExposureExceeded
    );

    require!(
        config.open_positions_count < config.max_open_positions,
        OneVaultError::InvestorMaxOpenPositions
    );

    Ok(allocation)
}

#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct MirrorPosition<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump = investor_config.bump, constraint = investor_config.investor == investor.key(),
        constraint = investor_config.auto_follow @ OneVaultError::AutoFollowDisabled)]
    pub investor_config: Account<'info, InvestorVaultConfig>,

    #[account(seeds = [VAULT_POSITION_SEED, vault.key().as_ref(), &vault_position.position_id.to_le_bytes()],
        bump = vault_position.bump, constraint = vault_position.vault == vault.key(),
        constraint = vault_position.status == PositionStatus::Open @ OneVaultError::PositionNotOpen)]
    pub vault_position: Account<'info, VaultPosition>,

    #[account(init, payer = investor, space = 8 + InvestorPosition::INIT_SPACE,
        seeds = [INVESTOR_POSITION_SEED, vault.key().as_ref(), investor.key().as_ref(), &position_id.to_le_bytes()],
        bump)]
    pub investor_position: Account<'info, InvestorPosition>,

    pub system_program: Program<'info, System>,
}

pub fn handle_mirror_position(
    ctx: Context<MirrorPosition>,
    position_id: u64,
    investor_capital: u64,
    strategist_entry_value: u64,
) -> Result<()> {
    let config = &ctx.accounts.investor_config;
    let vault = &ctx.accounts.vault;
    let vault_position = &ctx.accounts.vault_position;

    let allocation = apply_mirror_allocation(
        config,
        vault,
        vault_position,
        investor_capital,
        strategist_entry_value,
    )?;
    require!(allocation > 0, OneVaultError::InvalidAmount);

    let pos = &mut ctx.accounts.investor_position;
    pos.vault = vault.key();
    pos.investor = ctx.accounts.investor.key();
    pos.position_id = position_id;
    pos.vault_position_id = vault_position.position_id;
    pos.entry_value = allocation;
    pos.current_value = allocation;
    pos.output_amount = 0;
    pos.dca_entries_followed = if config.follow_dca {
        vault_position.dca_entries_completed
    } else {
        1
    };
    pos.status = PositionStatus::Open;
    pos.bump = ctx.bumps.investor_position;

    let config = &mut ctx.accounts.investor_config;
    config.open_positions_count = config.open_positions_count.saturating_add(1);
    config.total_exposure_value = config.total_exposure_value.saturating_add(allocation);

    emit!(crate::events::InvestorMirrored {
        vault: vault.key(),
        investor: ctx.accounts.investor.key(),
        position_id,
        allocation,
        auto_by_keeper: false,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

/// Keeper/strategist-initiated auto-follow for investors with Auto Follow ON.
#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct AutoMirrorPosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused)]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    pub vault: Box<Account<'info, Vault>>,

    /// CHECK: investor being mirrored
    pub investor: UncheckedAccount<'info>,

    #[account(mut, seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump = investor_config.bump, constraint = investor_config.investor == investor.key(),
        constraint = investor_config.auto_follow @ OneVaultError::AutoFollowDisabled)]
    pub investor_config: Box<Account<'info, InvestorVaultConfig>>,

    #[account(seeds = [VAULT_POSITION_SEED, vault.key().as_ref(), &vault_position.position_id.to_le_bytes()],
        bump = vault_position.bump, constraint = vault_position.vault == vault.key(),
        constraint = vault_position.status == PositionStatus::Open @ OneVaultError::PositionNotOpen)]
    pub vault_position: Box<Account<'info, VaultPosition>>,

    #[account(init, payer = payer, space = 8 + InvestorPosition::INIT_SPACE,
        seeds = [INVESTOR_POSITION_SEED, vault.key().as_ref(), investor.key().as_ref(), &position_id.to_le_bytes()],
        bump)]
    pub investor_position: Box<Account<'info, InvestorPosition>>,

    pub system_program: Program<'info, System>,
}

pub fn handle_auto_mirror_position(
    ctx: Context<AutoMirrorPosition>,
    position_id: u64,
    investor_capital: u64,
    strategist_entry_value: u64,
) -> Result<()> {
    let config = &ctx.accounts.investor_config;
    let vault = &ctx.accounts.vault;
    let vault_position = &ctx.accounts.vault_position;

    let allocation = apply_mirror_allocation(
        config,
        vault,
        vault_position,
        investor_capital,
        strategist_entry_value,
    )?;
    if allocation == 0 {
        return Ok(());
    }

    let pos = &mut ctx.accounts.investor_position;
    pos.vault = vault.key();
    pos.investor = ctx.accounts.investor.key();
    pos.position_id = position_id;
    pos.vault_position_id = vault_position.position_id;
    pos.entry_value = allocation;
    pos.current_value = allocation;
    pos.output_amount = 0;
    pos.dca_entries_followed = if config.follow_dca {
        vault_position.dca_entries_completed
    } else {
        1
    };
    pos.status = PositionStatus::Open;
    pos.bump = ctx.bumps.investor_position;

    let config = &mut ctx.accounts.investor_config;
    config.open_positions_count = config.open_positions_count.saturating_add(1);
    config.total_exposure_value = config.total_exposure_value.saturating_add(allocation);

    emit!(crate::events::InvestorMirrored {
        vault: vault.key(),
        investor: ctx.accounts.investor.key(),
        position_id,
        allocation,
        auto_by_keeper: true,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CloseInvestorPosition<'info> {
    pub investor: Signer<'info>,

    pub vault: Box<Account<'info, Vault>>,

    #[account(mut, seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump = investor_config.bump, constraint = investor_config.investor == investor.key())]
    pub investor_config: Box<Account<'info, InvestorVaultConfig>>,

    #[account(mut, seeds = [INVESTOR_POSITION_SEED, vault.key().as_ref(), investor.key().as_ref(),
        &investor_position.position_id.to_le_bytes()],
        bump = investor_position.bump, constraint = investor_position.investor == investor.key(),
        constraint = investor_position.status == PositionStatus::Open @ OneVaultError::PositionNotOpen,
        close = investor)]
    pub investor_position: Box<Account<'info, InvestorPosition>>,
}

pub fn handle_close_investor_position(ctx: Context<CloseInvestorPosition>, is_full_exit: bool) -> Result<()> {
    let config = &ctx.accounts.investor_config;
    if is_full_exit && !config.follow_full_exit {
        return Err(OneVaultError::AutoFollowDisabled.into());
    }
    if !is_full_exit && !config.follow_partial_exit {
        return Err(OneVaultError::AutoFollowDisabled.into());
    }

    let exposure = ctx.accounts.investor_position.current_value;
    let config = &mut ctx.accounts.investor_config;
    config.open_positions_count = config.open_positions_count.saturating_sub(1);
    config.total_exposure_value = config.total_exposure_value.saturating_sub(exposure);

    Ok(())
}

#[derive(Accounts)]
pub struct SyncInvestorPositionReduce<'info> {
    pub payer: Signer<'info>,

    pub vault: Account<'info, Vault>,

    /// CHECK: mirrored investor
    pub investor: UncheckedAccount<'info>,

    #[account(seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump = investor_config.bump, constraint = investor_config.investor == investor.key())]
    pub investor_config: Account<'info, InvestorVaultConfig>,

    #[account(mut, seeds = [INVESTOR_POSITION_SEED, vault.key().as_ref(), investor.key().as_ref(),
        &investor_position.position_id.to_le_bytes()],
        bump = investor_position.bump, constraint = investor_position.investor == investor.key(),
        constraint = investor_position.status == PositionStatus::Open @ OneVaultError::PositionNotOpen)]
    pub investor_position: Account<'info, InvestorPosition>,
}

pub fn handle_sync_investor_position_reduce(
    ctx: Context<SyncInvestorPositionReduce>,
    reduce_bps: u16,
) -> Result<()> {
    let config = &ctx.accounts.investor_config;
    require!(config.follow_partial_exit, OneVaultError::AutoFollowDisabled);

    let reduce_value = crate::utils::calc_proportional_value(
        ctx.accounts.investor_position.current_value,
        reduce_bps,
    )?;

    let pos = &mut ctx.accounts.investor_position;
    pos.current_value = pos.current_value.saturating_sub(reduce_value);
    pos.status = PositionStatus::Reduced;

    let config = &mut ctx.accounts.investor_config;
    config.total_exposure_value = config.total_exposure_value.saturating_sub(reduce_value);

    Ok(())
}

#[derive(Accounts)]
pub struct SyncInvestorPositionClose<'info> {
    pub payer: Signer<'info>,

    pub vault: Account<'info, Vault>,

    /// CHECK: mirrored investor
    pub investor: UncheckedAccount<'info>,

    #[account(mut, seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump = investor_config.bump, constraint = investor_config.investor == investor.key())]
    pub investor_config: Account<'info, InvestorVaultConfig>,

    #[account(mut, seeds = [INVESTOR_POSITION_SEED, vault.key().as_ref(), investor.key().as_ref(),
        &investor_position.position_id.to_le_bytes()],
        bump = investor_position.bump, constraint = investor_position.investor == investor.key(),
        constraint = investor_position.status != PositionStatus::Closed @ OneVaultError::PositionNotOpen,
        close = payer)]
    pub investor_position: Account<'info, InvestorPosition>,
}

pub fn handle_sync_investor_position_close(ctx: Context<SyncInvestorPositionClose>) -> Result<()> {
    let config = &ctx.accounts.investor_config;
    require!(config.follow_full_exit, OneVaultError::AutoFollowDisabled);

    let exposure = ctx.accounts.investor_position.current_value;
    let config = &mut ctx.accounts.investor_config;
    config.open_positions_count = config.open_positions_count.saturating_sub(1);
    config.total_exposure_value = config.total_exposure_value.saturating_sub(exposure);

    Ok(())
}

#[derive(Accounts)]
pub struct SyncInvestorTpSl<'info> {
    pub payer: Signer<'info>,

    pub vault: Account<'info, Vault>,

    /// CHECK: mirrored investor
    pub investor: UncheckedAccount<'info>,

    #[account(seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump = investor_config.bump, constraint = investor_config.investor == investor.key())]
    pub investor_config: Account<'info, InvestorVaultConfig>,

    #[account(seeds = [VAULT_POSITION_SEED, vault.key().as_ref(), &vault_position.position_id.to_le_bytes()],
        bump = vault_position.bump, constraint = vault_position.vault == vault.key())]
    pub vault_position: Account<'info, VaultPosition>,

    #[account(mut, seeds = [INVESTOR_POSITION_SEED, vault.key().as_ref(), investor.key().as_ref(),
        &investor_position.position_id.to_le_bytes()],
        bump = investor_position.bump, constraint = investor_position.investor == investor.key(),
        constraint = investor_position.status == PositionStatus::Open @ OneVaultError::PositionNotOpen,
        close = payer)]
    pub investor_position: Account<'info, InvestorPosition>,
}

pub fn handle_sync_investor_tp_sl(ctx: Context<SyncInvestorTpSl>) -> Result<()> {
    let config = &ctx.accounts.investor_config;
    require!(config.follow_tp_sl, OneVaultError::AutoFollowDisabled);

    let exposure = ctx.accounts.investor_position.current_value;
    let config = &mut ctx.accounts.investor_config;
    config.open_positions_count = config.open_positions_count.saturating_sub(1);
    config.total_exposure_value = config.total_exposure_value.saturating_sub(exposure);

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFollowerStats<'info> {
    pub strategist: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,
}

pub fn handle_update_follower_stats(
    ctx: Context<UpdateFollowerStats>,
    active_followers: u32,
    estimated_follower_capital: u64,
) -> Result<()> {
    ctx.accounts.vault.active_followers = active_followers;
    ctx.accounts.vault.estimated_follower_capital = estimated_follower_capital;
    Ok(())
}

#[derive(Accounts)]
pub struct RecordInvestorDepositStats<'info> {
    #[account(mut)]
    pub vault: Account<'info, Vault>,
}

pub fn handle_record_investor_deposit_stats(ctx: Context<RecordInvestorDepositStats>, amount: u64) -> Result<()> {
    ctx.accounts.vault.estimated_follower_capital = ctx
        .accounts
        .vault
        .estimated_follower_capital
        .saturating_add(amount);
    ctx.accounts.vault.active_followers = ctx.accounts.vault.active_followers.saturating_add(1);
    Ok(())
}
