use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

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
        init_if_needed,
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
    // 1M 1vault Licence is locked inside each vault on `create_vault`,
    // not in this strategist-wide PDA. This instruction only activates
    // the license record required to open vaults.
    let license = &mut ctx.accounts.license;
    license.strategist = ctx.accounts.strategist.key();
    license.locked_amount = 0;
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

    /// CHECK: SPL token vault; emptied and closed in the handler so a later
    /// `lock_license` can recreate it.
    #[account(
        mut,
        seeds = [LICENSE_VAULT_SEED, strategist.key().as_ref()],
        bump,
    )]
    pub license_token_vault: UncheckedAccount<'info>,

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

    if locked_amount > 0 {
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
    }

    if !ctx.accounts.license_token_vault.data_is_empty() {
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.license_token_vault.to_account_info(),
                destination: ctx.accounts.strategist.to_account_info(),
                authority: ctx.accounts.license.to_account_info(),
            },
            signer,
        ))?;
    }

    Ok(())
}
