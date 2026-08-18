use anchor_lang::prelude::*;

#[event]
pub struct ProtocolInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub platform_token_mint: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultCreated {
    pub vault: Pubkey,
    pub strategist: Pubkey,
    pub vault_id: u64,
    pub base_mint: Pubkey,
    pub performance_fee_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct VaultClosingInitiated {
    pub vault: Pubkey,
    pub strategist: Pubkey,
    pub total_shares: u64,
    pub nav: u64,
    pub timestamp: i64,
}

#[event]
pub struct VaultClosed {
    pub vault: Pubkey,
    pub strategist: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct InvestorDeposit {
    pub vault: Pubkey,
    pub investor: Pubkey,
    pub amount: u64,
    pub shares_minted: u64,
    pub nav: u64,
    pub timestamp: i64,
}

#[event]
pub struct InvestorWithdraw {
    pub vault: Pubkey,
    pub investor: Pubkey,
    pub shares_burned: u64,
    pub gross_amount: u64,
    pub net_amount: u64,
    pub fee_amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct TradeRequested {
    pub vault: Pubkey,
    pub strategist: Pubkey,
    pub trade_id: u64,
    pub action: u8,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct TradeExecuted {
    pub vault: Pubkey,
    pub trade_id: u64,
    pub received: u64,
    pub dex_program: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct PositionOpened {
    pub vault: Pubkey,
    pub position_id: u64,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub entry_value: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionUpdated {
    pub vault: Pubkey,
    pub position_id: u64,
    pub old_value: u64,
    pub new_value: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionClosed {
    pub vault: Pubkey,
    pub position_id: u64,
    pub proceeds: u64,
    pub timestamp: i64,
}

#[event]
pub struct TpSlTriggered {
    pub vault: Pubkey,
    pub position_id: u64,
    pub trigger: u8,
    pub current_value: u64,
    pub timestamp: i64,
}

#[event]
pub struct FeeAccrued {
    pub vault: Pubkey,
    pub performance_fee: u64,
    pub protocol_fee: u64,
    pub share_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct ReferralRewardAccrued {
    pub user: Pubkey,
    pub referrer: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct InvestorMirrored {
    pub vault: Pubkey,
    pub investor: Pubkey,
    pub position_id: u64,
    pub allocation: u64,
    pub auto_by_keeper: bool,
    pub timestamp: i64,
}

#[event]
pub struct PlatformStaked {
    pub owner: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
    pub tier: u8,
    pub timestamp: i64,
}

#[event]
pub struct PlatformUnstaked {
    pub owner: Pubkey,
    pub amount: u64,
    pub timestamp: i64,
}

#[event]
pub struct VaultSolStaked {
    pub vault: Pubkey,
    pub lamports: u64,
    pub validator: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct VaultSolUnstaked {
    pub vault: Pubkey,
    pub lamports: u64,
    pub timestamp: i64,
}

#[event]
pub struct RiskCircuitBreakerTripped {
    pub vault: Pubkey,
    pub reason: u8,
    pub drawdown_bps: u16,
    pub timestamp: i64,
}

#[event]
pub struct UpgradeProposalCreated {
    pub multisig: Pubkey,
    pub proposal_id: u64,
    pub proposer: Pubkey,
    pub program_buffer: Pubkey,
    pub version_label: String,
    pub expires_at: i64,
    pub timestamp: i64,
}

#[event]
pub struct UpgradeProposalApproved {
    pub multisig: Pubkey,
    pub proposal_id: u64,
    pub member: Pubkey,
    pub approval_count: u8,
    pub threshold: u8,
    pub timestamp: i64,
}

#[event]
pub struct UpgradeProposalReady {
    pub multisig: Pubkey,
    pub proposal_id: u64,
    pub program_buffer: Pubkey,
    pub version_label: String,
    pub timestamp: i64,
}

#[event]
pub struct UpgradeProposalCancelled {
    pub multisig: Pubkey,
    pub proposal_id: u64,
    pub cancelled_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct UpgradeProposalExecuted {
    pub multisig: Pubkey,
    pub proposal_id: u64,
    pub program_buffer: Pubkey,
    pub version_label: String,
    pub timestamp: i64,
}
