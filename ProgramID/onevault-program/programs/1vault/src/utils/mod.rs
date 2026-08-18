use anchor_lang::prelude::*;

use crate::constants::BPS_DENOMINATOR;
use crate::state::{
    AllocationMode, DcaMode, PositionMode, TpSlTrigger, TradeAction, Vault, VaultPosition,
};
use crate::OneVaultError;
use anchor_spl::token::{self, CloseAccount, InitializeAccount3, Transfer};

pub fn apply_bps(amount: u64, bps: u16) -> Result<u64> {
    (amount as u128)
        .checked_mul(bps as u128)
        .and_then(|v| v.checked_div(BPS_DENOMINATOR as u128))
        .map(|v| v as u64)
        .ok_or(OneVaultError::MathOverflow.into())
}

pub fn apply_discount_bps(amount: u64, discount_bps: u16) -> Result<u64> {
    let discount = apply_bps(amount, discount_bps)?;
    amount
        .checked_sub(discount)
        .ok_or(OneVaultError::MathOverflow.into())
}

pub fn resolve_trade_amount(vault: &Vault, mode: PositionMode, amount: u64) -> Result<u64> {
    match mode {
        PositionMode::Fixed => Ok(amount),
        PositionMode::Percentage => {
            let nav = vault.nav()?;
            apply_bps(nav, amount as u16)
        }
    }
}

pub fn validate_trade_mints(
    vault: &Vault,
    action: TradeAction,
    input_mint: Pubkey,
    output_mint: Pubkey,
) -> Result<()> {
    require!(input_mint != Pubkey::default(), OneVaultError::InvalidMint);
    require!(output_mint != Pubkey::default(), OneVaultError::InvalidMint);
    require!(input_mint != output_mint, OneVaultError::InvalidTradeMint);

    match action {
        TradeAction::Buy => {
            require!(input_mint == vault.base_mint, OneVaultError::InvalidTradeMint);
            // Any SPL mint may be bought (launchpad pre-bond, new pairs, etc.).
        }
        TradeAction::Sell => {
            require!(output_mint == vault.base_mint, OneVaultError::InvalidTradeMint);
            // Any non-base mint may be sold back to base.
            require!(input_mint != vault.base_mint, OneVaultError::InvalidTradeMint);
        }
    }
    Ok(())
}

pub fn validate_max_position(vault: &Vault, trade_amount: u64) -> Result<()> {
    let nav = vault.nav()?;
    if nav == 0 {
        return Ok(());
    }
    let max_position = apply_bps(nav, vault.max_position_bps)?;
    require!(trade_amount <= max_position, OneVaultError::MaxPositionExceeded);
    Ok(())
}

pub fn calc_investor_allocation(
    mode: AllocationMode,
    position_size: u64,
    investor_capital: u64,
    strategist_amount: u64,
    vault: &Vault,
    dca_mode: DcaMode,
    dca_allocation_bps: u16,
    dca_entries_total: u8,
) -> Result<u64> {
    let base = match mode {
        AllocationMode::Fixed => Ok(position_size.min(investor_capital)),
        AllocationMode::Percentage => apply_bps(investor_capital, position_size as u16),
        AllocationMode::Proportional => {
            let nav = vault.nav()?;
            if nav == 0 {
                return Ok(0);
            }
            (investor_capital as u128)
                .checked_mul(strategist_amount as u128)
                .and_then(|v| v.checked_div(nav as u128))
                .map(|v| v as u64)
                .ok_or(OneVaultError::MathOverflow.into())
        }
    }?;

    if dca_mode == DcaMode::Custom && dca_allocation_bps > 0 && dca_entries_total > 0 {
        let per_entry = apply_bps(base, dca_allocation_bps)?;
        return Ok(per_entry);
    }

    Ok(base)
}

pub fn validate_slippage(expected: u64, actual: u64, max_slippage_bps: u16) -> Result<()> {
    if expected == 0 {
        return Ok(());
    }
    if actual >= expected {
        return Ok(());
    }
    let diff = expected
        .checked_sub(actual)
        .ok_or(OneVaultError::MathOverflow)?;
    let slippage = (diff as u128)
        .checked_mul(BPS_DENOMINATOR as u128)
        .and_then(|v| v.checked_div(expected as u128))
        .ok_or(OneVaultError::MathOverflow)?;
    require!(
        slippage <= max_slippage_bps as u128,
        OneVaultError::SlippageExceeded
    );
    Ok(())
}

pub fn evaluate_tp_sl(position: &VaultPosition, current_value: u64) -> Result<Option<TpSlTrigger>> {
    if position.entry_value == 0 {
        return Ok(None);
    }
    if position.take_profit_bps > 0 && current_value > position.entry_value {
        let gain_bps = ((current_value - position.entry_value) as u128)
            .checked_mul(BPS_DENOMINATOR as u128)
            .and_then(|v| v.checked_div(position.entry_value as u128))
            .ok_or(OneVaultError::MathOverflow)? as u16;
        if gain_bps >= position.take_profit_bps {
            return Ok(Some(TpSlTrigger::TakeProfit));
        }
    }
    if position.stop_loss_bps > 0 && current_value < position.entry_value {
        let loss_bps = ((position.entry_value - current_value) as u128)
            .checked_mul(BPS_DENOMINATOR as u128)
            .and_then(|v| v.checked_div(position.entry_value as u128))
            .ok_or(OneVaultError::MathOverflow)? as u16;
        if loss_bps >= position.stop_loss_bps {
            return Ok(Some(TpSlTrigger::StopLoss));
        }
    }
    Ok(None)
}

pub fn create_wsol_unwrap_account<'info>(
    payer: AccountInfo<'info>,
    unwrap_ata: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    system_program: AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let len = anchor_spl::token::TokenAccount::LEN;
    let lamports = Rent::get()?.minimum_balance(len);
    anchor_lang::solana_program::program::invoke_signed(
        &anchor_lang::solana_program::system_instruction::create_account(
            payer.key,
            unwrap_ata.key,
            lamports,
            len as u64,
            token_program.key,
        ),
        &[payer, unwrap_ata.clone(), system_program],
        signer_seeds,
    )?;
    token::initialize_account3(CpiContext::new(
        *token_program.key,
        InitializeAccount3 {
            account: unwrap_ata,
            mint,
            authority,
        },
    ))?;
    Ok(())
}

/// Move `amount` wSOL from a token account into `destination` as native SOL
/// by transferring into a vault-owned unwrap ATA then closing it.
pub fn unwrap_wsol_to_wallet<'info>(
    token_program: AccountInfo<'info>,
    from: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    unwrap_ata: AccountInfo<'info>,
    destination: AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    token::transfer(
        CpiContext::new_with_signer(
            *token_program.key,
            Transfer {
                from,
                to: unwrap_ata.clone(),
                authority: authority.clone(),
            },
            signer_seeds,
        ),
        amount,
    )?;
    token::close_account(CpiContext::new_with_signer(
        *token_program.key,
        CloseAccount {
            account: unwrap_ata,
            destination,
            authority,
        },
        signer_seeds,
    ))?;
    Ok(())
}

pub fn calc_proportional_value(total_value: u64, reduce_bps: u16) -> Result<u64> {
    apply_bps(total_value, reduce_bps)
}
