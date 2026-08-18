use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::ProtocolConfig;

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [PROTOCOL_SEED],
        bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_protocol(
    ctx: Context<InitializeProtocol>,
    treasury: Pubkey,
    platform_token_mint: Pubkey,
    license_lock_amount: u64,
    withdrawal_fee_bps: u16,
    referral_fee_share_bps: u16,
    performance_fee_bps: u16,
    protocol_fee_share_bps: u16,
    allowed_dex_programs: Vec<Pubkey>,
) -> Result<()> {
    require!(
        withdrawal_fee_bps <= BPS_DENOMINATOR as u16,
        OneVaultError::InvalidFeeConfig
    );
    require!(
        referral_fee_share_bps <= BPS_DENOMINATOR as u16,
        OneVaultError::InvalidFeeConfig
    );
    require!(
        performance_fee_bps <= BPS_DENOMINATOR as u16,
        OneVaultError::InvalidFeeConfig
    );
    require!(
        protocol_fee_share_bps <= BPS_DENOMINATOR as u16,
        OneVaultError::InvalidFeeConfig
    );
    require!(
        allowed_dex_programs.len() <= MAX_ALLOWED_DEX,
        OneVaultError::InvalidAmount
    );

    let config = &mut ctx.accounts.protocol_config;
    config.authority = ctx.accounts.authority.key();
    config.treasury = treasury;
    config.platform_token_mint = platform_token_mint;
    config.license_lock_amount = license_lock_amount;
    config.withdrawal_fee_bps = withdrawal_fee_bps;
    config.referral_fee_share_bps = referral_fee_share_bps;
    config.performance_fee_bps = performance_fee_bps;
    config.protocol_fee_share_bps = protocol_fee_share_bps;
    config.is_paused = false;
    config.allowed_dex_count = allowed_dex_programs.len() as u8;
    config.allowed_dex_programs = [Pubkey::default(); MAX_ALLOWED_DEX];
    for (i, dex) in allowed_dex_programs.iter().enumerate() {
        config.allowed_dex_programs[i] = *dex;
    }
    config.protected_dex_count = 0;
    config.protected_dex_programs = [Pubkey::default(); MAX_ALLOWED_DEX];
    let launchpad_defaults = DEFAULT_LAUNCHPAD_PROGRAMS;
    config.launchpad_program_count = launchpad_defaults.len() as u8;
    config.launchpad_programs = [Pubkey::default(); MAX_ALLOWED_DEX];
    for (i, lp) in launchpad_defaults.iter().enumerate() {
        config.launchpad_programs[i] = *lp;
    }
    config.tier_thresholds = DEFAULT_TIER_THRESHOLDS;
    config.tier_discounts_bps = DEFAULT_TIER_DISCOUNTS_BPS;
    config.upgrade_multisig = Pubkey::default();
    config.multisig_enabled = false;
    config.bump = ctx.bumps.protocol_config;

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateProtocolConfig<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handle_update_protocol_config(
    ctx: Context<UpdateProtocolConfig>,
    treasury: Option<Pubkey>,
    license_lock_amount: Option<u64>,
    withdrawal_fee_bps: Option<u16>,
    referral_fee_share_bps: Option<u16>,
    performance_fee_bps: Option<u16>,
    protocol_fee_share_bps: Option<u16>,
) -> Result<()> {
    let config = &mut ctx.accounts.protocol_config;

    if let Some(t) = treasury {
        config.treasury = t;
    }
    if let Some(amount) = license_lock_amount {
        config.license_lock_amount = amount;
    }
    if let Some(fee) = withdrawal_fee_bps {
        require!(fee <= BPS_DENOMINATOR as u16, OneVaultError::InvalidFeeConfig);
        config.withdrawal_fee_bps = fee;
    }
    if let Some(fee) = referral_fee_share_bps {
        require!(fee <= BPS_DENOMINATOR as u16, OneVaultError::InvalidFeeConfig);
        config.referral_fee_share_bps = fee;
    }
    if let Some(fee) = performance_fee_bps {
        require!(fee <= BPS_DENOMINATOR as u16, OneVaultError::InvalidFeeConfig);
        config.performance_fee_bps = fee;
    }
    if let Some(fee) = protocol_fee_share_bps {
        require!(fee <= BPS_DENOMINATOR as u16, OneVaultError::InvalidFeeConfig);
        config.protocol_fee_share_bps = fee;
    }

    Ok(())
}

#[derive(Accounts)]
pub struct PauseProtocol<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handle_pause_protocol(ctx: Context<PauseProtocol>, paused: bool) -> Result<()> {
    ctx.accounts.protocol_config.is_paused = paused;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateStakingTiers<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handle_update_staking_tiers(
    ctx: Context<UpdateStakingTiers>,
    tier_thresholds: [u64; MAX_STAKING_TIERS],
    tier_discounts_bps: [u16; MAX_STAKING_TIERS],
) -> Result<()> {
    for discount in tier_discounts_bps {
        require!(discount <= BPS_DENOMINATOR as u16, OneVaultError::InvalidFeeConfig);
    }
    let config = &mut ctx.accounts.protocol_config;
    config.tier_thresholds = tier_thresholds;
    config.tier_discounts_bps = tier_discounts_bps;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateAllowedDex<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handle_update_allowed_dex(
    ctx: Context<UpdateAllowedDex>,
    allowed_dex_programs: Vec<Pubkey>,
) -> Result<()> {
    require!(
        allowed_dex_programs.len() <= MAX_ALLOWED_DEX,
        OneVaultError::InvalidAmount
    );
    let config = &mut ctx.accounts.protocol_config;
    config.allowed_dex_count = allowed_dex_programs.len() as u8;
    config.allowed_dex_programs = [Pubkey::default(); MAX_ALLOWED_DEX];
    for (i, dex) in allowed_dex_programs.iter().enumerate() {
        config.allowed_dex_programs[i] = *dex;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateAllowedLaunchpads<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handle_update_allowed_launchpads(
    ctx: Context<UpdateAllowedLaunchpads>,
    launchpad_programs: Vec<Pubkey>,
) -> Result<()> {
    require!(
        launchpad_programs.len() <= MAX_ALLOWED_DEX,
        OneVaultError::InvalidAmount
    );
    let config = &mut ctx.accounts.protocol_config;
    config.launchpad_program_count = launchpad_programs.len() as u8;
    config.launchpad_programs = [Pubkey::default(); MAX_ALLOWED_DEX];
    for (i, program) in launchpad_programs.iter().enumerate() {
        config.launchpad_programs[i] = *program;
    }
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,

    pub mint: Account<'info, Mint>,

    /// CHECK: treasury authority PDA
    #[account(seeds = [TREASURY_SEED], bump)]
    pub treasury_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        seeds = [TREASURY_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = treasury_authority,
    )]
    pub treasury_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_initialize_treasury(_ctx: Context<InitializeTreasury>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct SweepTreasurySol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized,
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    /// CHECK: platform native-SOL recipient.
    #[account(mut, constraint = platform_wallet.key() == protocol_config.treasury @ OneVaultError::Unauthorized)]
    pub platform_wallet: UncheckedAccount<'info>,

    /// CHECK: treasury authority PDA
    #[account(seeds = [TREASURY_SEED], bump)]
    pub treasury_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [TREASURY_SEED, native_mint.key().as_ref()],
        bump,
        token::mint = native_mint,
        token::authority = treasury_authority,
    )]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [FEE_UNWRAP_SEED, treasury_token_account.key().as_ref()],
        bump
    )]
    /// CHECK: temporary wSOL ATA, created and closed in this instruction.
    pub unwrap_account: UncheckedAccount<'info>,

    #[account(address = WSOL_MINT)]
    pub native_mint: Box<Account<'info, Mint>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_sweep_treasury_sol(ctx: Context<SweepTreasurySol>) -> Result<()> {
    let amount = ctx.accounts.treasury_token_account.amount;
    require!(amount > 0, OneVaultError::NothingToClaim);

    let bump = [ctx.bumps.treasury_authority];
    let seeds = [TREASURY_SEED, bump.as_ref()];
    let signer = &[&seeds[..]];

    let unwrap_bump = [ctx.bumps.unwrap_account];
    let treasury_ata = ctx.accounts.treasury_token_account.key();
    let unwrap_seeds = [FEE_UNWRAP_SEED, treasury_ata.as_ref(), unwrap_bump.as_ref()];

    crate::utils::create_wsol_unwrap_account(
        ctx.accounts.authority.to_account_info(),
        ctx.accounts.unwrap_account.to_account_info(),
        ctx.accounts.native_mint.to_account_info(),
        ctx.accounts.treasury_authority.to_account_info(),
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.system_program.to_account_info(),
        &[&unwrap_seeds],
    )?;

    crate::utils::unwrap_wsol_to_wallet(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.treasury_token_account.to_account_info(),
        ctx.accounts.treasury_authority.to_account_info(),
        ctx.accounts.unwrap_account.to_account_info(),
        ctx.accounts.platform_wallet.to_account_info(),
        amount,
        signer,
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateProtectedDex<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [PROTOCOL_SEED],
        bump = protocol_config.bump,
        has_one = authority @ OneVaultError::Unauthorized,
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn handle_update_protected_dex(
    ctx: Context<UpdateProtectedDex>,
    protected_dex_programs: Vec<Pubkey>,
) -> Result<()> {
    require!(
        protected_dex_programs.len() <= MAX_ALLOWED_DEX,
        OneVaultError::InvalidAmount
    );
    let config = &mut ctx.accounts.protocol_config;
    config.protected_dex_count = protected_dex_programs.len() as u8;
    config.protected_dex_programs = [Pubkey::default(); MAX_ALLOWED_DEX];
    for (i, dex) in protected_dex_programs.iter().enumerate() {
        config.protected_dex_programs[i] = *dex;
    }
    Ok(())
}
