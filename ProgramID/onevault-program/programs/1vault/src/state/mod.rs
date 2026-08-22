use anchor_lang::prelude::*;

pub mod fee;
pub mod investor;
pub mod license;
pub mod multisig;
pub mod position;
pub mod protocol;
pub mod strategist;
pub mod trade;
pub mod vault;

pub use fee::*;
pub use investor::*;
pub use license::*;
pub use multisig::*;
pub use position::*;
pub use protocol::*;
pub use strategist::*;
pub use trade::*;
pub use vault::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum VaultStatus {
    Active,
    Paused,
    Closing,
    Closed,
}

/// V1 pooled book vs V2 per-investor slice exits.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Default)]
pub enum VaultBookMode {
    #[default]
    PooledVault,
    SlicedVault,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AllocationMode {
    Fixed,
    Percentage,
    Proportional,
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TpSlTrigger {
    TakeProfit,
    StopLoss,
}
