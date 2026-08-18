use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{
    License, MevMode, ProtocolConfig, Strategist, StrategyType, Vault, VaultFeeState, VaultRiskState,
    VaultStatus, YieldStrategy,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VaultRiskParams {
    pub description: String,
    pub strategy_type: StrategyType,
    pub max_position_bps: u16,
    pub max_exposure_bps: u16,
    pub max_open_positions: u8,
    pub max_slippage_bps: u16,
    pub mev_mode: MevMode,
    pub dca_enabled: bool,
    pub dca_count: u8,
    pub dca_allocation_bps: u16,
    pub accepted_mints: Vec<Pubkey>,
    pub yield_strategy: YieldStrategy,
}

impl Default for VaultRiskParams {
    fn default() -> Self {
        Self {
            description: String::new(),
            strategy_type: StrategyType::Custom,
            max_position_bps: 5_000,
            max_exposure_bps: 8_000,
            max_open_positions: 3,
            max_slippage_bps: 100,
            mev_mode: MevMode::Standard,
            dca_enabled: false,
            dca_count: 0,
            dca_allocation_bps: 0,
            accepted_mints: Vec::new(),
            yield_strategy: YieldStrategy::None,
        }
    }
}

#[derive(Accounts)]
#[instruction(vault_id: u64)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub strategist: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        mut,
        seeds = [STRATEGIST_SEED, strategist.key().as_ref()],
        bump = strategist_account.bump,
        constraint = strategist_account.owner == strategist.key() @ OneVaultError::Unauthorized,
    )]
    pub strategist_account: Account<'info, Strategist>,

    #[account(
        seeds = [LICENSE_SEED, strategist.key().as_ref()],
        bump = license.bump,
        constraint = license.is_active @ OneVaultError::LicenseNotActive,
    )]
    pub license: Account<'info, License>,

    #[account(
        init,
        payer = strategist,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, strategist.key().as_ref(), &vault_id.to_le_bytes()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = strategist,
        space = 8 + VaultFeeState::INIT_SPACE,
        seeds = [VAULT_FEE_SEED, vault.key().as_ref()],
        bump
    )]
    pub vault_fee_state: Account<'info, VaultFeeState>,

    #[account(
        init,
        payer = strategist,
        space = 8 + VaultRiskState::INIT_SPACE,
        seeds = [VAULT_RISK_SEED, vault.key().as_ref()],
        bump
    )]
    pub vault_risk_state: Account<'info, VaultRiskState>,

    pub base_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = strategist,
        seeds = [SHARE_MINT_SEED, vault.key().as_ref()],
        bump,
        mint::decimals = base_mint.decimals,
        mint::authority = vault,
    )]
    pub share_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = strategist,
        token::mint = base_mint,
        token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_create_vault(
    ctx: Context<CreateVault>,
    vault_id: u64,
    name: String,
    performance_fee_bps: u16,
    risk: VaultRiskParams,
) -> Result<()> {
    require!(!name.is_empty() && name.len() <= MAX_VAULT_NAME_LEN, OneVaultError::InvalidVaultName);
    require!(risk.description.len() <= MAX_VAULT_DESC_LEN, OneVaultError::InvalidVaultName);
    require!(
        performance_fee_bps <= BPS_DENOMINATOR as u16,
        OneVaultError::InvalidFeeConfig
    );
    require!(
        risk.accepted_mints.len() <= MAX_ACCEPTED_MINTS,
        OneVaultError::InvalidAmount
    );

    let base_mint = ctx.accounts.base_mint.key();
    let mut accepted_mint_count = risk.accepted_mints.len() as u8;
    let mut accepted_mints = [Pubkey::default(); MAX_ACCEPTED_MINTS];
    if accepted_mint_count == 0 {
        accepted_mints[0] = base_mint;
        accepted_mint_count = 1;
    } else {
        for (i, mint) in risk.accepted_mints.iter().enumerate() {
            accepted_mints[i] = *mint;
        }
        require!(
            risk.accepted_mints.iter().any(|m| *m == base_mint),
            OneVaultError::AssetNotAccepted
        );
    }

    let vault = &mut ctx.accounts.vault;
    vault.strategist = ctx.accounts.strategist.key();
    vault.vault_id = vault_id;
    vault.name = name;
    vault.description = risk.description;
    vault.strategy_type = risk.strategy_type;
    vault.yield_strategy = risk.yield_strategy;
    vault.base_mint = base_mint;
    vault.accepted_mint_count = accepted_mint_count;
    vault.accepted_mints = accepted_mints;
    vault.share_mint = ctx.accounts.share_mint.key();
    vault.vault_token_account = ctx.accounts.vault_token_account.key();
    vault.total_shares = 0;
    vault.total_assets = 0;
    vault.position_value = 0;
    vault.staked_value = 0;
    vault.high_water_mark = SHARE_PRICE_SCALE;
    vault.performance_fee_bps = performance_fee_bps;
    vault.status = VaultStatus::Active;
    vault.mev_mode = risk.mev_mode;
    vault.max_position_bps = risk.max_position_bps;
    vault.max_exposure_bps = risk.max_exposure_bps;
    vault.max_open_positions = risk.max_open_positions;
    vault.max_slippage_bps = risk.max_slippage_bps;
    vault.dca_enabled = risk.dca_enabled;
    vault.dca_count = risk.dca_count;
    vault.dca_allocation_bps = risk.dca_allocation_bps;
    vault.open_positions_count = 0;
    vault.pending_trades_count = 0;
    vault.active_followers = 0;
    vault.estimated_follower_capital = 0;
    vault.next_trade_id = 1;
    vault.next_position_id = 1;
    vault.bump = ctx.bumps.vault;
    vault.share_mint_bump = ctx.bumps.share_mint;

    let fee_state = &mut ctx.accounts.vault_fee_state;
    fee_state.vault = vault.key();
    fee_state.strategist = ctx.accounts.strategist.key();
    fee_state.last_fee_share_price = SHARE_PRICE_SCALE;
    fee_state.bump = ctx.bumps.vault_fee_state;

    let risk_state = &mut ctx.accounts.vault_risk_state;
    risk_state.vault = vault.key();
    risk_state.daily_loss_limit_bps = DEFAULT_DAILY_LOSS_LIMIT_BPS;
    risk_state.daily_loss_bps = 0;
    risk_state.max_drawdown_bps = DEFAULT_MAX_DRAWDOWN_BPS;
    risk_state.current_drawdown_bps = 0;
    risk_state.peak_nav = 0;
    risk_state.last_reset_day = VaultRiskState::day_index(Clock::get()?.unix_timestamp);
    risk_state.circuit_breaker_active = false;
    risk_state.bump = ctx.bumps.vault_risk_state;

    emit!(crate::events::VaultCreated {
        vault: vault.key(),
        strategist: ctx.accounts.strategist.key(),
        vault_id,
        base_mint,
        performance_fee_bps,
        timestamp: Clock::get()?.unix_timestamp,
    });

    let strategist_account = &mut ctx.accounts.strategist_account;
    strategist_account.vault_count = strategist_account.vault_count.saturating_add(1);
    strategist_account.active_vault_count = strategist_account.active_vault_count.saturating_add(1);

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateVault<'info> {
    pub strategist: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = vault.status != VaultStatus::Closed @ OneVaultError::VaultClosed,
        constraint = vault.status != VaultStatus::Closing @ OneVaultError::VaultClosing,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handle_update_vault(
    ctx: Context<UpdateVault>,
    name: Option<String>,
    performance_fee_bps: Option<u16>,
    risk: Option<VaultRiskParams>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    if let Some(new_name) = name {
        require!(
            !new_name.is_empty() && new_name.len() <= MAX_VAULT_NAME_LEN,
            OneVaultError::InvalidVaultName
        );
        vault.name = new_name;
    }
    if let Some(fee) = performance_fee_bps {
        require!(fee <= BPS_DENOMINATOR as u16, OneVaultError::InvalidFeeConfig);
        vault.performance_fee_bps = fee;
    }
    if let Some(r) = risk {
        require!(r.description.len() <= MAX_VAULT_DESC_LEN, OneVaultError::InvalidVaultName);
        vault.description = r.description;
        vault.strategy_type = r.strategy_type;
        vault.yield_strategy = r.yield_strategy;
        vault.max_position_bps = r.max_position_bps;
        vault.max_exposure_bps = r.max_exposure_bps;
        vault.max_open_positions = r.max_open_positions;
        vault.max_slippage_bps = r.max_slippage_bps;
        vault.mev_mode = r.mev_mode;
        vault.dca_enabled = r.dca_enabled;
        vault.dca_count = r.dca_count;
        vault.dca_allocation_bps = r.dca_allocation_bps;
        if !r.accepted_mints.is_empty() {
            require!(
                r.accepted_mints.len() <= MAX_ACCEPTED_MINTS,
                OneVaultError::InvalidAmount
            );
            require!(
                r.accepted_mints.iter().any(|m| *m == vault.base_mint),
                OneVaultError::AssetNotAccepted
            );
            vault.accepted_mint_count = r.accepted_mints.len() as u8;
            vault.accepted_mints = [Pubkey::default(); MAX_ACCEPTED_MINTS];
            for (i, mint) in r.accepted_mints.iter().enumerate() {
                vault.accepted_mints[i] = *mint;
            }
        }
    }
    Ok(())
}

#[derive(Accounts)]
pub struct PauseVault<'info> {
    pub strategist: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = vault.status == VaultStatus::Active @ OneVaultError::VaultPaused)]
    pub vault: Account<'info, Vault>,
}

