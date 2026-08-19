use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, Transfer};

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
    pub protocol_config: Box<Account<'info, ProtocolConfig>>,

    #[account(
        mut,
        seeds = [STRATEGIST_SEED, strategist.key().as_ref()],
        bump = strategist_account.bump,
        constraint = strategist_account.owner == strategist.key() @ OneVaultError::Unauthorized,
    )]
    pub strategist_account: Box<Account<'info, Strategist>>,

    #[account(
        seeds = [LICENSE_SEED, strategist.key().as_ref()],
        bump = license.bump,
        constraint = license.is_active @ OneVaultError::LicenseNotActive,
    )]
    pub license: Box<Account<'info, License>>,

    #[account(
        init,
        payer = strategist,
        space = 8 + Vault::INIT_SPACE,
        seeds = [VAULT_SEED, strategist.key().as_ref(), &vault_id.to_le_bytes()],
        bump
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        init,
        payer = strategist,
        space = 8 + VaultFeeState::INIT_SPACE,
        seeds = [VAULT_FEE_SEED, vault.key().as_ref()],
        bump
    )]
    pub vault_fee_state: Box<Account<'info, VaultFeeState>>,

    #[account(
        init,
        payer = strategist,
        space = 8 + VaultRiskState::INIT_SPACE,
        seeds = [VAULT_RISK_SEED, vault.key().as_ref()],
        bump
    )]
    pub vault_risk_state: Box<Account<'info, VaultRiskState>>,

    pub base_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = strategist,
        seeds = [SHARE_MINT_SEED, vault.key().as_ref()],
        bump,
        mint::decimals = base_mint.decimals,
        mint::authority = vault,
    )]
    pub share_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = strategist,
        token::mint = base_mint,
        token::authority = vault,
    )]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = strategist_license_tokens.mint == protocol_config.platform_token_mint @ OneVaultError::InvalidAmount,
        constraint = strategist_license_tokens.owner == strategist.key() @ OneVaultError::Unauthorized,
    )]
    pub strategist_license_tokens: Box<Account<'info, TokenAccount>>,

    #[account(address = protocol_config.platform_token_mint)]
    pub platform_token_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = strategist,
        seeds = [VAULT_LICENSE_SEED, vault.key().as_ref()],
        bump,
        token::mint = platform_token_mint,
        token::authority = vault,
    )]
    pub vault_license_vault: Box<Account<'info, TokenAccount>>,

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

    let lock_amount = ctx.accounts.protocol_config.license_lock_amount;
    require!(lock_amount > 0, OneVaultError::InsufficientLicenseBalance);
    require!(
        ctx.accounts.strategist_license_tokens.amount >= lock_amount,
        OneVaultError::InsufficientLicenseBalance
    );
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.strategist_license_tokens.to_account_info(),
                to: ctx.accounts.vault_license_vault.to_account_info(),
                authority: ctx.accounts.strategist.to_account_info(),
            },
        ),
        lock_amount,
    )?;

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
        constraint = vault.open_positions_count == 0 @ OneVaultError::VaultHasOpenPositions,
        constraint = vault.pending_trades_count == 0 @ OneVaultError::VaultHasPendingTrades,
        constraint = vault.position_value == 0 @ OneVaultError::VaultHasOpenPositions,
        constraint = vault.staked_value == 0 @ OneVaultError::VaultHasAssets)]
    pub vault: Account<'info, Vault>,
    /// Remaining vault capital is unwrapped to native SOL for each share holder
    /// via remaining_accounts triples: share ATA, unwrap PDA, destination wallet.
    #[account(
        mut,
        constraint = vault_token_account.key() == vault.vault_token_account,
        constraint = vault_token_account.mint == vault.base_mint @ OneVaultError::InvalidMint,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    /// CHECK: PDA token account holding the 1vault Licence lock. Empty for vaults
    /// created before per-vault licence escrow.
    #[account(
        mut,
        seeds = [VAULT_LICENSE_SEED, vault.key().as_ref()],
        bump,
    )]
    pub vault_license_vault: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = strategist_license_tokens.owner == strategist.key() @ OneVaultError::Unauthorized,
    )]
    pub strategist_license_tokens: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    #[account(address = WSOL_MINT)]
    pub native_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

fn unpack_token(info: &AccountInfo<'_>) -> Result<(Pubkey, Pubkey, u64)> {
    require_keys_eq!(*info.owner, token::ID, OneVaultError::InvalidMint);
    let acc = TokenAccount::try_deserialize(&mut &info.try_borrow_data()?[..])
        .map_err(|_| error!(OneVaultError::InvalidMint))?;
    Ok((acc.mint, acc.owner, acc.amount))
}

