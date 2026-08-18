use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{ProtocolConfig, StakerAccount, StakingPool};

#[derive(Accounts)]
pub struct InitializeStaking<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(init, payer = authority, space = 8 + StakingPool::INIT_SPACE,
        seeds = [STAKING_POOL_SEED], bump)]
    pub staking_pool: Account<'info, StakingPool>,

    #[account(init, payer = authority, token::mint = platform_token_mint, token::authority = staking_pool,
        seeds = [STAKING_POOL_SEED, b"vault"], bump)]
    pub staking_vault: Account<'info, TokenAccount>,

    pub platform_token_mint: Account<'info, anchor_spl::token::Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_initialize_staking(ctx: Context<InitializeStaking>) -> Result<()> {
    let pool = &mut ctx.accounts.staking_pool;
    pool.platform_token_mint = ctx.accounts.platform_token_mint.key();
    pool.total_staked = 0;
    pool.reward_per_token = 0;
    pool.bump = ctx.bumps.staking_pool;
    pool.vault_bump = ctx.bumps.staking_vault;
    Ok(())
}

#[derive(Accounts)]
pub struct InitStaker<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(init, payer = owner, space = 8 + StakerAccount::INIT_SPACE,
        seeds = [STAKER_SEED, owner.key().as_ref()], bump)]
    pub staker: Account<'info, StakerAccount>,

    pub system_program: Program<'info, System>,
}

pub fn handle_init_staker(ctx: Context<InitStaker>) -> Result<()> {
    let staker = &mut ctx.accounts.staker;
    staker.owner = ctx.accounts.owner.key();
    staker.staked_amount = 0;
    staker.stake_start = 0;
    staker.lock_duration_secs = 0;
    staker.tier = 0;
    staker.fee_discount_bps = 0;
    staker.pending_rewards = 0;
    staker.reward_debt = 0;
    staker.bump = ctx.bumps.staker;
    Ok(())
}

