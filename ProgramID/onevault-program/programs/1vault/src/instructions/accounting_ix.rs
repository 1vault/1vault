use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{ProtocolConfig, Vault, VaultFeeState};
use crate::utils::apply_bps;

#[derive(Accounts)]
pub struct AccrueFees<'info> {
    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump)]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    #[account(mut, seeds = [VAULT_SEED, vault.strategist.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(mut, seeds = [VAULT_FEE_SEED, vault.key().as_ref()], bump = vault_fee_state.bump,
        constraint = vault_fee_state.vault == vault.key())]
    pub vault_fee_state: Box<Account<'info, VaultFeeState>>,
}

pub fn handle_accrue_fees(ctx: Context<AccrueFees>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    if vault.total_shares == 0 {
        return Ok(());
    }

    let share_price = vault.share_price()?;
    let hwm = vault.high_water_mark;
    if share_price <= hwm {
        return Ok(());
    }

    let price_delta = share_price.checked_sub(hwm).ok_or(OneVaultError::MathOverflow)?;
    let profit_on_nav = (vault.total_shares as u128)
        .checked_mul(price_delta as u128)
        .and_then(|v| v.checked_div(SHARE_PRICE_SCALE as u128))
        .ok_or(OneVaultError::MathOverflow)? as u64;

    let perf_fee = apply_bps(profit_on_nav, vault.performance_fee_bps)?;

    let fee_state = &mut ctx.accounts.vault_fee_state;
    fee_state.accrued_performance_fees =
        fee_state.accrued_performance_fees.saturating_add(perf_fee);
    fee_state.last_fee_share_price = share_price;

    emit!(crate::events::FeeAccrued {
        vault: ctx.accounts.vault.key(),
        performance_fee: perf_fee,
        share_price,
        timestamp: Clock::get()?.unix_timestamp,
    });

    let vault = &mut ctx.accounts.vault;
    vault.high_water_mark = share_price;
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimFees<'info> {
    #[account(mut)]
    pub strategist: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump)]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = vault.base_mint == WSOL_MINT @ OneVaultError::InvalidMint)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(mut, seeds = [VAULT_FEE_SEED, vault.key().as_ref()], bump = vault_fee_state.bump,
        constraint = vault_fee_state.vault == vault.key(),
        constraint = vault_fee_state.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault_fee_state: Box<Account<'info, VaultFeeState>>,

    #[account(mut, constraint = vault_token_account.key() == vault.vault_token_account)]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: degen native-SOL recipient.
    #[account(mut, constraint = degen_wallet.key() == DEGEN_FEE_WALLET @ OneVaultError::Unauthorized)]
    pub degen_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [FEE_UNWRAP_SEED, vault.key().as_ref(), degen_wallet.key().as_ref()],
        bump
    )]
    /// CHECK: temporary wSOL ATA, created and closed in this instruction.
    pub unwrap_degen: UncheckedAccount<'info>,

    #[account(address = WSOL_MINT)]
    pub native_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
    let perf = ctx.accounts.vault_fee_state.claimable_performance();
    require!(perf > 0, OneVaultError::NothingToClaim);

    let strategist_key = ctx.accounts.vault.strategist;
    let vault_id_bytes = ctx.accounts.vault.vault_id.to_le_bytes();
    let vault_bump = [ctx.accounts.vault.bump];
    let vault_seeds = [
        VAULT_SEED,
        strategist_key.as_ref(),
        vault_id_bytes.as_ref(),
        vault_bump.as_ref(),
    ];
    let signer = &[&vault_seeds[..]];

    let vault_key = ctx.accounts.vault.key();
    let degen_key = ctx.accounts.degen_wallet.key();
    let degen_bump = [ctx.bumps.unwrap_degen];
    let degen_seeds = [
        FEE_UNWRAP_SEED,
        vault_key.as_ref(),
        degen_key.as_ref(),
        degen_bump.as_ref(),
    ];

    crate::utils::create_wsol_unwrap_account(
        ctx.accounts.strategist.to_account_info(),
        ctx.accounts.unwrap_degen.to_account_info(),
        ctx.accounts.native_mint.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        &[&degen_seeds],
    )?;

    crate::utils::unwrap_wsol_to_wallet(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.vault_token_account.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.unwrap_degen.to_account_info(),
        ctx.accounts.degen_wallet.to_account_info(),
        perf,
        signer,
    )?;

    ctx.accounts.vault_fee_state.claimed_performance_fees = ctx
        .accounts
        .vault_fee_state
        .claimed_performance_fees
        .saturating_add(perf);
    ctx.accounts.vault.total_assets = ctx.accounts.vault.total_assets.saturating_sub(perf);

    Ok(())
}
