pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use error::*;
pub use instructions::*;
pub use state::*;

declare_id!("2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP");

#[program]
pub mod onevault {
    use super::*;

    // ── Protocol ──
    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        treasury: Pubkey,
        platform_token_mint: Pubkey,
        license_lock_amount: u64,
        performance_fee_bps: u16,
        allowed_dex_programs: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::protocol_ix::handle_initialize_protocol(
            ctx,
            treasury,
            platform_token_mint,
            license_lock_amount,
            performance_fee_bps,
            allowed_dex_programs,
        )
    }

    pub fn update_protocol_config(
        ctx: Context<UpdateProtocolConfig>,
        treasury: Option<Pubkey>,
        license_lock_amount: Option<u64>,
        performance_fee_bps: Option<u16>,
    ) -> Result<()> {
        instructions::protocol_ix::handle_update_protocol_config(
            ctx,
            treasury,
            license_lock_amount,
            performance_fee_bps,
        )
    }

    pub fn pause_protocol(ctx: Context<PauseProtocol>, paused: bool) -> Result<()> {
        instructions::protocol_ix::handle_pause_protocol(ctx, paused)
    }

    pub fn close_legacy_protocol_config(
        ctx: Context<CloseLegacyProtocolConfig>,
    ) -> Result<()> {
        instructions::protocol_ix::handle_close_legacy_protocol_config(ctx)
    }

    pub fn update_allowed_dex(
        ctx: Context<UpdateAllowedDex>,
        allowed_dex_programs: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::protocol_ix::handle_update_allowed_dex(ctx, allowed_dex_programs)
    }

    pub fn update_allowed_launchpads(
        ctx: Context<UpdateAllowedLaunchpads>,
        launchpad_programs: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::protocol_ix::handle_update_allowed_launchpads(ctx, launchpad_programs)
    }

    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        instructions::protocol_ix::handle_initialize_treasury(ctx)
    }

    pub fn sweep_treasury_sol(ctx: Context<SweepTreasurySol>) -> Result<()> {
        instructions::protocol_ix::handle_sweep_treasury_sol(ctx)
    }

    // ── Upgrade Multisig ──
    pub fn initialize_upgrade_multisig(
        ctx: Context<InitializeUpgradeMultisig>,
        members: Vec<Pubkey>,
        threshold: u8,
        squads_multisig: Pubkey,
    ) -> Result<()> {
        instructions::multisig_ix::handle_initialize_upgrade_multisig(
            ctx,
            members,
            threshold,
            squads_multisig,
        )
    }

    pub fn update_upgrade_multisig(
        ctx: Context<UpdateUpgradeMultisig>,
        members: Vec<Pubkey>,
        threshold: u8,
        squads_multisig: Option<Pubkey>,
    ) -> Result<()> {
        instructions::multisig_ix::handle_update_upgrade_multisig(
            ctx,
            members,
            threshold,
            squads_multisig,
        )
    }

    pub fn create_upgrade_proposal(
        ctx: Context<CreateUpgradeProposal>,
        proposal_id: u64,
        program_buffer: Pubkey,
        version_label: String,
        expires_in_secs: i64,
    ) -> Result<()> {
        instructions::multisig_ix::handle_create_upgrade_proposal(
            ctx,
            proposal_id,
            program_buffer,
            version_label,
            expires_in_secs,
        )
    }

    pub fn approve_upgrade_proposal(ctx: Context<ApproveUpgradeProposal>) -> Result<()> {
        instructions::multisig_ix::handle_approve_upgrade_proposal(ctx)
    }

    pub fn cancel_upgrade_proposal(ctx: Context<CancelUpgradeProposal>) -> Result<()> {
        instructions::multisig_ix::handle_cancel_upgrade_proposal(ctx)
    }

    pub fn mark_upgrade_executed(ctx: Context<MarkUpgradeExecuted>) -> Result<()> {
        instructions::multisig_ix::handle_mark_upgrade_executed(ctx)
    }

    // ── Strategist ──
    pub fn register_strategist(ctx: Context<RegisterStrategist>) -> Result<()> {
        instructions::strategist_ix::handle_register_strategist(ctx)
    }

    pub fn lock_license(ctx: Context<LockLicense>) -> Result<()> {
        instructions::strategist_ix::handle_lock_license(ctx)
    }

    pub fn unlock_license(ctx: Context<UnlockLicense>) -> Result<()> {
        instructions::strategist_ix::handle_unlock_license(ctx)
    }

    // ── Vault ──
    pub fn create_vault(
        ctx: Context<CreateVault>,
        vault_id: u64,
        name: String,
        performance_fee_bps: u16,
        risk: VaultRiskParams,
    ) -> Result<()> {
        instructions::vault_ix::handle_create_vault(ctx, vault_id, name, performance_fee_bps, risk)
    }

    pub fn update_vault(
        ctx: Context<UpdateVault>,
        name: Option<String>,
        performance_fee_bps: Option<u16>,
        risk: Option<VaultRiskParams>,
    ) -> Result<()> {
        instructions::vault_ix::handle_update_vault(ctx, name, performance_fee_bps, risk)
    }

    pub fn pause_vault(ctx: Context<PauseVault>) -> Result<()> {
        instructions::vault_ix::handle_pause_vault(ctx)
    }

    pub fn resume_vault(ctx: Context<ResumeVault>) -> Result<()> {
        instructions::vault_ix::handle_resume_vault(ctx)
    }

    pub fn initiate_vault_close(ctx: Context<InitiateVaultClose>) -> Result<()> {
        instructions::vault_ix::handle_initiate_vault_close(ctx)
    }

    pub fn close_vault<'a>(ctx: Context<'a, CloseVault<'a>>) -> Result<()> {
        instructions::vault_ix::handle_close_vault(ctx)
    }

    pub fn update_nav(ctx: Context<UpdateNav>) -> Result<()> {
        instructions::vault_ix::handle_update_nav(ctx)
    }

    // ── Investor ──
    pub fn create_investor_config(ctx: Context<CreateInvestorConfig>) -> Result<()> {
        instructions::investor_ix::handle_create_investor_config(ctx)
    }

    pub fn update_investor_config(
        ctx: Context<UpdateInvestorConfig>,
        params: InvestorConfigParams,
    ) -> Result<()> {
        instructions::investor_ix::handle_update_investor_config(ctx, params)
    }

    pub fn follow_on(ctx: Context<FollowOn>) -> Result<()> {
        instructions::investor_ix::handle_follow_on(ctx)
    }

    pub fn follow_off(ctx: Context<FollowOff>) -> Result<()> {
        instructions::investor_ix::handle_follow_off(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::investor_ix::handle_deposit(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        instructions::investor_ix::handle_withdraw(ctx, shares)
    }

    // ── Trading ──
    pub fn request_trade(
        ctx: Context<RequestTrade>,
        trade_id: u64,
        action: TradeAction,
        input_mint: Pubkey,
        output_mint: Pubkey,
        position_mode: PositionMode,
        amount: u64,
        max_slippage_bps: u16,
        min_amount_out: u64,
        take_profit_bps: u16,
        stop_loss_bps: u16,
        linked_position_id: u64,
        trade_venue: TradeVenue,
    ) -> Result<()> {
        instructions::trading_ix::handle_request_trade(
            ctx,
            trade_id,
            action,
            input_mint,
            output_mint,
            position_mode,
            amount,
            max_slippage_bps,
            min_amount_out,
            take_profit_bps,
            stop_loss_bps,
            linked_position_id,
            trade_venue,
        )
    }

    pub fn cancel_trade(ctx: Context<CancelTrade>) -> Result<()> {
        instructions::trading_ix::handle_cancel_trade(ctx)
    }

    pub fn execute_trade(ctx: Context<ExecuteTrade>, swap_data: Vec<u8>) -> Result<()> {
        instructions::trading_ix::handle_execute_trade(ctx, swap_data)
    }

    pub fn ensure_vault_token_ata(ctx: Context<EnsureVaultTokenAta>) -> Result<()> {
        instructions::trading_ix::handle_ensure_vault_token_ata(ctx)
    }

    pub fn open_position(
        ctx: Context<OpenPosition>,
        position_id: u64,
        entry_value: u64,
        output_amount: u64,
    ) -> Result<()> {
        instructions::trading_ix::handle_open_position(ctx, position_id, entry_value, output_amount)
    }

    // ── Position ──
    pub fn increase_position(
        ctx: Context<IncreasePosition>,
        added_value: u64,
        added_output: u64,
    ) -> Result<()> {
        instructions::position_ix::handle_increase_position(ctx, added_value, added_output)
    }

    pub fn reduce_position(
        ctx: Context<ReducePosition>,
        reduce_bps: u16,
        proceeds: u64,
    ) -> Result<()> {
        instructions::position_ix::handle_reduce_position(ctx, reduce_bps, proceeds)
    }

    pub fn close_position<'info>(ctx: Context<'info, ClosePosition<'info>>, proceeds: u64) -> Result<()> {
        instructions::position_ix::handle_close_position(ctx, proceeds)
    }

    pub fn update_position_value(
        ctx: Context<UpdatePositionValue>,
        new_value: u64,
    ) -> Result<()> {
        instructions::position_ix::handle_update_position_value(ctx, new_value)
    }

    pub fn trigger_tp_sl_close<'info>(
        ctx: Context<'info, TriggerTpSlClose<'info>>,
        current_value: u64,
        proceeds: u64,
    ) -> Result<()> {
        instructions::position_ix::handle_trigger_tp_sl_close(ctx, current_value, proceeds)
    }

    // ── Follow / Copy ──
    pub fn mirror_position(
        ctx: Context<MirrorPosition>,
        position_id: u64,
        investor_capital: u64,
        strategist_entry_value: u64,
    ) -> Result<()> {
        instructions::follow_ix::handle_mirror_position(
            ctx,
            position_id,
            investor_capital,
            strategist_entry_value,
        )
    }

    pub fn auto_mirror_position(
        ctx: Context<AutoMirrorPosition>,
        position_id: u64,
        investor_capital: u64,
        strategist_entry_value: u64,
    ) -> Result<()> {
        instructions::follow_ix::handle_auto_mirror_position(
            ctx,
            position_id,
            investor_capital,
            strategist_entry_value,
        )
    }

    pub fn close_investor_position(
        ctx: Context<CloseInvestorPosition>,
        is_full_exit: bool,
    ) -> Result<()> {
        instructions::follow_ix::handle_close_investor_position(ctx, is_full_exit)
    }

    pub fn sync_investor_position_reduce(
        ctx: Context<SyncInvestorPositionReduce>,
        reduce_bps: u16,
    ) -> Result<()> {
        instructions::follow_ix::handle_sync_investor_position_reduce(ctx, reduce_bps)
    }

    pub fn sync_investor_position_close(ctx: Context<SyncInvestorPositionClose>) -> Result<()> {
        instructions::follow_ix::handle_sync_investor_position_close(ctx)
    }

    pub fn sync_investor_tp_sl(ctx: Context<SyncInvestorTpSl>) -> Result<()> {
        instructions::follow_ix::handle_sync_investor_tp_sl(ctx)
    }

    // ── Accounting ──
    pub fn accrue_fees(ctx: Context<AccrueFees>) -> Result<()> {
        instructions::accounting_ix::handle_accrue_fees(ctx)
    }

    pub fn claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
        instructions::accounting_ix::handle_claim_fees(ctx)
    }

    // ── Keepers ──
    pub fn keeper_refresh_vault(ctx: Context<KeeperRefreshVault>) -> Result<()> {
        instructions::keeper_ix::handle_keeper_refresh_vault(ctx)
    }
}
