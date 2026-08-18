use anchor_lang::prelude::*;

// PDA seeds (per product spec §29)
pub const PROTOCOL_SEED: &[u8] = b"protocol";
pub const STRATEGIST_SEED: &[u8] = b"strategist";
pub const LICENSE_SEED: &[u8] = b"license";
pub const VAULT_SEED: &[u8] = b"vault";
pub const INVESTOR_CONFIG_SEED: &[u8] = b"investor_config";
pub const SHARE_MINT_SEED: &[u8] = b"share_mint";
pub const LICENSE_VAULT_SEED: &[u8] = b"license_vault";
pub const REFERRAL_SEED: &[u8] = b"referral";
pub const TRADE_SEED: &[u8] = b"trade";
pub const VAULT_POSITION_SEED: &[u8] = b"vault_position";
pub const INVESTOR_POSITION_SEED: &[u8] = b"investor_position";
pub const VAULT_FEE_SEED: &[u8] = b"vault_fee";
pub const VAULT_RISK_SEED: &[u8] = b"vault_risk";
pub const VAULT_STAKE_SEED: &[u8] = b"vault_stake";
pub const VAULT_STAKE_ACCOUNT_SEED: &[u8] = b"vault_stake_account";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const FEE_UNWRAP_SEED: &[u8] = b"fee_unwrap";
pub const STAKING_POOL_SEED: &[u8] = b"staking_pool";
pub const STAKER_SEED: &[u8] = b"staker";
pub const UPGRADE_MULTISIG_SEED: &[u8] = b"upgrade_multisig";
pub const UPGRADE_PROPOSAL_SEED: &[u8] = b"upgrade_proposal";
pub const MAX_MULTISIG_MEMBERS: usize = 7;

// Fee defaults (per product spec)
pub const DEFAULT_WITHDRAWAL_FEE_BPS: u16 = 50;
pub const DEFAULT_REFERRAL_FEE_SHARE_BPS: u16 = 2000;
pub const DEFAULT_PERFORMANCE_FEE_BPS: u16 = 2000;
pub const DEFAULT_PROTOCOL_FEE_BPS: u16 = 500;
pub const DEFAULT_LICENSE_LOCK_AMOUNT: u64 = 1_000_000;
pub const BPS_DENOMINATOR: u64 = 10_000;

pub const MAX_VAULT_NAME_LEN: usize = 64;
pub const MAX_VAULT_DESC_LEN: usize = 128;
pub const MAX_ALLOWED_DEX: usize = 5;
pub const MAX_ACCEPTED_MINTS: usize = 5;
pub const MAX_STAKING_TIERS: usize = 5;

/// Pump.fun bonding curve (pre-graduation buys/sells).
pub const PUMP_FUN_PROGRAM_ID: Pubkey = pubkey!("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
/// PumpSwap AMM (post-graduation from Pump.fun).
pub const PUMP_SWAP_PROGRAM_ID: Pubkey = pubkey!("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");

/// Jupiter v6 aggregator (devnet/mainnet) — used as default allowed DEX reference.
pub const JUPITER_V6_PROGRAM_ID: Pubkey = pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
pub const RAYDIUM_AMM_V4_PROGRAM_ID: Pubkey = pubkey!("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
pub const ORCA_WHIRLPOOL_PROGRAM_ID: Pubkey = pubkey!("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
pub const STAKE_PROGRAM_ID: Pubkey = pubkey!("Stake11111111111111111111111111111111111111");
pub const STAKE_CONFIG_ID: Pubkey = pubkey!("StakeConfig11111111111111111111111111111111");
pub const CLOCK_SYSVAR_ID: Pubkey = pubkey!("SysvarC1ock11111111111111111111111111111111");
pub const STAKE_HISTORY_SYSVAR_ID: Pubkey = pubkey!("SysvarStakeHistory1111111111111111111111111");
pub const STAKE_ACCOUNT_SPACE: usize = 200;
pub const DEFAULT_DAILY_LOSS_LIMIT_BPS: u16 = 500;
pub const DEFAULT_MAX_DRAWDOWN_BPS: u16 = 2_000;
pub const SHARE_PRICE_SCALE: u64 = 1_000_000;

/// Native SOL mint (wSOL). Fees for wSOL vaults are unwrapped to lamports.
pub const WSOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
/// Degen / strategist performance-fee wallet (native SOL).
pub const DEGEN_FEE_WALLET: Pubkey = pubkey!("EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286");

// Staking tier defaults (§45)
pub const DEFAULT_TIER_THRESHOLDS: [u64; MAX_STAKING_TIERS] =
    [0, 100_000, 500_000, 1_000_000, 5_000_000];
pub const DEFAULT_TIER_DISCOUNTS_BPS: [u16; MAX_STAKING_TIERS] = [0, 1000, 2500, 5000, 7500];

/// Default launchpad programs (bonding curve / pre-graduation markets).
pub const DEFAULT_LAUNCHPAD_PROGRAMS: [Pubkey; 2] =
    [PUMP_FUN_PROGRAM_ID, PUMP_SWAP_PROGRAM_ID];
