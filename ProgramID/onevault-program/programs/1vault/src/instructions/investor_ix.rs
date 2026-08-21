use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{AllocationMode, InvestorVaultConfig, ProtocolConfig, Vault};

#[derive(Accounts)]
pub struct CreateInvestorConfig<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = investor,
        space = 8 + InvestorVaultConfig::INIT_SPACE,
        seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump
    )]
    pub investor_config: Account<'info, InvestorVaultConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_create_investor_config(ctx: Context<CreateInvestorConfig>) -> Result<()> {
    require!(ctx.accounts.vault.is_operational(), OneVaultError::VaultPaused);

    let config = &mut ctx.accounts.investor_config;
    config.vault = ctx.accounts.vault.key();
    config.investor = ctx.accounts.investor.key();
    config.bump = ctx.bumps.investor_config;
    let defaults = InvestorVaultConfig::default_settings(
        ctx.accounts.vault.key(),
        ctx.accounts.investor.key(),
        ctx.bumps.investor_config,
    );
    config.auto_follow = defaults.auto_follow;
    config.allocation_mode = defaults.allocation_mode;
    config.position_size = defaults.position_size;
    config.max_position_bps = defaults.max_position_bps;
    config.max_exposure_bps = defaults.max_exposure_bps;
    config.max_open_positions = defaults.max_open_positions;
    config.open_positions_count = defaults.open_positions_count;
    config.total_exposure_value = defaults.total_exposure_value;
    config.follow_partial_exit = defaults.follow_partial_exit;
    config.follow_full_exit = defaults.follow_full_exit;
    config.follow_tp_sl = defaults.follow_tp_sl;
    config.max_slippage_bps = defaults.max_slippage_bps;
    config.take_profit_bps = defaults.take_profit_bps;
    config.stop_loss_bps = defaults.stop_loss_bps;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateInvestorConfig<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump = investor_config.bump,
        constraint = investor_config.investor == investor.key() @ OneVaultError::Unauthorized,
        realloc = 8 + InvestorVaultConfig::INIT_SPACE,
        realloc::payer = investor,
        realloc::zero = false,
    )]
    pub investor_config: Account<'info, InvestorVaultConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct InvestorConfigParams {
    pub auto_follow: Option<bool>,
    pub allocation_mode: Option<AllocationMode>,
    pub position_size: Option<u64>,
    pub max_position_bps: Option<u16>,
    pub max_exposure_bps: Option<u16>,
    pub max_open_positions: Option<u8>,
    pub follow_partial_exit: Option<bool>,
    pub follow_full_exit: Option<bool>,
    pub follow_tp_sl: Option<bool>,
    pub max_slippage_bps: Option<u16>,
    pub take_profit_bps: Option<u16>,
    pub stop_loss_bps: Option<u16>,
}

pub fn handle_update_investor_config(
    ctx: Context<UpdateInvestorConfig>,
    params: InvestorConfigParams,
) -> Result<()> {
    require!(ctx.accounts.vault.is_operational(), OneVaultError::VaultPaused);

    let config = &mut ctx.accounts.investor_config;

    if let Some(v) = params.auto_follow {
        config.auto_follow = v;
    }
    if let Some(v) = params.allocation_mode {
        config.allocation_mode = v;
    }
    if let Some(v) = params.position_size {
        config.position_size = v;
    }
    if let Some(v) = params.max_position_bps {
        config.max_position_bps = v;
    }
    if let Some(v) = params.max_exposure_bps {
        config.max_exposure_bps = v;
    }
    if let Some(v) = params.max_open_positions {
        config.max_open_positions = v;
    }
    if let Some(v) = params.follow_partial_exit {
        config.follow_partial_exit = v;
    }
    if let Some(v) = params.follow_full_exit {
        config.follow_full_exit = v;
    }
    if let Some(v) = params.follow_tp_sl {
        config.follow_tp_sl = v;
    }
    if let Some(v) = params.max_slippage_bps {
        config.max_slippage_bps = v;
    }
    if let Some(v) = params.take_profit_bps {
        config.take_profit_bps = v;
    }
    if let Some(v) = params.stop_loss_bps {
        config.stop_loss_bps = v;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct FollowOn<'info> {
    pub investor: Signer<'info>,

    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump = investor_config.bump,
        constraint = investor_config.investor == investor.key() @ OneVaultError::Unauthorized,
    )]
    pub investor_config: Account<'info, InvestorVaultConfig>,
}

pub fn handle_follow_on(ctx: Context<FollowOn>) -> Result<()> {
    require!(ctx.accounts.vault.is_operational(), OneVaultError::VaultPaused);
    ctx.accounts.investor_config.auto_follow = true;
    Ok(())
}

#[derive(Accounts)]
pub struct FollowOff<'info> {
    pub investor: Signer<'info>,

    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump = investor_config.bump,
        constraint = investor_config.investor == investor.key() @ OneVaultError::Unauthorized,
    )]
    pub investor_config: Account<'info, InvestorVaultConfig>,
}

