use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_lang::solana_program::system_instruction;
use solana_stake_interface::instruction as stake_ix;
use solana_stake_interface::state::{Authorized, Lockup};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::events::{VaultSolStaked, VaultSolUnstaked};
use crate::state::{Vault, VaultStakeState, YieldStrategy};

#[derive(Accounts)]
pub struct InitVaultStake<'info> {
    #[account(mut)]
    pub strategist: Signer<'info>,

    #[account(seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,

    #[account(init, payer = strategist, space = 8 + VaultStakeState::INIT_SPACE,
        seeds = [VAULT_STAKE_SEED, vault.key().as_ref()], bump)]
    pub vault_stake_state: Account<'info, VaultStakeState>,

    #[account(
        init,
        payer = strategist,
        space = STAKE_ACCOUNT_SPACE,
        seeds = [VAULT_STAKE_ACCOUNT_SEED, vault.key().as_ref()],
        bump,
        owner = stake_program.key(),
    )]
    /// CHECK: native stake account owned by stake program
    pub stake_account: UncheckedAccount<'info>,

    /// CHECK: native stake program
    #[account(address = STAKE_PROGRAM_ID)]
    pub stake_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_init_vault_stake(
    ctx: Context<InitVaultStake>,
    validator_vote_account: Pubkey,
) -> Result<()> {
    require!(validator_vote_account != Pubkey::default(), OneVaultError::InvalidValidator);

    let vault = &ctx.accounts.vault;
    let vault_seeds = &[
        VAULT_SEED,
        vault.strategist.as_ref(),
        &vault.vault_id.to_le_bytes(),
        &[vault.bump],
    ];
    let vault_signer = &[&vault_seeds[..]];

    let auth = Authorized {
        staker: vault.key(),
        withdrawer: vault.key(),
    };
    let lockup = Lockup::default();
    let init_ix = stake_ix::initialize(
        &ctx.accounts.stake_account.key(),
        &auth,
        &lockup,
    );
    invoke_signed(
        &init_ix,
        &[
            ctx.accounts.stake_account.to_account_info(),
            ctx.accounts.rent.to_account_info(),
        ],
        vault_signer,
    )?;

    let state = &mut ctx.accounts.vault_stake_state;
    state.vault = vault.key();
    state.stake_account = ctx.accounts.stake_account.key();
    state.validator_vote_account = validator_vote_account;
    state.staked_lamports = 0;
    state.pending_unstake = 0;
    state.last_synced_at = Clock::get()?.unix_timestamp;
    state.bump = ctx.bumps.vault_stake_state;
    Ok(())
}

#[derive(Accounts)]
pub struct DepositVaultSol<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, vault.strategist.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

pub fn handle_deposit_vault_sol(ctx: Context<DepositVaultSol>, lamports: u64) -> Result<()> {
    require!(lamports > 0, OneVaultError::InvalidAmount);
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.key(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        lamports,
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct StakeVaultSol<'info> {
    pub strategist: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = vault.yield_strategy == YieldStrategy::NativeSolStake @ OneVaultError::InvalidAmount)]
    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [VAULT_STAKE_SEED, vault.key().as_ref()], bump = vault_stake_state.bump,
        constraint = vault_stake_state.vault == vault.key())]
    pub vault_stake_state: Account<'info, VaultStakeState>,

    #[account(mut, address = vault_stake_state.stake_account @ OneVaultError::StakeAccountMismatch)]
    /// CHECK: stake account
    pub stake_account: UncheckedAccount<'info>,

    /// CHECK: validator vote account
    #[account(address = vault_stake_state.validator_vote_account @ OneVaultError::InvalidValidator)]
    pub validator_vote_account: UncheckedAccount<'info>,

    /// CHECK: stake program
    #[account(address = STAKE_PROGRAM_ID)]
    pub stake_program: UncheckedAccount<'info>,

    /// CHECK: clock sysvar
    #[account(address = CLOCK_SYSVAR_ID)]
    pub clock: UncheckedAccount<'info>,

    /// CHECK: stake history sysvar
    #[account(address = STAKE_HISTORY_SYSVAR_ID)]
    pub stake_history: UncheckedAccount<'info>,

    /// CHECK: stake config sysvar
    #[account(address = STAKE_CONFIG_ID)]
    pub stake_config: UncheckedAccount<'info>,
}

