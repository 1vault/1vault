use anchor_lang::prelude::*;

pub mod fee;
pub mod investor;
pub mod license;
pub mod multisig;
pub mod position;
pub mod protocol;
pub mod referral;
pub mod risk;
pub mod staking;
pub mod strategist;
pub mod trade;
pub mod vault;
pub mod vault_stake;

pub use fee::*;
pub use investor::*;
pub use license::*;
pub use multisig::*;
pub use position::*;
pub use protocol::*;
pub use referral::*;
pub use risk::*;
pub use staking::*;
pub use strategist::*;
pub use trade::*;
pub use vault::*;
pub use vault_stake::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum VaultStatus {
    Active,
    Paused,
    /// Strategist initiated closure; retail may withdraw, no new deposits or trades.
    Closing,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AllocationMode {
    Fixed,
    Percentage,
    Proportional,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum StrategyType {
    Momentum,
    Dca,
    Arbitrage,
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MevMode {
    Standard,
    Protected,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PositionMode {
    Fixed,
    Percentage,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TradeAction {
    Buy,
    Sell,
}

/// Where the swap executes — DEX aggregator/AMM vs launchpad bonding curve.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum TradeVenue {
    #[default]
    Dex,
    Launchpad,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TradeStatus {
    Pending,
    Executed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PositionStatus {
    Open,
    Reduced,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum DcaMode {
    #[default]
    FollowStrategist,
    Custom,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TpSlTrigger {
    TakeProfit,
    StopLoss,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum YieldStrategy {
    #[default]
    None,
    NativeSolStake,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CircuitBreakerReason {
    DailyLossLimit,
    MaxDrawdown,
    Manual,
}
