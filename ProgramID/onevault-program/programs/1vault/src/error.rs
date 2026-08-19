use anchor_lang::prelude::*;

#[error_code]
pub enum OneVaultError {
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid fee configuration")]
    InvalidFeeConfig,
    #[msg("Strategist already registered")]
    StrategistAlreadyRegistered,
    #[msg("Strategist not registered")]
    StrategistNotRegistered,
    #[msg("License already active")]
    LicenseAlreadyActive,
    #[msg("License not active")]
    LicenseNotActive,
    #[msg("Insufficient platform token balance for license")]
    InsufficientLicenseBalance,
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Vault is closed")]
    VaultClosed,
    #[msg("Vault is closing")]
    VaultClosing,
    #[msg("Vault is not in closing state")]
    VaultNotClosing,
    #[msg("Vault is not closed")]
    VaultNotClosed,
    #[msg("Close vault must include every remaining share holder")]
    VaultHasShares,
    #[msg("Vault still has assets")]
    VaultHasAssets,
    #[msg("Vault still has open positions")]
    VaultHasOpenPositions,
    #[msg("Vault still has pending trades")]
    VaultHasPendingTrades,
    #[msg("Strategist still has active vaults")]
    ActiveVaultsRemain,
    #[msg("Invalid vault name")]
    InvalidVaultName,
    #[msg("Deposit amount must be greater than zero")]
    ZeroDeposit,
    #[msg("Withdraw amount must be greater than zero")]
    ZeroWithdraw,
    #[msg("Insufficient shares")]
    InsufficientShares,
    #[msg("Insufficient vault liquidity")]
    InsufficientLiquidity,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Self-referral is not allowed")]
    SelfReferral,
    #[msg("Referral already registered")]
    ReferralAlreadyRegistered,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Invalid trade request")]
    InvalidTrade,
    #[msg("Trade not pending")]
    TradeNotPending,
    #[msg("Position not open")]
    PositionNotOpen,
    #[msg("Position not found")]
    PositionNotFound,
    #[msg("Max open positions reached")]
    MaxOpenPositions,
    #[msg("Max exposure exceeded")]
    MaxExposureExceeded,
    #[msg("Max position size exceeded")]
    MaxPositionExceeded,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("DEX program not allowed")]
    DexNotAllowed,
    #[msg("Auto follow disabled")]
    AutoFollowDisabled,
    #[msg("Investor risk limit exceeded")]
    InvestorRiskExceeded,
    #[msg("Nothing to claim")]
    NothingToClaim,
    #[msg("Stake lock not expired")]
    StakeLocked,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Swap output below minimum")]
    InsufficientSwapOutput,
    #[msg("Asset mint not accepted by vault")]
    AssetNotAccepted,
    #[msg("Invalid trade mint for action")]
    InvalidTradeMint,
    #[msg("MEV protected route required")]
    MevProtectedRouteRequired,
    #[msg("Standard route required for this vault MEV mode")]
    StandardRouteRequired,
    #[msg("Take profit or stop loss not triggered")]
    TpSlNotTriggered,
    #[msg("Investor max open positions reached")]
    InvestorMaxOpenPositions,
    #[msg("Investor max exposure exceeded")]
    InvestorMaxExposureExceeded,
    #[msg("Risk circuit breaker active")]
    CircuitBreakerActive,
    #[msg("Invalid validator vote account")]
    InvalidValidator,
    #[msg("Vault stake not initialized")]
    VaultStakeNotInitialized,
    #[msg("Stake account mismatch")]
    StakeAccountMismatch,
    #[msg("Insufficient vault SOL balance")]
    InsufficientVaultSol,
    #[msg("Multisig not enabled")]
    MultisigNotEnabled,
    #[msg("Invalid multisig configuration")]
    InvalidMultisigConfig,
    #[msg("Duplicate multisig member")]
    DuplicateMultisigMember,
    #[msg("Not a multisig member")]
    NotMultisigMember,
    #[msg("Invalid multisig account")]
    InvalidMultisig,
    #[msg("Invalid upgrade proposal")]
    InvalidProposal,
    #[msg("Proposal not pending")]
    ProposalNotPending,
    #[msg("Proposal not approved")]
    ProposalNotApproved,
    #[msg("Proposal expired")]
    ProposalExpired,
    #[msg("Member already approved this proposal")]
    AlreadyApproved,
    #[msg("Strategist must park SOL in the vault before trading")]
    StrategistMustPark,
}