pub fn handle_stake_vault_sol(ctx: Context<StakeVaultSol>, lamports: u64) -> Result<()> {
    require!(lamports > 0, OneVaultError::InvalidAmount);
    require!(
        ctx.accounts.vault.to_account_info().lamports() >= lamports,
        OneVaultError::InsufficientVaultSol
    );

    let vault = &ctx.accounts.vault;
    let vault_seeds = &[
        VAULT_SEED,
        vault.strategist.as_ref(),
        &vault.vault_id.to_le_bytes(),
        &[vault.bump],
    ];
    let signer = &[&vault_seeds[..]];

    let transfer_ix = system_instruction::transfer(&vault.key(), &ctx.accounts.stake_account.key(), lamports);
    invoke_signed(
        &transfer_ix,
        &[
            vault.to_account_info(),
            ctx.accounts.stake_account.to_account_info(),
            ctx.accounts.stake_program.to_account_info(),
        ],
        signer,
    )?;

    let delegate_ix = stake_ix::delegate_stake(
        &ctx.accounts.stake_account.key(),
        &vault.key(),
        &ctx.accounts.validator_vote_account.key(),
    );
    invoke_signed(
        &delegate_ix,
        &[
            ctx.accounts.stake_account.to_account_info(),
            ctx.accounts.validator_vote_account.to_account_info(),
            ctx.accounts.clock.to_account_info(),
            ctx.accounts.stake_history.to_account_info(),
            ctx.accounts.stake_config.to_account_info(),
            vault.to_account_info(),
        ],
        signer,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.vault_stake_state;
    state.staked_lamports = state.staked_lamports.saturating_add(lamports);
    state.last_synced_at = now;

    let vault = &mut ctx.accounts.vault;
    vault.staked_value = vault.staked_value.saturating_add(lamports);

    emit!(VaultSolStaked {
        vault: vault.key(),
        lamports,
        validator: ctx.accounts.validator_vote_account.key(),
        timestamp: now,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct DeactivateVaultStake<'info> {
    pub strategist: Signer<'info>,

    #[account(seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [VAULT_STAKE_SEED, vault.key().as_ref()], bump = vault_stake_state.bump)]
    pub vault_stake_state: Account<'info, VaultStakeState>,

    #[account(mut, address = vault_stake_state.stake_account @ OneVaultError::StakeAccountMismatch)]
    /// CHECK: stake account
    pub stake_account: UncheckedAccount<'info>,

    /// CHECK: stake program
    #[account(address = STAKE_PROGRAM_ID)]
    pub stake_program: UncheckedAccount<'info>,

    /// CHECK: clock sysvar
    #[account(address = CLOCK_SYSVAR_ID)]
    pub clock: UncheckedAccount<'info>,
}

pub fn handle_deactivate_vault_stake(ctx: Context<DeactivateVaultStake>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let vault_seeds = &[
        VAULT_SEED,
        vault.strategist.as_ref(),
        &vault.vault_id.to_le_bytes(),
        &[vault.bump],
    ];
    let signer = &[&vault_seeds[..]];

    let ix = stake_ix::deactivate_stake(&ctx.accounts.stake_account.key(), &vault.key());
    invoke_signed(
        &ix,
        &[
            ctx.accounts.stake_account.to_account_info(),
            ctx.accounts.clock.to_account_info(),
            vault.to_account_info(),
        ],
        signer,
    )?;

    ctx.accounts.vault_stake_state.pending_unstake = ctx.accounts.vault_stake_state.staked_lamports;
    Ok(())
}

#[derive(Accounts)]
pub struct WithdrawVaultStake<'info> {
    pub strategist: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [VAULT_STAKE_SEED, vault.key().as_ref()], bump = vault_stake_state.bump)]
    pub vault_stake_state: Account<'info, VaultStakeState>,

    #[account(mut, address = vault_stake_state.stake_account @ OneVaultError::StakeAccountMismatch)]
    /// CHECK: stake account
    pub stake_account: UncheckedAccount<'info>,

    #[account(mut)]
    pub recipient: SystemAccount<'info>,

    /// CHECK: stake program
    #[account(address = STAKE_PROGRAM_ID)]
    pub stake_program: UncheckedAccount<'info>,

    /// CHECK: clock sysvar
    #[account(address = CLOCK_SYSVAR_ID)]
    pub clock: UncheckedAccount<'info>,

    /// CHECK: stake history sysvar
    #[account(address = STAKE_HISTORY_SYSVAR_ID)]
    pub stake_history: UncheckedAccount<'info>,
}

