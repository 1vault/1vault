use anchor_lang::prelude::*;

use crate::state::Vault;

#[derive(Accounts)]
pub struct KeeperRefreshVault<'info> {
    #[account(mut, seeds = [crate::constants::VAULT_SEED, vault.strategist.as_ref(), &vault.vault_id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    #[account(constraint = vault_token_account.key() == vault.vault_token_account)]
    pub vault_token_account: Account<'info, anchor_spl::token::TokenAccount>,
}

pub fn handle_keeper_refresh_vault(ctx: Context<KeeperRefreshVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.total_assets = ctx.accounts.vault_token_account.amount;
    Ok(())
}
