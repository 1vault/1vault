use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{ProtocolConfig, StakerAccount, Vault, VaultFeeState};
use crate::utils::{apply_bps, apply_discount_bps};

#[derive(Accounts)]
pub struct AccrueFees<'info> {
    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut, seeds = [VAULT_SEED, vault.strategist.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [VAULT_FEE_SEED, vault.key().as_ref()], bump = vault_fee_state.bump,
        constraint = vault_fee_state.vault == vault.key())]
    pub vault_fee_state: Account<'info, VaultFeeState>,

    #[account(seeds = [STAKER_SEED, vault.strategist.as_ref()], bump = staker.bump)]
    pub staker: Option<Account<'info, StakerAccount>>,
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

    let mut perf_fee = apply_bps(profit_on_nav, vault.performance_fee_bps)?;
    if let Some(staker) = &ctx.accounts.staker {
        perf_fee = apply_discount_bps(perf_fee, staker.fee_discount_bps)?;
    }

    let protocol_fee = apply_bps(perf_fee, ctx.accounts.protocol_config.protocol_fee_share_bps)?;
    let strategist_fee = perf_fee.saturating_sub(protocol_fee);

    let fee_state = &mut ctx.accounts.vault_fee_state;
    fee_state.accrued_performance_fees =
        fee_state.accrued_performance_fees.saturating_add(strategist_fee);
    fee_state.accrued_protocol_fees = fee_state.accrued_protocol_fees.saturating_add(protocol_fee);
    fee_state.last_fee_share_price = share_price;

    emit!(crate::events::FeeAccrued {
        vault: ctx.accounts.vault.key(),
        performance_fee: strategist_fee,
        protocol_fee,
        share_price,
        timestamp: Clock::get()?.unix_timestamp,
    });

    let vault = &mut ctx.accounts.vault;
    vault.high_water_mark = share_price;
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimFees<'info> {
    pub strategist: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [VAULT_FEE_SEED, vault.key().as_ref()], bump = vault_fee_state.bump,
        constraint = vault_fee_state.vault == vault.key(),
        constraint = vault_fee_state.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault_fee_state: Account<'info, VaultFeeState>,

    #[account(mut, constraint = vault_token_account.key() == vault.vault_token_account)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut, constraint = strategist_token_account.owner == strategist.key(),
        constraint = strategist_token_account.mint == vault.base_mint)]
    pub strategist_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [TREASURY_SEED, vault.base_mint.as_ref()],
        bump,
        token::mint = vault.base_mint,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
    let perf = ctx.accounts.vault_fee_state.claimable_performance();
    let protocol = ctx.accounts.vault_fee_state.claimable_protocol();
    require!(perf > 0 || protocol > 0, OneVaultError::NothingToClaim);

    let vault = &ctx.accounts.vault;
    let strategist_key = vault.strategist;
    let vault_id_bytes = vault.vault_id.to_le_bytes();
    let vault_bump = vault.bump;
    let seeds = &[
        VAULT_SEED,
        strategist_key.as_ref(),
        vault_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer = &[&seeds[..]];

    if perf > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.strategist_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            perf,
        )?;
        ctx.accounts.vault_fee_state.claimed_performance_fees = ctx
            .accounts
            .vault_fee_state
            .claimed_performance_fees
            .saturating_add(perf);
        ctx.accounts.vault.total_assets = ctx.accounts.vault.total_assets.saturating_sub(perf);
    }

    if protocol > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault_token_account.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            protocol,
        )?;
        ctx.accounts.vault_fee_state.claimed_protocol_fees = ctx
            .accounts
            .vault_fee_state
            .claimed_protocol_fees
            .saturating_add(protocol);
        ctx.accounts.vault.total_assets = ctx.accounts.vault.total_assets.saturating_sub(protocol);
    }

    Ok(())
}

#[derive(Accounts)]
pub struct ClaimReferralRewards<'info> {
    pub referrer: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut, seeds = [REFERRAL_SEED, referral_account.user.as_ref()], bump = referral_account.bump,
        constraint = referral_account.referrer == referrer.key() @ OneVaultError::Unauthorized)]
    pub referral_account: Account<'info, crate::state::ReferralAccount>,

    pub mint: Account<'info, anchor_spl::token::Mint>,

    #[account(mut, constraint = referrer_token_account.owner == referrer.key(),
        constraint = referrer_token_account.mint == mint.key())]
    pub referrer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [TREASURY_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    /// CHECK: treasury authority PDA
    #[account(seeds = [TREASURY_SEED], bump)]
    pub treasury_authority: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim_referral_rewards(ctx: Context<ClaimReferralRewards>) -> Result<()> {
    let claimable = ctx.accounts.referral_account.claimable_rewards;
    require!(claimable > 0, OneVaultError::NothingToClaim);
    require!(
        ctx.accounts.treasury_token_account.amount >= claimable,
        OneVaultError::InsufficientLiquidity
    );

    let treasury_bump = ctx.bumps.treasury_authority;
    let treasury_seeds = &[TREASURY_SEED, &[treasury_bump]];
    let treasury_signer = &[&treasury_seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.treasury_token_account.to_account_info(),
                to: ctx.accounts.referrer_token_account.to_account_info(),
                authority: ctx.accounts.treasury_authority.to_account_info(),
            },
            treasury_signer,
        ),
        claimable,
    )?;

    ctx.accounts.referral_account.claimable_rewards = 0;
    Ok(())
}
