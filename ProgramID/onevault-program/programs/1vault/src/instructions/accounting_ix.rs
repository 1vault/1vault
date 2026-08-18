use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{ProtocolConfig, StakerAccount, Vault, VaultFeeState};
use crate::utils::{apply_bps, apply_discount_bps};

#[derive(Accounts)]
pub struct AccrueFees<'info> {
    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump)]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    #[account(mut, seeds = [VAULT_SEED, vault.strategist.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(mut, seeds = [VAULT_FEE_SEED, vault.key().as_ref()], bump = vault_fee_state.bump,
        constraint = vault_fee_state.vault == vault.key())]
    pub vault_fee_state: Box<Account<'info, VaultFeeState>>,

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

    /// CHECK: platform native-SOL recipient (ProtocolConfig.treasury).
    #[account(mut, constraint = platform_wallet.key() == protocol_config.treasury @ OneVaultError::Unauthorized)]
    pub platform_wallet: UncheckedAccount<'info>,

    /// CHECK: degen native-SOL recipient.
    #[account(mut, constraint = degen_wallet.key() == DEGEN_FEE_WALLET @ OneVaultError::Unauthorized)]
    pub degen_wallet: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [FEE_UNWRAP_SEED, vault.key().as_ref(), platform_wallet.key().as_ref()],
        bump
    )]
    /// CHECK: temporary wSOL ATA, created and closed in this instruction.
    pub unwrap_platform: UncheckedAccount<'info>,

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
    let protocol = ctx.accounts.vault_fee_state.claimable_protocol();
    require!(perf > 0 || protocol > 0, OneVaultError::NothingToClaim);

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
    let platform_key = ctx.accounts.platform_wallet.key();
    let degen_key = ctx.accounts.degen_wallet.key();
    let plat_bump = [ctx.bumps.unwrap_platform];
    let degen_bump = [ctx.bumps.unwrap_degen];
    let plat_seeds = [
        FEE_UNWRAP_SEED,
        vault_key.as_ref(),
        platform_key.as_ref(),
        plat_bump.as_ref(),
    ];
    let degen_seeds = [
        FEE_UNWRAP_SEED,
        vault_key.as_ref(),
        degen_key.as_ref(),
        degen_bump.as_ref(),
    ];

    crate::utils::create_wsol_unwrap_account(
        ctx.accounts.strategist.to_account_info(),
        ctx.accounts.unwrap_platform.to_account_info(),
        ctx.accounts.native_mint.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        &[&plat_seeds],
    )?;
    crate::utils::create_wsol_unwrap_account(
        ctx.accounts.strategist.to_account_info(),
        ctx.accounts.unwrap_degen.to_account_info(),
        ctx.accounts.native_mint.to_account_info(),
        ctx.accounts.vault.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        &[&degen_seeds],
    )?;

    if perf > 0 {
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
    }

    if protocol > 0 {
        crate::utils::unwrap_wsol_to_wallet(
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.vault_token_account.to_account_info(),
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.unwrap_platform.to_account_info(),
            ctx.accounts.platform_wallet.to_account_info(),
            protocol,
            signer,
        )?;
        ctx.accounts.vault_fee_state.claimed_protocol_fees = ctx
            .accounts
            .vault_fee_state
            .claimed_protocol_fees
            .saturating_add(protocol);
        ctx.accounts.vault.total_assets = ctx.accounts.vault.total_assets.saturating_sub(protocol);
    }

    // Refund rent on the unwrap ATA that was not used.
    if perf == 0 {
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.unwrap_degen.to_account_info(),
                destination: ctx.accounts.strategist.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ))?;
    }
    if protocol == 0 {
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.unwrap_platform.to_account_info(),
                destination: ctx.accounts.strategist.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ))?;
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