pub fn handle_pause_vault(ctx: Context<PauseVault>) -> Result<()> {
    ctx.accounts.vault.status = VaultStatus::Paused;
    Ok(())
}

#[derive(Accounts)]
pub struct ResumeVault<'info> {
    pub strategist: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = vault.status == VaultStatus::Paused @ OneVaultError::VaultPaused)]
    pub vault: Account<'info, Vault>,
}

pub fn handle_resume_vault(ctx: Context<ResumeVault>) -> Result<()> {
    ctx.accounts.vault.status = VaultStatus::Active;
    Ok(())
}

#[derive(Accounts)]
pub struct InitiateVaultClose<'info> {
    pub strategist: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = vault.status == VaultStatus::Active || vault.status == VaultStatus::Paused @ OneVaultError::VaultClosed,
    )]
    pub vault: Account<'info, Vault>,
}

pub fn handle_initiate_vault_close(ctx: Context<InitiateVaultClose>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    require!(vault.is_liquid_for_close(), OneVaultError::VaultHasOpenPositions);

    let nav = vault.nav()?;
    let total_shares = vault.total_shares;

    let vault = &mut ctx.accounts.vault;
    vault.status = VaultStatus::Closing;

    emit!(crate::events::VaultClosingInitiated {
        vault: vault.key(),
        strategist: ctx.accounts.strategist.key(),
        total_shares,
        nav,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CloseVault<'info> {
    #[account(mut)]
    pub strategist: Signer<'info>,
    #[account(mut, seeds = [STRATEGIST_SEED, strategist.key().as_ref()], bump = strategist_account.bump,
        constraint = strategist_account.owner == strategist.key() @ OneVaultError::Unauthorized)]
    pub strategist_account: Account<'info, Strategist>,
    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = vault.status == VaultStatus::Closing @ OneVaultError::VaultNotClosing,
        constraint = vault.total_shares == 0 @ OneVaultError::VaultHasShares,
        constraint = vault.open_positions_count == 0 @ OneVaultError::VaultHasOpenPositions,
        constraint = vault.pending_trades_count == 0 @ OneVaultError::VaultHasPendingTrades,
        constraint = vault.position_value == 0 @ OneVaultError::VaultHasOpenPositions,
        constraint = vault.staked_value == 0 @ OneVaultError::VaultHasAssets)]
    pub vault: Account<'info, Vault>,
    #[account(constraint = vault_token_account.key() == vault.vault_token_account,
        constraint = vault_token_account.amount == 0 @ OneVaultError::VaultHasAssets)]
    pub vault_token_account: Account<'info, TokenAccount>,
}