#[derive(Accounts)]
pub struct StakePlatform<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut, seeds = [STAKING_POOL_SEED], bump = staking_pool.bump)]
    pub staking_pool: Account<'info, StakingPool>,

    #[account(mut, seeds = [STAKER_SEED, owner.key().as_ref()], bump = staker.bump,
        constraint = staker.owner == owner.key() @ OneVaultError::Unauthorized)]
    pub staker: Account<'info, StakerAccount>,

    #[account(mut, constraint = owner_token.mint == staking_pool.platform_token_mint,
        constraint = owner_token.owner == owner.key())]
    pub owner_token: Account<'info, TokenAccount>,

    #[account(mut, seeds = [STAKING_POOL_SEED, b"vault"], bump = staking_pool.vault_bump)]
    pub staking_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_stake_platform(ctx: Context<StakePlatform>, amount: u64, lock_duration_secs: i64) -> Result<()> {
    require!(amount > 0, OneVaultError::InvalidAmount);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.owner_token.to_account_info(),
                to: ctx.accounts.staking_vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
    )?;

    let new_staked = ctx.accounts.staker.staked_amount.saturating_add(amount);
    let discount = ctx.accounts.protocol_config.staking_discount_bps(new_staked);

    let staker = &mut ctx.accounts.staker;
    if staker.stake_start == 0 {
        staker.stake_start = Clock::get()?.unix_timestamp;
    }
    staker.staked_amount = new_staked;
    staker.lock_duration_secs = lock_duration_secs;
    staker.fee_discount_bps = discount;

    for (i, threshold) in ctx.accounts.protocol_config.tier_thresholds.iter().enumerate() {
        if staker.staked_amount >= *threshold {
            staker.tier = i as u8;
        }
    }

    ctx.accounts.staking_pool.total_staked = ctx.accounts.staking_pool.total_staked.saturating_add(amount);

    emit!(crate::events::PlatformStaked {
        owner: ctx.accounts.owner.key(),
        amount,
        total_staked: ctx.accounts.staker.staked_amount,
        tier: ctx.accounts.staker.tier,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UnstakePlatform<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [STAKING_POOL_SEED], bump = staking_pool.bump)]
    pub staking_pool: Account<'info, StakingPool>,

    #[account(mut, seeds = [STAKER_SEED, owner.key().as_ref()], bump = staker.bump,
        constraint = staker.owner == owner.key() @ OneVaultError::Unauthorized)]
    pub staker: Account<'info, StakerAccount>,

    #[account(mut, constraint = owner_token.owner == owner.key(),
        constraint = owner_token.mint == staking_pool.platform_token_mint)]
    pub owner_token: Account<'info, TokenAccount>,

    #[account(mut, seeds = [STAKING_POOL_SEED, b"vault"], bump = staking_pool.vault_bump)]
    pub staking_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_unstake_platform(ctx: Context<UnstakePlatform>, amount: u64) -> Result<()> {
    require!(amount > 0 && amount <= ctx.accounts.staker.staked_amount, OneVaultError::InvalidAmount);

    let now = Clock::get()?.unix_timestamp;
    let unlock_at = ctx.accounts.staker.stake_start + ctx.accounts.staker.lock_duration_secs;
    require!(now >= unlock_at, OneVaultError::StakeLocked);

    let pool_bump = ctx.accounts.staking_pool.bump;
    let seeds = &[STAKING_POOL_SEED, &[pool_bump]];
    let signer = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.staking_vault.to_account_info(),
                to: ctx.accounts.owner_token.to_account_info(),
                authority: ctx.accounts.staking_pool.to_account_info(),
            },
            signer,
        ),
        amount,
    )?;

    ctx.accounts.staker.staked_amount = ctx.accounts.staker.staked_amount.saturating_sub(amount);
    ctx.accounts.staking_pool.total_staked = ctx.accounts.staking_pool.total_staked.saturating_sub(amount);

    emit!(crate::events::PlatformUnstaked {
        owner: ctx.accounts.owner.key(),
        amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct ClaimStakingReward<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [STAKER_SEED, owner.key().as_ref()], bump = staker.bump,
        constraint = staker.owner == owner.key() @ OneVaultError::Unauthorized)]
    pub staker: Account<'info, StakerAccount>,

    #[account(mut, seeds = [STAKING_POOL_SEED], bump = staking_pool.bump)]
    pub staking_pool: Account<'info, StakingPool>,

    #[account(mut, constraint = owner_token.owner == owner.key(),
        constraint = owner_token.mint == staking_pool.platform_token_mint)]
    pub owner_token: Account<'info, TokenAccount>,

    #[account(mut, seeds = [STAKING_POOL_SEED, b"vault"], bump = staking_pool.vault_bump)]
    pub staking_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim_staking_reward(ctx: Context<ClaimStakingReward>) -> Result<()> {
    let claimable = ctx.accounts.staker.pending_rewards;
    require!(claimable > 0, OneVaultError::NothingToClaim);

    let pool_bump = ctx.accounts.staking_pool.bump;
    let seeds = &[STAKING_POOL_SEED, &[pool_bump]];
    let signer = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.staking_vault.to_account_info(),
                to: ctx.accounts.owner_token.to_account_info(),
                authority: ctx.accounts.staking_pool.to_account_info(),
            },
            signer,
        ),
        claimable,
    )?;

    ctx.accounts.staker.pending_rewards = 0;
    Ok(())
}

#[derive(Accounts)]
pub struct FundStakingRewards<'info> {
    pub authority: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut, seeds = [STAKER_SEED, staker_owner.key().as_ref()], bump = staker.bump)]
    pub staker: Account<'info, StakerAccount>,

    /// CHECK: PDA seed for staker account
    pub staker_owner: UncheckedAccount<'info>,
}

pub fn handle_fund_staking_rewards(ctx: Context<FundStakingRewards>, amount: u64) -> Result<()> {
    ctx.accounts.staker.pending_rewards = ctx.accounts.staker.pending_rewards.saturating_add(amount);
    Ok(())
}
