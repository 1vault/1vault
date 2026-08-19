use anchor_lang::prelude::*;

// PDA seeds
pub const PROTOCOL_SEED: &[u8] = b"protocol";
pub const STRATEGIST_SEED: &[u8] = b"strategist";
pub const LICENSE_SEED: &[u8] = b"license";
pub const LICENSE_VAULT_SEED: &[u8] = b"license_vault";
pub const VAULT_SEED: &[u8] = b"vault";
pub const INVESTOR_CONFIG_SEED: &[u8] = b"investor_config";
pub const SHARE_MINT_SEED: &[u8] = b"share_mint";
pub const VAULT_LICENSE_SEED: &[u8] = b"vault_license";
pub const TRADE_SEED: &[u8] = b"trade";
pub const VAULT_POSITION_SEED: &[u8] = b"vault_position";
pub const INVESTOR_POSITION_SEED: &[u8] = b"investor_position";
pub const VAULT_FEE_SEED: &[u8] = b"vault_fee";
pub const TREASURY_SEED: &[u8] = b"treasury";
pub const FEE_UNWRAP_SEED: &[u8] = b"fee_unwrap";
pub const UPGRADE_MULTISIG_SEED: &[u8] = b"upgrade_multisig";
pub const UPGRADE_PROPOSAL_SEED: &[u8] = b"upgrade_proposal";
pub const MAX_MULTISIG_MEMBERS: usize = 7;

pub const DEFAULT_PERFORMANCE_FEE_BPS: u16 = 2000;
/// 1,000,000 whole 1VAULT tokens (6 decimals).
pub const DEFAULT_LICENSE_LOCK_AMOUNT: u64 = 1_000_000_000_000;
pub const BPS_DENOMINATOR: u64 = 10_000;

pub const MAX_VAULT_NAME_LEN: usize = 64;
pub const MAX_VAULT_DESC_LEN: usize = 128;
pub const MAX_CLOSE_SHARE_HOLDERS: usize = 16;
pub const MAX_ALLOWED_DEX: usize = 5;
pub const MAX_ACCEPTED_MINTS: usize = 5;

pub const PUMP_FUN_PROGRAM_ID: Pubkey = pubkey!("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
pub const PUMP_SWAP_PROGRAM_ID: Pubkey = pubkey!("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
pub const JUPITER_V6_PROGRAM_ID: Pubkey = pubkey!("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4");
pub const RAYDIUM_AMM_V4_PROGRAM_ID: Pubkey = pubkey!("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");
pub const ORCA_WHIRLPOOL_PROGRAM_ID: Pubkey = pubkey!("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc");
pub const SHARE_PRICE_SCALE: u64 = 1_000_000;

pub const WSOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
pub const DEGEN_FEE_WALLET: Pubkey = pubkey!("EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286");

pub const DEFAULT_LAUNCHPAD_PROGRAMS: [Pubkey; 2] =
    [PUMP_FUN_PROGRAM_ID, PUMP_SWAP_PROGRAM_ID];
