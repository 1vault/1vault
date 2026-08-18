use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{License, ProtocolConfig, Strategist};

#[derive(Accounts)]
pub struct RegisterStrategist<'info> {
    #[account(mut)]
    pub strategist: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(
        init,
        payer = strategist,
        space = 8 + Strategist::INIT_SPACE,
        seeds = [STRATEGIST_SEED, strategist.key().as_ref()],
        bump
    )]
    pub strategist_account: Account<'info, Strategist>,

    pub system_program: Program<'info, System>,
}

pub fn handle_register_strategist(ctx: Context<RegisterStrategist>) -> Result<()> {
    let account = &mut ctx.accounts.strategist_account;
    account.owner = ctx.accounts.strategist.key();
    account.vault_count = 0;
    account.active_vault_count = 0;
    account.is_active = true;
    account.bump = ctx.bumps.strategist_account;
    Ok(())
}

#[derive(Accounts)]
pub struct LockLicense<'info> {
    #[account(mut)]
    pub strategist: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        mut,
        seeds = [STRATEGIST_SEED, strategist.key().as_ref()],
        bump = strategist_account.bump,
        constraint = strategist_account.owner == strategist.key() @ OneVaultError::Unauthorized,
    )]
    pub strategist_account: Box<Account<'info, Strategist>>,

    #[account(
        init,
        payer = strategist,
        space = 8 + License::INIT_SPACE,
        seeds = [LICENSE_SEED, strategist.key().as_ref()],
        bump
    )]
    pub license: Box<Account<'info, License>>,

    #[account(
        mut,
        constraint = strategist_token_account.mint == protocol_config.platform_token_mint,
        constraint = strategist_token_account.owner == strategist.key(),
    )]
    pub strategist_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = strategist,
        seeds = [LICENSE_VAULT_SEED, strategist.key().as_ref()],
        bump,
        token::mint = platform_token_mint,
        token::authority = license,
    )]
    pub license_token_vault: Box<Account<'info, TokenAccount>>,

    pub platform_token_mint: Box<Account<'info, anchor_spl::token::Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_lock_license(ctx: Context<LockLicense>) -> Result<()> {
    let lock_amount = ctx.accounts.protocol_config.license_lock_amount;

    require!(
        ctx.accounts.strategist_token_account.amount >= lock_amount,
        OneVaultError::InsufficientLicenseBalance
    );

    let cpi_accounts = Transfer {
        from: ctx.accounts.strategist_token_account.to_account_info(),
        to: ctx.accounts.license_token_vault.to_account_info(),
        authority: ctx.accounts.strategist.to_account_info(),
    };
    token::transfer(
        CpiContext::new(ctx.accounts.token_program.key(), cpi_accounts),
        lock_amount,
    )?;

    let license = &mut ctx.accounts.license;
    license.strategist = ctx.accounts.strategist.key();
    license.locked_amount = lock_amount;
    license.is_active = true;
    license.bump = ctx.bumps.license;

    Ok(())
}

#[derive(Accounts)]
pub struct UnlockLicense<'info> {
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
        constraint = strategist_account.active_vault_count == 0 @ OneVaultError::ActiveVaultsRemain,
    )]
    pub strategist_account: Account<'info, Strategist>,

    #[account(
        mut,
        close = strategist,
        seeds = [LICENSE_SEED, strategist.key().as_ref()],
        bump = license.bump,
        constraint = license.is_active @ OneVaultError::LicenseNotActive,
        constraint = license.strategist == strategist.key() @ OneVaultError::Unauthorized,
    )]
    pub license: Account<'info, License>,

    #[account(
        mut,
        seeds = [LICENSE_VAULT_SEED, strategist.key().as_ref()],
        bump,
    )]
    pub license_token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = strategist_token_account.mint == protocol_config.platform_token_mint,
        constraint = strategist_token_account.owner == strategist.key(),
    )]
    pub strategist_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_unlock_license(ctx: Context<UnlockLicense>) -> Result<()> {
    let locked_amount = ctx.accounts.license.locked_amount;
    let strategist_key = ctx.accounts.strategist.key();
    let license_bump = ctx.accounts.license.bump;
    let seeds = &[
        LICENSE_SEED,
        strategist_key.as_ref(),
        &[license_bump],
    ];
    let signer = &[&seeds[..]];

    let cpi_accounts = Transfer {
        from: ctx.accounts.license_token_vault.to_account_info(),
        to: ctx.accounts.strategist_token_account.to_account_info(),
        authority: ctx.accounts.license.to_account_info(),
    };
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            cpi_accounts,
            signer,
        ),
        locked_amount,
    )?;

    Ok(())
}

#[derive(Accounts)]
pub struct RegisterReferral<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    /// CHECK: referrer wallet validated in handler
    pub referrer: UncheckedAccount<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + crate::state::ReferralAccount::INIT_SPACE,
        seeds = [REFERRAL_SEED, user.key().as_ref()],
        bump
    )]
    pub referral_account: Account<'info, crate::state::ReferralAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handle_register_referral(ctx: Context<RegisterReferral>) -> Result<()> {
    let user_key = ctx.accounts.user.key();
    let referrer_key = ctx.accounts.referrer.key();

    require!(referrer_key != user_key, OneVaultError::SelfReferral);
    require!(referrer_key != Pubkey::default(), OneVaultError::Unauthorized);

    let referral = &mut ctx.accounts.referral_account;
    referral.user = user_key;
    referral.referrer = referrer_key;
    referral.claimable_rewards = 0;
    referral.total_earned = 0;
    referral.bump = ctx.bumps.referral_account;

    Ok(())
}
