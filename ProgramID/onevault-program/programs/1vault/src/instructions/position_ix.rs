use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{PositionStatus, Vault, VaultPosition};
use crate::utils::evaluate_tp_sl;

#[derive(Accounts)]
pub struct IncreasePosition<'info> {
    pub strategist: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [VAULT_POSITION_SEED, vault.key().as_ref(), &vault_position.position_id.to_le_bytes()],
        bump = vault_position.bump, constraint = vault_position.vault == vault.key(),
        constraint = vault_position.status == PositionStatus::Open @ OneVaultError::PositionNotOpen)]
    pub vault_position: Account<'info, VaultPosition>,
}

pub fn handle_increase_position(ctx: Context<IncreasePosition>, added_value: u64, added_output: u64) -> Result<()> {
    let pos = &mut ctx.accounts.vault_position;
    pos.entry_value = pos.entry_value.saturating_add(added_value);
    pos.current_value = pos.current_value.saturating_add(added_value);
    pos.output_amount = pos.output_amount.saturating_add(added_output);
    pos.dca_entries_completed = pos.dca_entries_completed.saturating_add(1);
    ctx.accounts.vault.position_value = ctx.accounts.vault.position_value.saturating_add(added_value);
    Ok(())
}

#[derive(Accounts)]
pub struct ReducePosition<'info> {
    pub strategist: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [VAULT_POSITION_SEED, vault.key().as_ref(), &vault_position.position_id.to_le_bytes()],
        bump = vault_position.bump, constraint = vault_position.vault == vault.key(),
        constraint = vault_position.status == PositionStatus::Open @ OneVaultError::PositionNotOpen)]
    pub vault_position: Account<'info, VaultPosition>,
    #[account(mut, constraint = vault_token_account.key() == vault.vault_token_account)]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub output_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_reduce_position(ctx: Context<ReducePosition>, reduce_bps: u16, proceeds: u64) -> Result<()> {
    let pos = &mut ctx.accounts.vault_position;
    let reduce_value = crate::utils::apply_bps(pos.current_value, reduce_bps)?;
    pos.current_value = pos.current_value.saturating_sub(reduce_value);
    pos.output_amount = pos.output_amount.saturating_sub(proceeds);
    pos.status = PositionStatus::Reduced;

    ctx.accounts.vault.position_value = ctx.accounts.vault.position_value.saturating_sub(reduce_value);
    ctx.accounts.vault.total_assets = ctx.accounts.vault.total_assets.saturating_add(proceeds);

    let strategist_key = ctx.accounts.vault.strategist;
    let vault_id_bytes = ctx.accounts.vault.vault_id.to_le_bytes();
    let vault_bump = ctx.accounts.vault.bump;
    let seeds = &[VAULT_SEED, strategist_key.as_ref(), vault_id_bytes.as_ref(), &[vault_bump]];
    let signer = &[&seeds[..]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.output_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        ),
        proceeds,
    )?;
    Ok(())
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    pub strategist: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut, seeds = [VAULT_POSITION_SEED, vault.key().as_ref(), &vault_position.position_id.to_le_bytes()],
        bump = vault_position.bump, constraint = vault_position.vault == vault.key(),
        constraint = vault_position.status != PositionStatus::Closed @ OneVaultError::PositionNotOpen,
        close = strategist)]
    pub vault_position: Box<Account<'info, VaultPosition>>,
    #[account(mut, constraint = vault_token_account.key() == vault.vault_token_account)]
    pub vault_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub output_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

pub fn handle_close_position(ctx: Context<ClosePosition>, proceeds: u64) -> Result<()> {
    let pos_value = ctx.accounts.vault_position.current_value;
    ctx.accounts.vault.position_value = ctx.accounts.vault.position_value.saturating_sub(pos_value);
    ctx.accounts.vault.open_positions_count = ctx.accounts.vault.open_positions_count.saturating_sub(1);
    ctx.accounts.vault.total_assets = ctx.accounts.vault.total_assets.saturating_add(proceeds);

    if proceeds > 0 {
        let vault = &ctx.accounts.vault;
        let strategist = vault.strategist;
        let vault_id_bytes = vault.vault_id.to_le_bytes();
        let vault_bump = vault.bump;
        let seeds = &[VAULT_SEED, strategist.as_ref(), vault_id_bytes.as_ref(), &[vault_bump]];
        let signer = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.output_token_account.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            proceeds,
        )?;
    }

    emit!(crate::events::PositionClosed {
        vault: ctx.accounts.vault.key(),
        position_id: ctx.accounts.vault_position.position_id,
        proceeds,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdatePositionValue<'info> {
    pub strategist: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut, seeds = [VAULT_POSITION_SEED, vault.key().as_ref(), &vault_position.position_id.to_le_bytes()],
        bump = vault_position.bump, constraint = vault_position.vault == vault.key())]
    pub vault_position: Box<Account<'info, VaultPosition>>,
}

pub fn handle_update_position_value(ctx: Context<UpdatePositionValue>, new_value: u64) -> Result<()> {
    let old = ctx.accounts.vault_position.current_value;
    ctx.accounts.vault_position.current_value = new_value;
    if new_value >= old {
        ctx.accounts.vault.position_value = ctx.accounts.vault.position_value.saturating_add(new_value - old);
    } else {
        ctx.accounts.vault.position_value = ctx.accounts.vault.position_value.saturating_sub(old - new_value);
    }
    Ok(())
}

#[derive(Accounts)]
pub struct TriggerTpSlClose<'info> {
    pub strategist: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,

    #[account(mut, seeds = [VAULT_POSITION_SEED, vault.key().as_ref(), &vault_position.position_id.to_le_bytes()],
        bump = vault_position.bump, constraint = vault_position.vault == vault.key(),
        constraint = vault_position.status == PositionStatus::Open @ OneVaultError::PositionNotOpen,
        close = strategist)]
    pub vault_position: Account<'info, VaultPosition>,

    #[account(mut, constraint = vault_token_account.key() == vault.vault_token_account)]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub output_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_trigger_tp_sl_close(
    ctx: Context<TriggerTpSlClose>,
    current_value: u64,
    proceeds: u64,
) -> Result<()> {
    require!(
        evaluate_tp_sl(&ctx.accounts.vault_position, current_value)?.is_some(),
        OneVaultError::TpSlNotTriggered
    );

    let pos_value = ctx.accounts.vault_position.current_value;
    ctx.accounts.vault.position_value = ctx.accounts.vault.position_value.saturating_sub(pos_value);
    ctx.accounts.vault.open_positions_count = ctx.accounts.vault.open_positions_count.saturating_sub(1);
    ctx.accounts.vault.total_assets = ctx.accounts.vault.total_assets.saturating_add(proceeds);

    if proceeds > 0 {
        let vault = &ctx.accounts.vault;
        let strategist = vault.strategist;
        let vault_id_bytes = vault.vault_id.to_le_bytes();
        let vault_bump = vault.bump;
        let seeds = &[VAULT_SEED, strategist.as_ref(), vault_id_bytes.as_ref(), &[vault_bump]];
        let signer = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.output_token_account.to_account_info(),
                    to: ctx.accounts.vault_token_account.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                signer,
            ),
            proceeds,
        )?;
    }

    Ok(())
}