pub fn handle_follow_off(ctx: Context<FollowOff>) -> Result<()> {
    ctx.accounts.investor_config.auto_follow = false;
    Ok(())
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        mut,
        constraint = vault.accepts_deposits() @ OneVaultError::VaultPaused,
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        mut,
        constraint = investor_token_account.mint == vault.base_mint,
        constraint = investor_token_account.owner == investor.key(),
    )]
    pub investor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = vault_token_account.key() == vault.vault_token_account,
        constraint = vault_token_account.mint == vault.base_mint,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = share_mint.key() == vault.share_mint,
    )]
    pub share_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        constraint = investor_share_account.mint == vault.share_mint,
        constraint = investor_share_account.owner == investor.key(),
    )]
    pub investor_share_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    require!(amount > 0, OneVaultError::ZeroDeposit);

    let total_shares = ctx.accounts.vault.total_shares;
    let nav = ctx.accounts.vault.nav()?;

    let shares_to_mint = if total_shares == 0 {
        amount
    } else {
        require!(nav > 0, OneVaultError::InsufficientLiquidity);
        (amount as u128)
            .checked_mul(total_shares as u128)
            .and_then(|v| v.checked_div(nav as u128))
            .ok_or(OneVaultError::MathOverflow)? as u64
    };

    require!(shares_to_mint > 0, OneVaultError::ZeroDeposit);

    let cpi_accounts = Transfer {
        from: ctx.accounts.investor_token_account.to_account_info(),
        to: ctx.accounts.vault_token_account.to_account_info(),
        authority: ctx.accounts.investor.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
        amount,
    )?;

    let strategist_key = ctx.accounts.vault.strategist;
    let vault_id_bytes = ctx.accounts.vault.vault_id.to_le_bytes();
    let vault_bump = ctx.accounts.vault.bump;
    let seeds = &[
        VAULT_SEED,
        strategist_key.as_ref(),
        vault_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer = &[&seeds[..]];

    let mint_accounts = MintTo {
        mint: ctx.accounts.share_mint.to_account_info(),
        to: ctx.accounts.investor_share_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            mint_accounts,
            signer,
        ),
        shares_to_mint,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.total_assets = vault
        .total_assets
        .checked_add(amount)
        .ok_or(OneVaultError::MathOverflow)?;
    vault.total_shares = vault
        .total_shares
        .checked_add(shares_to_mint)
        .ok_or(OneVaultError::MathOverflow)?;

    if vault.total_shares > 0 {
        let share_price = vault.share_price()?;
        if share_price > vault.high_water_mark {
            vault.high_water_mark = share_price;
        }
    }

    emit!(crate::events::InvestorDeposit {
        vault: vault.key(),
        investor: ctx.accounts.investor.key(),
        amount,
        shares_minted: shares_to_mint,
        nav: vault.nav()?,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        mut,
        constraint = vault.accepts_withdrawals() @ OneVaultError::VaultClosed,
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        mut,
        constraint = investor_share_account.mint == vault.share_mint,
        constraint = investor_share_account.owner == investor.key(),
    )]
    pub investor_share_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = investor_token_account.mint == vault.base_mint,
        constraint = investor_token_account.owner == investor.key(),
    )]
    pub investor_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = vault_token_account.key() == vault.vault_token_account,
        constraint = vault_token_account.mint == vault.base_mint,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = share_mint.key() == vault.share_mint,
    )]
    pub share_mint: Box<Account<'info, Mint>>,

    /// Optional — when initialized, open mirrored positions block withdraw.
    #[account(
        seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump,
    )]
    pub investor_config: Option<Account<'info, InvestorVaultConfig>>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
    require!(shares > 0, OneVaultError::ZeroWithdraw);
    require!(
        ctx.accounts.investor_share_account.amount >= shares,
        OneVaultError::InsufficientShares
    );
    if let Some(config) = &ctx.accounts.investor_config {
        require!(
            config.open_positions_count == 0,
            OneVaultError::InvestorHasOpenPositions
        );
    }

    let total_shares = ctx.accounts.vault.total_shares;
    let nav = ctx.accounts.vault.nav()?;
    require!(total_shares > 0, OneVaultError::InsufficientShares);

    let gross_amount = (shares as u128)
        .checked_mul(nav as u128)
        .and_then(|v| v.checked_div(total_shares as u128))
        .ok_or(OneVaultError::MathOverflow)? as u64;

    require!(gross_amount > 0, OneVaultError::ZeroWithdraw);
    require!(
        ctx.accounts.vault_token_account.amount >= gross_amount,
        OneVaultError::InsufficientLiquidity
    );

    let fee_amount = 0u64;
    let net_amount = gross_amount;

    let strategist_key = ctx.accounts.vault.strategist;
    let vault_id_bytes = ctx.accounts.vault.vault_id.to_le_bytes();
    let vault_bump = ctx.accounts.vault.bump;
    let seeds = &[
        VAULT_SEED,
        strategist_key.as_ref(),
        vault_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer = &[&seeds[..]];

    let burn_accounts = Burn {
        mint: ctx.accounts.share_mint.to_account_info(),
        from: ctx.accounts.investor_share_account.to_account_info(),
        authority: ctx.accounts.investor.to_account_info(),
    };
    token::burn(
        CpiContext::new(ctx.accounts.token_program.key(), burn_accounts),
        shares,
    )?;

    let transfer_net = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.investor_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            transfer_net,
            signer,
        ),
        net_amount,
    )?;

    let vault = &mut ctx.accounts.vault;
    vault.total_assets = vault
        .total_assets
        .checked_sub(gross_amount)
        .ok_or(OneVaultError::MathOverflow)?;
    vault.total_shares = vault
        .total_shares
        .checked_sub(shares)
        .ok_or(OneVaultError::MathOverflow)?;

    emit!(crate::events::InvestorWithdraw {
        vault: vault.key(),
        investor: ctx.accounts.investor.key(),
        shares_burned: shares,
        gross_amount,
        net_amount,
        fee_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
