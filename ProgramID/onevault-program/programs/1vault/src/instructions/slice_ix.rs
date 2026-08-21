use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{
    InvestorPosition, InvestorVaultConfig, PositionStatus, Vault, VaultBookMode, VaultPosition,
};
use crate::utils::{
    create_wsol_unwrap_account, evaluate_investor_tp_sl, investor_slice_output,
    unwrap_wsol_to_wallet,
};

#[derive(Accounts)]
pub struct ExitInvestorSlice<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.strategist.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.book_mode == VaultBookMode::SlicedVault @ OneVaultError::PooledVaultOnly,
        constraint = vault.accepts_withdrawals() @ OneVaultError::VaultClosed,
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        mut,
        seeds = [INVESTOR_CONFIG_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump = investor_config.bump,
        constraint = investor_config.investor == investor.key() @ OneVaultError::Unauthorized,
    )]
    pub investor_config: Box<Account<'info, InvestorVaultConfig>>,

    #[account(
        mut,
        seeds = [INVESTOR_POSITION_SEED, vault.key().as_ref(), investor.key().as_ref(),
            &investor_position.position_id.to_le_bytes()],
        bump = investor_position.bump,
        constraint = investor_position.investor == investor.key() @ OneVaultError::Unauthorized,
        constraint = investor_position.status == PositionStatus::Open @ OneVaultError::PositionNotOpen,
        close = investor,
    )]
    pub investor_position: Box<Account<'info, InvestorPosition>>,

    #[account(
        mut,
        seeds = [VAULT_POSITION_SEED, vault.key().as_ref(), &vault_position.position_id.to_le_bytes()],
        bump = vault_position.bump,
        constraint = vault_position.vault == vault.key() @ OneVaultError::Unauthorized,
        constraint = vault_position.status == PositionStatus::Open @ OneVaultError::VaultPositionNotOpen,
        constraint = investor_position.vault_position_id == vault_position.position_id @ OneVaultError::PositionNotFound,
    )]
    pub vault_position: Box<Account<'info, VaultPosition>>,

    #[account(
        mut,
        constraint = vault_token_account.key() == vault.vault_token_account @ OneVaultError::InvalidMint,
        constraint = vault_token_account.mint == vault.base_mint @ OneVaultError::InvalidMint,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    /// wSOL proceeds from the slice sell (same pattern as close_position).
    #[account(
        mut,
        constraint = proceeds_token_account.mint == vault.base_mint @ OneVaultError::InvalidMint,
        constraint = proceeds_token_account.owner == vault.key() @ OneVaultError::Unauthorized,
    )]
    pub proceeds_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = investor_wsol_account.owner == investor.key() @ OneVaultError::Unauthorized,
        constraint = investor_wsol_account.mint == vault.base_mint @ OneVaultError::InvalidMint,
    )]
    pub investor_wsol_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: degen fee wallet receives early-exit fee on realized profit.
    #[account(
        mut,
        address = DEGEN_FEE_WALLET @ OneVaultError::Unauthorized,
    )]
    pub degen_fee_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [FEE_UNWRAP_SEED, vault.key().as_ref(), degen_fee_wallet.key().as_ref()],
        bump,
    )]
    /// CHECK: temporary wSOL ATA for degen payout.
    pub unwrap_degen: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [FEE_UNWRAP_SEED, vault.key().as_ref(), investor.key().as_ref()],
        bump,
    )]
    /// CHECK: temporary wSOL ATA for investor payout.
    pub unwrap_investor: UncheckedAccount<'info>,

    #[account(address = vault.base_mint)]
    pub base_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_exit_investor_slice(
    ctx: Context<ExitInvestorSlice>,
    current_value: u64,
    proceeds: u64,
    output_sold: u64,
    force_exit: bool,
) -> Result<()> {
    require!(proceeds > 0, OneVaultError::InvalidAmount);
    require!(current_value > 0, OneVaultError::InvalidAmount);
    ctx.accounts.proceeds_token_account.reload()?;
    require!(
        proceeds <= ctx.accounts.proceeds_token_account.amount,
        OneVaultError::InvalidAmount
    );

    let investor_position = &ctx.accounts.investor_position;
    let vault_position = &ctx.accounts.vault_position;
    let investor_config = &ctx.accounts.investor_config;

    if !force_exit {
        require!(
            evaluate_investor_tp_sl(investor_position, investor_config, current_value)?.is_some(),
            OneVaultError::TpSlNotTriggered
        );
    }

    let expected_output = investor_slice_output(investor_position, vault_position)?;
    require!(output_sold > 0 && output_sold <= expected_output.max(1), OneVaultError::InvalidAmount);

    let slice_value = current_value.min(investor_position.current_value);
    let entry_value = investor_position.entry_value;
    let position_id = investor_position.position_id;
    let vault_position_id = vault_position.position_id;
    let exposure = investor_position.current_value;

    let strategist_key = ctx.accounts.vault.strategist;
    let vault_key = ctx.accounts.vault.key();
    let vault_id_bytes = ctx.accounts.vault.vault_id.to_le_bytes();
    let vault_bump = ctx.accounts.vault.bump;
    let vault_seeds = [
        VAULT_SEED,
        strategist_key.as_ref(),
        vault_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer = &[&vault_seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.proceeds_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        proceeds,
    )?;

    let realized_profit = proceeds.saturating_sub(entry_value);
    let early_exit_fee = if realized_profit > 0 {
        crate::utils::apply_bps(realized_profit, ctx.accounts.vault.early_exit_fee_bps)?
    } else {
        0
    };
    let net_to_investor = proceeds.saturating_sub(early_exit_fee);
    require!(net_to_investor > 0, OneVaultError::InvalidAmount);

    let vault = &mut ctx.accounts.vault;
    vault.position_value = vault.position_value.saturating_sub(slice_value);
    vault.total_assets = vault
        .total_assets
        .saturating_add(proceeds)
        .saturating_sub(early_exit_fee)
        .saturating_sub(net_to_investor);

    let vault_position = &mut ctx.accounts.vault_position;
    vault_position.current_value = vault_position.current_value.saturating_sub(slice_value);
    vault_position.output_amount = vault_position.output_amount.saturating_sub(output_sold);
    if vault_position.status == PositionStatus::Open && vault_position.current_value < vault_position.entry_value {
        vault_position.status = PositionStatus::Reduced;
    }

    let config = &mut ctx.accounts.investor_config;
    config.open_positions_count = config.open_positions_count.saturating_sub(1);
    config.total_exposure_value = config.total_exposure_value.saturating_sub(exposure);

    if early_exit_fee > 0 {
        let degen_key = ctx.accounts.degen_fee_wallet.key();
        let degen_bump = [ctx.bumps.unwrap_degen];
        let degen_seeds = [
            FEE_UNWRAP_SEED,
            vault_key.as_ref(),
            degen_key.as_ref(),
            degen_bump.as_ref(),
        ];
        create_wsol_unwrap_account(
            ctx.accounts.investor.to_account_info(),
            ctx.accounts.unwrap_degen.to_account_info(),
            ctx.accounts.base_mint.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
            &[&degen_seeds],
        )?;
        unwrap_wsol_to_wallet(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault_token_account.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.unwrap_degen.to_account_info(),
            ctx.accounts.degen_fee_wallet.to_account_info(),
            early_exit_fee,
            signer,
        )?;
    }

    let investor_key = ctx.accounts.investor.key();
    let investor_bump = [ctx.bumps.unwrap_investor];
    let investor_seeds = [
        FEE_UNWRAP_SEED,
        vault_key.as_ref(),
        investor_key.as_ref(),
        investor_bump.as_ref(),
    ];
    create_wsol_unwrap_account(
        ctx.accounts.investor.to_account_info(),
        ctx.accounts.unwrap_investor.to_account_info(),
        ctx.accounts.base_mint.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        &[&investor_seeds],
    )?;
    unwrap_wsol_to_wallet(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.vault_token_account.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.unwrap_investor.to_account_info(),
        ctx.accounts.investor_wsol_account.to_account_info(),
        net_to_investor,
        signer,
    )?;

    emit!(crate::events::InvestorSliceExited {
        vault: vault_key,
        investor: ctx.accounts.investor.key(),
        position_id,
        vault_position_id,
        proceeds,
        early_exit_fee,
        net_to_investor,
        output_sold,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