pub fn handle_close_vault<'a>(ctx: Context<'a, CloseVault<'a>>) -> Result<()> {
    let vault_bump = ctx.accounts.vault.bump;
    let vault_id_bytes = ctx.accounts.vault.vault_id.to_le_bytes();
    let strategist_key = ctx.accounts.vault.strategist;
    let vault_key = ctx.accounts.vault.key();
    let share_mint = ctx.accounts.vault.share_mint;
    let base_mint = ctx.accounts.vault.base_mint;
    let seeds: &[&[u8]] = &[
        VAULT_SEED,
        strategist_key.as_ref(),
        vault_id_bytes.as_ref(),
        &[vault_bump],
    ];
    let signer = &[seeds];

    let vault_ata_info = ctx.accounts.vault_token_account.to_account_info();
    let vault_auth_info = ctx.accounts.vault.to_account_info();
    let token_program_info = ctx.accounts.token_program.to_account_info();
    let system_program_info = ctx.accounts.system_program.to_account_info();
    let native_mint_info = ctx.accounts.native_mint.to_account_info();
    let strategist_info = ctx.accounts.strategist.to_account_info();
    let program_id = ctx.program_id;
    let holders: Vec<(AccountInfo, AccountInfo, AccountInfo)> = ctx
        .remaining_accounts
        .chunks(3)
        .filter(|c| c.len() == 3)
        .map(|c| (c[0].clone(), c[1].clone(), c[2].clone()))
        .collect();

    let mut remaining_shares = ctx.accounts.vault.total_shares;
    let mut remaining_nav = ctx.accounts.vault_token_account.amount;
    if remaining_shares > 0 {
        require!(base_mint == WSOL_MINT, OneVaultError::InvalidMint);
        require!(ctx.remaining_accounts.len() % 3 == 0, OneVaultError::InvalidAmount);
        require!(
            holders.len() <= MAX_CLOSE_SHARE_HOLDERS,
            OneVaultError::InvalidAmount
        );
        require!(!holders.is_empty(), OneVaultError::VaultHasShares);

        let mut seen: Vec<Pubkey> = Vec::with_capacity(holders.len());
        let now = Clock::get()?.unix_timestamp;
        for (share_info, unwrap_info, wallet_info) in holders.iter() {
            require!(unwrap_info.is_writable, OneVaultError::Unauthorized);
            require!(wallet_info.is_writable, OneVaultError::Unauthorized);
            let (s_mint, s_owner, shares) = unpack_token(share_info)?;
            require!(s_mint == share_mint, OneVaultError::InvalidMint);
            require_keys_eq!(*wallet_info.key, s_owner, OneVaultError::Unauthorized);
            let (expected_unwrap, unwrap_bump) = Pubkey::find_program_address(
                &[FEE_UNWRAP_SEED, vault_key.as_ref(), s_owner.as_ref()],
                program_id,
            );
            require_keys_eq!(*unwrap_info.key, expected_unwrap, OneVaultError::Unauthorized);
            require!(!seen.contains(share_info.key), OneVaultError::InvalidAmount);
            seen.push(*share_info.key);

            if shares > 0 {
                let payout = Vault::close_payout(shares, remaining_shares, remaining_nav)?;
                if payout > 0 {
                    let unwrap_bump_arr = [unwrap_bump];
                    let unwrap_seeds = [
                        FEE_UNWRAP_SEED,
                        vault_key.as_ref(),
                        s_owner.as_ref(),
                        unwrap_bump_arr.as_ref(),
                    ];
                    crate::utils::create_wsol_unwrap_account(
                        strategist_info.clone(),
                        unwrap_info.clone(),
                        native_mint_info.clone(),
                        vault_auth_info.clone(),
                        token_program_info.clone(),
                        system_program_info.clone(),
                        &[&unwrap_seeds],
                    )?;
                    crate::utils::unwrap_wsol_to_wallet(
                        token_program_info.clone(),
                        vault_ata_info.clone(),
                        vault_auth_info.clone(),
                        unwrap_info.clone(),
                        wallet_info.clone(),
                        payout,
                        signer,
                    )?;
                }
                remaining_shares = remaining_shares
                    .checked_sub(shares)
                    .ok_or(OneVaultError::MathOverflow)?;
                remaining_nav = remaining_nav.saturating_sub(payout);
                emit!(crate::events::VaultClosePayout {
                    vault: vault_key,
                    investor: s_owner,
                    shares,
                    amount: payout,
                    timestamp: now,
                });
            }
        }
        require!(remaining_shares == 0, OneVaultError::VaultHasShares);
    }

    ctx.accounts.vault_token_account.reload()?;
    require!(
        ctx.accounts.vault_token_account.amount == 0,
        OneVaultError::VaultHasAssets
    );
    ctx.accounts.vault.total_shares = 0;
    ctx.accounts.vault.total_assets = 0;

    let license_empty = ctx.accounts.vault_license_vault.data_is_empty();
    let license_amount = if license_empty {
        0
    } else {
        unpack_token(&ctx.accounts.vault_license_vault.to_account_info())?.2
    };
    if !license_empty {
        if license_amount > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.vault_license_vault.to_account_info(),
                        to: ctx.accounts.strategist_license_tokens.to_account_info(),
                        authority: ctx.accounts.vault.to_account_info(),
                    },
                    signer,
                ),
                license_amount,
            )?;
        }
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            CloseAccount {
                account: ctx.accounts.vault_license_vault.to_account_info(),
                destination: ctx.accounts.strategist.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ))?;
    }

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
    pub vault: Box<Account<'info, Vault>>,
    #[account(constraint = vault_token_account.key() == vault.vault_token_account,
        constraint = vault_token_account.mint == vault.base_mint)]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,
}

pub fn handle_update_nav(ctx: Context<UpdateNav>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.total_assets = ctx.accounts.vault_token_account.amount;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateVaultStakedValue<'info> {
    pub strategist: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Box<Account<'info, Vault>>,
}

pub fn handle_update_vault_staked_value(ctx: Context<UpdateVaultStakedValue>, staked_value: u64) -> Result<()> {
    ctx.accounts.vault.staked_value = staked_value;
    Ok(())
}
