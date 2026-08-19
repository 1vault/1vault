import { PublicKey } from "@solana/web3.js";

/**
 * 1Vault program ID — keep in sync with:
 * - programs/1vault/src/lib.rs (declare_id!)
 * - Anchor.toml
 * - docs/PROGRAM_ID.md
 */
export const ONEVAULT_PROGRAM_ID = new PublicKey(
  "2seoeTU6KKZckRDom9bsZmFdBi9iZxRXKszgLCzjpWqP"
);

/** PDA seed strings — must match programs/1vault/src/constants.rs */
export const SEEDS = {
  protocol: "protocol",
  strategist: "strategist",
  license: "license",
  vault: "vault",
  investorConfig: "investor_config",
  shareMint: "share_mint",
  licenseVault: "license_vault",
  vaultLicense: "vault_license",
  trade: "trade",
  vaultPosition: "vault_position",
  investorPosition: "investor_position",
  vaultFee: "vault_fee",
  treasury: "treasury",
  feeUnwrap: "fee_unwrap",
  upgradeMultisig: "upgrade_multisig",
  upgradeProposal: "upgrade_proposal",
} as const;

/** Well-known external program IDs (mainnet) */
export const EXTERNAL_PROGRAMS = {
  jupiterV6: new PublicKey("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"),
  raydiumAmmV4: new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"),
  orcaWhirlpool: new PublicKey("whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc"),
  pumpFun: new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
  pumpSwap: new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA"),
  tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
  associatedTokenProgram: new PublicKey(
    "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
  ),
  systemProgram: new PublicKey("11111111111111111111111111111111"),
} as const;

/** Protocol defaults (match on-chain constants.rs) */
export const PROTOCOL_DEFAULTS = {
  performanceFeeBps: 2000,
  licenseLockAmount: 1_000_000,
  bpsDenominator: 10_000,
  sharePriceScale: 1_000_000,
} as const;

export const FEE_WALLETS = {
  platformSol: new PublicKey("9YajdkrkvyzDm57bPSijfy6sFNj9wuqQtYmuYUXZtPDx"),
  degenSol: new PublicKey("EXQCB3PJnza9oBNMupBQjVGSuQXaLvTyXNffCJ5zz286"),
} as const;

/** VaultStatus enum (Anchor account) */
export enum VaultStatus {
  Active = 0,
  Paused = 1,
  Closing = 2,
  Closed = 3,
}

/** TradeVenue for request_trade */
export enum TradeVenue {
  Dex = 0,
  Launchpad = 1,
}

/** TradeAction */
export enum TradeAction {
  Buy = 0,
  Sell = 1,
}
