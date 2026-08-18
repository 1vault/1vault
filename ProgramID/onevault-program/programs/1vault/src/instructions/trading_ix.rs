use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::constants::*;
use crate::error::OneVaultError;
use crate::state::{
    License, PositionMode, PositionStatus, ProtocolConfig, TradeAction, TradeRequest, TradeStatus,
    TradeVenue, Vault, VaultPosition, VaultRiskState,
};
use crate::instructions::risk_ix::assert_vault_risk_allows_trade;
use crate::utils::{resolve_trade_amount, validate_max_position, validate_slippage, validate_trade_mints};

#[derive(Accounts)]
#[instruction(trade_id: u64)]
pub struct RequestTrade<'info> {
    #[account(mut)]
    pub strategist: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = vault.is_operational() @ OneVaultError::VaultPaused)]
    pub vault: Account<'info, Vault>,

    #[account(seeds = [LICENSE_SEED, strategist.key().as_ref()], bump = license.bump,
        constraint = license.is_active @ OneVaultError::LicenseNotActive,
        constraint = license.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub license: Account<'info, License>,

    #[account(seeds = [VAULT_RISK_SEED, vault.key().as_ref()], bump = vault_risk_state.bump,
        constraint = vault_risk_state.vault == vault.key())]
    pub vault_risk_state: Account<'info, VaultRiskState>,

    #[account(init, payer = strategist, space = 8 + TradeRequest::INIT_SPACE,
        seeds = [TRADE_SEED, vault.key().as_ref(), &trade_id.to_le_bytes()], bump)]
    pub trade_request: Account<'info, TradeRequest>,

    pub system_program: Program<'info, System>,
}

pub fn handle_request_trade(
    ctx: Context<RequestTrade>,
    trade_id: u64,
    action: TradeAction,
    input_mint: Pubkey,
    output_mint: Pubkey,
    position_mode: PositionMode,
    amount: u64,
    max_slippage_bps: u16,
    min_amount_out: u64,
    dca_enabled: bool,
    dca_index: u8,
    take_profit_bps: u16,
    stop_loss_bps: u16,
    linked_position_id: u64,
    trade_venue: TradeVenue,
) -> Result<()> {
    require!(amount > 0, OneVaultError::InvalidAmount);
    let vault = &ctx.accounts.vault;
    require!(trade_id == vault.next_trade_id, OneVaultError::InvalidTrade);
    assert_vault_risk_allows_trade(&ctx.accounts.vault_risk_state)?;

    if trade_venue == TradeVenue::Launchpad {
        require!(
            vault.mev_mode == crate::state::MevMode::Standard,
            OneVaultError::MevProtectedRouteRequired
        );
    }

    validate_trade_mints(vault, action, input_mint, output_mint)?;

    let trade_amount = resolve_trade_amount(vault, position_mode, amount)?;
    require!(trade_amount > 0, OneVaultError::InvalidAmount);
    validate_max_position(vault, trade_amount)?;

    if linked_position_id == 0 && action == TradeAction::Buy {
        require!(
            vault.open_positions_count < vault.max_open_positions,
            OneVaultError::MaxOpenPositions
        );
    }

    let slippage = if max_slippage_bps == 0 {
        vault.max_slippage_bps
    } else {
        max_slippage_bps.min(vault.max_slippage_bps)
    };

    let trade = &mut ctx.accounts.trade_request;
    trade.vault = vault.key();
    trade.strategist = ctx.accounts.strategist.key();
    trade.trade_id = trade_id;
    trade.action = action;
    trade.trade_venue = trade_venue;
    trade.input_mint = input_mint;
    trade.output_mint = output_mint;
    trade.position_mode = position_mode;
    trade.amount = trade_amount;
    trade.max_slippage_bps = slippage;
    trade.min_amount_out = min_amount_out;
    trade.dca_enabled = dca_enabled;
    trade.dca_index = dca_index;
    trade.take_profit_bps = take_profit_bps;
    trade.stop_loss_bps = stop_loss_bps;
    trade.linked_position_id = linked_position_id;
    trade.status = TradeStatus::Pending;
    trade.created_at = Clock::get()?.unix_timestamp;
    trade.bump = ctx.bumps.trade_request;

    let vault = &mut ctx.accounts.vault;
    vault.pending_trades_count = vault.pending_trades_count.saturating_add(1);
    vault.next_trade_id = vault.next_trade_id.saturating_add(1);

    emit!(crate::events::TradeRequested {
        vault: vault.key(),
        strategist: ctx.accounts.strategist.key(),
        trade_id,
        action: action as u8,
        input_mint,
        output_mint,
        amount: trade_amount,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct CancelTrade<'info> {
    pub strategist: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized)]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [TRADE_SEED, vault.key().as_ref(), &trade_request.trade_id.to_le_bytes()],
        bump = trade_request.bump, constraint = trade_request.vault == vault.key(),
        constraint = trade_request.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = trade_request.status == TradeStatus::Pending @ OneVaultError::TradeNotPending,
        close = strategist)]
    pub trade_request: Account<'info, TradeRequest>,
}