pub fn handle_close_vault(ctx: Context<CloseVault>) -> Result<()> {
    ctx.accounts.vault.status = VaultStatus::Closed;
    ctx.accounts.strategist_account.active_vault_count =
        ctx.accounts.strategist_account.active_vault_count.saturating_sub(1);

    emit!(crate::events::VaultClosed {
        vault: ctx.accounts.vault.key(),
        strategist: ctx.accounts.strategist.key(),
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateNav<'info> {
    #[account(mut, seeds = [VAULT_SEED, vault.strategist.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.status != VaultStatus::Closed @ OneVaultError::VaultClosed)]
    pub vault: Account<'info, Vault>,
    #[account(constraint = vault_token_account.key() == vault.vault_token_account,
        constraint = vault_token_account.mint == vault.base_mint)]
    pub vault_token_account: Account<'info, TokenAccount>,
}

pub fn handle_update_nav(ctx: Context<UpdateNav>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.total_assets = ctx.accounts.vault_token_account.amount;
    if vault.total_shares > 0 {
        let share_price = vault.share_price()?;
        if share_price > vault.high_water_mark {
            vault.high_water_mark = share_price;
        }
    }
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateVaultStakedValue<'info> {
    pub strategist: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,
}

pub fn handle_update_vault_staked_value(ctx: Context<UpdateVaultStakedValue>, staked_value: u64) -> Result<()> {
    ctx.accounts.vault.staked_value = staked_value;
    Ok(())
}