pub fn handle_withdraw_vault_stake(ctx: Context<WithdrawVaultStake>, lamports: u64) -> Result<()> {
    require!(lamports > 0, OneVaultError::InvalidAmount);

    let vault = &ctx.accounts.vault;
    let vault_seeds = &[
        VAULT_SEED,
        vault.strategist.as_ref(),
        &vault.vault_id.to_le_bytes(),
        &[vault.bump],
    ];
    let signer = &[&vault_seeds[..]];

    let ix = stake_ix::withdraw(
        &ctx.accounts.stake_account.key(),
        &vault.key(),
        &ctx.accounts.recipient.key(),
        lamports,
        None,
    );
    invoke_signed(
        &ix,
        &[
            ctx.accounts.stake_account.to_account_info(),
            ctx.accounts.recipient.to_account_info(),
            ctx.accounts.clock.to_account_info(),
            ctx.accounts.stake_history.to_account_info(),
            ctx.accounts.stake_program.to_account_info(),
            vault.to_account_info(),
        ],
        signer,
    )?;

    let now = Clock::get()?.unix_timestamp;
    let state = &mut ctx.accounts.vault_stake_state;
    state.staked_lamports = state.staked_lamports.saturating_sub(lamports);
    state.pending_unstake = state.pending_unstake.saturating_sub(lamports);
    state.last_synced_at = now;

    let vault = &mut ctx.accounts.vault;
    vault.staked_value = vault.staked_value.saturating_sub(lamports);

    emit!(VaultSolUnstaked {
        vault: vault.key(),
        lamports,
        timestamp: now,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct SyncVaultStake<'info> {
    #[account(mut, seeds = [VAULT_SEED, vault.strategist.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    #[account(seeds = [VAULT_STAKE_SEED, vault.key().as_ref()], bump = vault_stake_state.bump)]
    pub vault_stake_state: Account<'info, VaultStakeState>,

    #[account(address = vault_stake_state.stake_account @ OneVaultError::StakeAccountMismatch)]
    /// CHECK: stake account
    pub stake_account: UncheckedAccount<'info>,
}

pub fn handle_sync_vault_stake(ctx: Context<SyncVaultStake>) -> Result<()> {
    let lamports = ctx.accounts.stake_account.lamports();
    let rent = Rent::get()?.minimum_balance(STAKE_ACCOUNT_SPACE);
    let staked = lamports.saturating_sub(rent);

    ctx.accounts.vault.staked_value = staked;
    let state = &mut ctx.accounts.vault_stake_state;
    state.staked_lamports = staked;
    state.last_synced_at = Clock::get()?.unix_timestamp;
    Ok(())
}

#[derive(Accounts)]
pub struct SetVaultYieldStrategy<'info> {
    pub strategist: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,
}

pub fn handle_set_vault_yield_strategy(
    ctx: Context<SetVaultYieldStrategy>,
    strategy: YieldStrategy,
) -> Result<()> {
    ctx.accounts.vault.yield_strategy = strategy;
    Ok(())
}