pub fn handle_cancel_trade(ctx: Context<CancelTrade>) -> Result<()> {
    ctx.accounts.vault.pending_trades_count = ctx.accounts.vault.pending_trades_count.saturating_sub(1);
    Ok(())
}

#[derive(Accounts)]
pub struct ExecuteTrade<'info> {
    #[account(mut)]
    pub strategist: Signer<'info>,

    #[account(seeds = [PROTOCOL_SEED], bump = protocol_config.bump,
        constraint = !protocol_config.is_paused @ OneVaultError::ProtocolPaused)]
    pub protocol_config: Account<'info, ProtocolConfig>,

    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = vault.is_operational() @ OneVaultError::VaultPaused)]
    pub vault: Account<'info, Vault>,

    #[account(seeds = [LICENSE_SEED, strategist.key().as_ref()], bump = license.bump,
        constraint = license.is_active @ OneVaultError::LicenseNotActive)]
    pub license: Account<'info, License>,

    #[account(mut, seeds = [TRADE_SEED, vault.key().as_ref(), &trade_request.trade_id.to_le_bytes()],
        bump = trade_request.bump, constraint = trade_request.vault == vault.key(),
        constraint = trade_request.status == TradeStatus::Pending @ OneVaultError::TradeNotPending)]
    pub trade_request: Account<'info, TradeRequest>,

    /// CHECK: validated against protocol allowlist
    pub dex_program: UncheckedAccount<'info>,

    #[account(mut,
        constraint = vault_input_token.mint == trade_request.input_mint,
        constraint = vault_input_token.owner == vault.key() @ OneVaultError::Unauthorized)]
    pub vault_input_token: Account<'info, TokenAccount>,

    #[account(mut,
        constraint = vault_output_token.mint == trade_request.output_mint,
        constraint = vault_output_token.owner == vault.key() @ OneVaultError::Unauthorized)]
    pub vault_output_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_execute_trade(ctx: Context<ExecuteTrade>, swap_data: Vec<u8>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let dex = ctx.accounts.dex_program.key();
    let trade = &ctx.accounts.trade_request;

    require!(
        ctx.accounts
            .protocol_config
            .is_trade_program_allowed(&dex, vault.mev_mode, trade.trade_venue),
        OneVaultError::DexNotAllowed
    );

    if trade.trade_venue == TradeVenue::Dex {
        match vault.mev_mode {
            crate::state::MevMode::Protected => {
                require!(
                    ctx.accounts.protocol_config.is_protected_dex(&dex),
                    OneVaultError::MevProtectedRouteRequired
                );
            }
            crate::state::MevMode::Standard => {
                require!(
                    ctx.accounts.protocol_config.is_dex_allowed(&dex),
                    OneVaultError::StandardRouteRequired
                );
            }
        }
    }

    let output_before = ctx.accounts.vault_output_token.amount;
    let input_before = ctx.accounts.vault_input_token.amount;

    if !swap_data.is_empty() && !ctx.remaining_accounts.is_empty() {
        let _vault_key = ctx.accounts.vault.key();
        let strategist_key = ctx.accounts.vault.strategist;
        let vault_id_bytes = ctx.accounts.vault.vault_id.to_le_bytes();
        let vault_bump = ctx.accounts.vault.bump;
        let seeds = &[VAULT_SEED, strategist_key.as_ref(), vault_id_bytes.as_ref(), &[vault_bump]];
        let signer = &[&seeds[..]];

        let mut metas = Vec::with_capacity(ctx.remaining_accounts.len());
        for acc in ctx.remaining_accounts.iter() {
            metas.push(if acc.is_writable {
                AccountMeta::new(*acc.key, acc.is_signer)
            } else {
                AccountMeta::new_readonly(*acc.key, acc.is_signer)
            });
        }

        let ix = anchor_lang::solana_program::instruction::Instruction {
            program_id: ctx.accounts.dex_program.key(),
            accounts: metas,
            data: swap_data,
        };

        invoke_signed(
            &ix,
            ctx.remaining_accounts,
            signer,
        )?;
    }

    ctx.accounts.vault_output_token.reload()?;
    ctx.accounts.vault_input_token.reload()?;
    let received = ctx.accounts.vault_output_token.amount.saturating_sub(output_before);
    require!(received >= trade.min_amount_out, OneVaultError::InsufficientSwapOutput);
    validate_slippage(trade.min_amount_out, received, trade.max_slippage_bps)?;

    let vault = &mut ctx.accounts.vault;
    vault.pending_trades_count = vault.pending_trades_count.saturating_sub(1);

    match trade.action {
        TradeAction::Buy => {
            vault.total_assets = ctx.accounts.vault_input_token.amount;
            vault.position_value = vault.position_value.saturating_add(received);
        }
        TradeAction::Sell => {
            vault.total_assets = ctx.accounts.vault_output_token.amount;
            let sold_value = input_before.saturating_sub(ctx.accounts.vault_input_token.amount);
            vault.position_value = vault.position_value.saturating_sub(sold_value.min(vault.position_value));
        }
    }

    let exposure = vault.current_exposure_bps()?;
    require!(exposure <= vault.max_exposure_bps, OneVaultError::MaxExposureExceeded);

    let trade_id = trade.trade_id;
    let received_amount = received;
    ctx.accounts.trade_request.status = TradeStatus::Executed;

    emit!(crate::events::TradeExecuted {
        vault: ctx.accounts.vault.key(),
        trade_id,
        received: received_amount,
        dex_program: dex,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(position_id: u64)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub strategist: Signer<'info>,

    #[account(mut, seeds = [VAULT_SEED, strategist.key().as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump,
        constraint = vault.strategist == strategist.key() @ OneVaultError::Unauthorized,
        constraint = vault.is_operational() @ OneVaultError::VaultPaused)]
    pub vault: Account<'info, Vault>,

    #[account(seeds = [TRADE_SEED, vault.key().as_ref(), &trade_request.trade_id.to_le_bytes()],
        bump = trade_request.bump, constraint = trade_request.vault == vault.key(),
        constraint = trade_request.status == TradeStatus::Executed @ OneVaultError::InvalidTrade)]
    pub trade_request: Account<'info, TradeRequest>,

    #[account(init, payer = strategist, space = 8 + VaultPosition::INIT_SPACE,
        seeds = [VAULT_POSITION_SEED, vault.key().as_ref(), &position_id.to_le_bytes()], bump)]
    pub vault_position: Account<'info, VaultPosition>,

    pub system_program: Program<'info, System>,
}

