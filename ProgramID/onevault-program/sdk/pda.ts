import { PublicKey } from "@solana/web3.js";
import { ONEVAULT_PROGRAM_ID, SEEDS } from "./constants";

export type PdaResult = [PublicKey, number];

function u64LeBytes(value: bigint | number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

export function protocolConfigPda(
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.protocol)],
    programId
  );
}

export function strategistPda(
  strategist: PublicKey,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.strategist), strategist.toBuffer()],
    programId
  );
}

export function licensePda(
  strategist: PublicKey,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.license), strategist.toBuffer()],
    programId
  );
}

export function licenseVaultPda(
  strategist: PublicKey,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.licenseVault), strategist.toBuffer()],
    programId
  );
}

export function vaultPda(
  strategist: PublicKey,
  vaultId: bigint | number,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.vault), strategist.toBuffer(), u64LeBytes(vaultId)],
    programId
  );
}

export function shareMintPda(
  vault: PublicKey,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.shareMint), vault.toBuffer()],
    programId
  );
}

export function vaultFeePda(
  vault: PublicKey,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.vaultFee), vault.toBuffer()],
    programId
  );
}

export function vaultRiskPda(
  vault: PublicKey,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.vaultRisk), vault.toBuffer()],
    programId
  );
}

export function investorConfigPda(
  vault: PublicKey,
  investor: PublicKey,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.investorConfig), vault.toBuffer(), investor.toBuffer()],
    programId
  );
}

export function tradeRequestPda(
  vault: PublicKey,
  tradeId: bigint | number,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.trade), vault.toBuffer(), u64LeBytes(tradeId)],
    programId
  );
}

export function vaultPositionPda(
  vault: PublicKey,
  positionId: bigint | number,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(SEEDS.vaultPosition),
      vault.toBuffer(),
      u64LeBytes(positionId),
    ],
    programId
  );
}

export function investorPositionPda(
  vault: PublicKey,
  investor: PublicKey,
  positionId: bigint | number,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(SEEDS.investorPosition),
      vault.toBuffer(),
      investor.toBuffer(),
      u64LeBytes(positionId),
    ],
    programId
  );
}

export function referralPda(
  user: PublicKey,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.referral), user.toBuffer()],
    programId
  );
}

export function treasuryAuthorityPda(
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.treasury)],
    programId
  );
}

export function treasuryTokenPda(
  mint: PublicKey,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.treasury), mint.toBuffer()],
    programId
  );
}

export function stakingPoolPda(
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.stakingPool)],
    programId
  );
}

export function stakingVaultPda(
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.stakingPool), Buffer.from("vault")],
    programId
  );
}

export function stakerPda(
  owner: PublicKey,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.staker), owner.toBuffer()],
    programId
  );
}

export function upgradeMultisigPda(
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SEEDS.upgradeMultisig)],
    programId
  );
}

export function upgradeProposalPda(
  multisig: PublicKey,
  proposalId: bigint | number,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): PdaResult {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(SEEDS.upgradeProposal),
      multisig.toBuffer(),
      u64LeBytes(proposalId),
    ],
    programId
  );
}

/** NAV helpers (mirror on-chain vault.rs) */
export function calculateNav(vault: {
  totalAssets: bigint | number;
  positionValue: bigint | number;
  stakedValue: bigint | number;
}): bigint {
  return (
    BigInt(vault.totalAssets) +
    BigInt(vault.positionValue) +
    BigInt(vault.stakedValue)
  );
}

export function calculateSharePrice(
  nav: bigint,
  totalShares: bigint,
  sharePriceScale = 1_000_000n
): bigint {
  if (totalShares === 0n) return sharePriceScale;
  return (nav * sharePriceScale) / totalShares;
}

export function depositSharesForAmount(
  depositAmount: bigint,
  totalShares: bigint,
  nav: bigint
): bigint {
  if (totalShares === 0n) return depositAmount;
  return (depositAmount * totalShares) / nav;
}

export function withdrawGrossAmount(
  shares: bigint,
  totalShares: bigint,
  nav: bigint
): bigint {
  return (shares * nav) / totalShares;
}