pub fn handle_open_position(ctx: Context<OpenPosition>, position_id: u64, entry_value: u64, output_amount: u64) -> Result<()> {
    let vault = &ctx.accounts.vault;
    require!(position_id == vault.next_position_id, OneVaultError::InvalidTrade);
    require!(
        vault.open_positions_count < vault.max_open_positions,
        OneVaultError::MaxOpenPositions
    );

    let trade = &ctx.accounts.trade_request;
    let position = &mut ctx.accounts.vault_position;
    position.vault = vault.key();
    position.position_id = position_id;
    position.input_mint = trade.input_mint;
    position.output_mint = trade.output_mint;
    position.entry_value = entry_value;
    position.current_value = entry_value;
    position.output_amount = output_amount;
    position.take_profit_bps = trade.take_profit_bps;
    position.stop_loss_bps = trade.stop_loss_bps;
    position.dca_entries_completed = if trade.dca_enabled { trade.dca_index.saturating_add(1) } else { 1 };
    position.dca_entries_total = if trade.dca_enabled { ctx.accounts.vault.dca_count.max(1) } else { 1 };
    position.status = PositionStatus::Open;
    position.opened_at = Clock::get()?.unix_timestamp;
    position.bump = ctx.bumps.vault_position;

    let vault = &mut ctx.accounts.vault;
    vault.open_positions_count = vault.open_positions_count.saturating_add(1);
    vault.next_position_id = vault.next_position_id.saturating_add(1);

    emit!(crate::events::PositionOpened {
        vault: vault.key(),
        position_id,
        input_mint: trade.input_mint,
        output_mint: trade.output_mint,
        entry_value,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct EnsureVaultTokenAta<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        seeds = [VAULT_SEED, vault.strategist.as_ref(), &vault.vault_id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_ensure_vault_token_ata(_ctx: Context<EnsureVaultTokenAta>) -> Result<()> {
    Ok(())
}
