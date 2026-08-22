import { AnchorProvider, BN, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ONEVAULT_PROGRAM_ID, TradeVenue } from "./constants";
import { loadOneVaultIdl } from "./idl";
import * as pdas from "./pda";

export type OneVaultProgram = Program<Idl>;

export type VaultAccountLike = {
  totalAssets: BN | { toString(): string };
  positionValue: BN | { toString(): string };
  totalShares: BN | { toString(): string };
  vaultTokenAccount: PublicKey;
  shareMint: PublicKey;
  strategist: PublicKey;
  vaultId: BN | number;
};

/** Create Anchor Program instance (loads IDL from target/ or sdk/idl/). */
export function createOneVaultProgram(
  connection: Connection,
  wallet: Wallet,
  idl: Idl = loadOneVaultIdl(),
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): OneVaultProgram {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return new Program(idl, provider);
}

export { ONEVAULT_PROGRAM_ID, loadOneVaultIdl, pdas, TradeVenue };

export function investorCapitalBn(
  vault: VaultAccountLike,
  shareAmount: bigint | number | BN
): BN {
  const amount =
    shareAmount instanceof BN ? BigInt(shareAmount.toString()) : BigInt(shareAmount);
  const capital = pdas.investorCapitalFromShares(vault, amount);
  return new BN(capital.toString());
}

export async function fetchProtocolConfig(program: OneVaultProgram) {
  const [protocolConfig] = pdas.protocolConfigPda(program.programId);
  return (program.account as any).protocolConfig.fetch(protocolConfig);
}

export async function fetchVault(
  program: OneVaultProgram,
  strategist: PublicKey,
  vaultId: number
) {
  const [vault] = pdas.vaultPda(strategist, vaultId, program.programId);
  return (program.account as any).vault.fetch(vault);
}

export async function fetchTradeRequest(
  program: OneVaultProgram,
  vault: PublicKey,
  tradeId: number
) {
  const [tradeRequest] = pdas.tradeRequestPda(vault, tradeId, program.programId);
  return (program.account as any).tradeRequest.fetch(tradeRequest);
}

/** Executed buy trade amounts for open_position (post security upgrade). */
export function openPositionAmountsFromTrade(trade: {
  executedInput: BN | { toString(): string };
  executedOutput: BN | { toString(): string };
}): { entryValue: BN; outputAmount: BN } {
  return {
    entryValue: new BN(trade.executedInput.toString()),
    outputAmount: new BN(trade.executedOutput.toString()),
  };
}

export function buildDepositIx(
  program: OneVaultProgram,
  params: {
    investor: PublicKey;
    vault: PublicKey;
    amount: BN;
    investorTokenAccount: PublicKey;
    vaultTokenAccount: PublicKey;
    shareMint: PublicKey;
    investorShareAccount: PublicKey;
  }
) {
  const [protocolConfig] = pdas.protocolConfigPda(program.programId);
  return program.methods
    .deposit(params.amount)
    .accountsPartial({
      investor: params.investor,
      protocolConfig,
      vault: params.vault,
      investorTokenAccount: params.investorTokenAccount,
      vaultTokenAccount: params.vaultTokenAccount,
      shareMint: params.shareMint,
      investorShareAccount: params.investorShareAccount,
    });
}

export function buildWithdrawIx(
  program: OneVaultProgram,
  params: {
    investor: PublicKey;
    vault: PublicKey;
    shares: BN;
    investorShareAccount: PublicKey;
    investorTokenAccount: PublicKey;
    vaultTokenAccount: PublicKey;
    shareMint: PublicKey;
    /** Pass when investor config exists — required to enforce open-position guard. */
    investorConfig?: PublicKey | null;
  }
) {
  const [protocolConfig] = pdas.protocolConfigPda(program.programId);
  const baseAccounts = {
    investor: params.investor,
    protocolConfig,
    vault: params.vault,
    investorShareAccount: params.investorShareAccount,
    investorTokenAccount: params.investorTokenAccount,
    vaultTokenAccount: params.vaultTokenAccount,
    shareMint: params.shareMint,
    tokenProgram: TOKEN_PROGRAM_ID,
  };
  if (params.investorConfig) {
    return program.methods.withdraw(params.shares).accountsPartial({
      ...baseAccounts,
      investorConfig: params.investorConfig,
    });
  }
  return program.methods.withdraw(params.shares).accountsPartial(baseAccounts);
}

export function buildMirrorPositionIx(
  program: OneVaultProgram,
  params: {
    investor: PublicKey;
    vault: PublicKey;
    vaultPositionId: number;
    investorPositionId: number;
    investorShareAccount: PublicKey;
    investorCapital: BN;
    strategistEntryValue: BN;
  }
) {
  const [protocolConfig] = pdas.protocolConfigPda(program.programId);
  const [investorConfig] = pdas.investorConfigPda(
    params.vault,
    params.investor,
    program.programId
  );
  const [vaultPosition] = pdas.vaultPositionPda(
    params.vault,
    params.vaultPositionId,
    program.programId
  );
  return program.methods
    .mirrorPosition(
      new BN(params.investorPositionId),
      params.investorCapital,
      params.strategistEntryValue
    )
    .accountsPartial({
      investor: params.investor,
      protocolConfig,
      vault: params.vault,
      investorConfig,
      vaultPosition,
      investorShareAccount: params.investorShareAccount,
    });
}

export function buildAutoMirrorPositionIx(
  program: OneVaultProgram,
  params: {
    strategist: PublicKey;
    vault: PublicKey;
    investor: PublicKey;
    vaultPositionId: number;
    investorPositionId: number;
    investorShareAccount: PublicKey;
    investorCapital: BN;
    strategistEntryValue: BN;
  }
) {
  const [protocolConfig] = pdas.protocolConfigPda(program.programId);
  const [investorConfig] = pdas.investorConfigPda(
    params.vault,
    params.investor,
    program.programId
  );
  const [vaultPosition] = pdas.vaultPositionPda(
    params.vault,
    params.vaultPositionId,
    program.programId
  );
  return program.methods
    .autoMirrorPosition(
      new BN(params.investorPositionId),
      params.investorCapital,
      params.strategistEntryValue
    )
    .accountsPartial({
      payer: params.strategist,
      protocolConfig,
      vault: params.vault,
      investor: params.investor,
      investorConfig,
      vaultPosition,
      investorShareAccount: params.investorShareAccount,
    });
}

export function buildOpenPositionIx(
  program: OneVaultProgram,
  params: {
    strategist: PublicKey;
    vault: PublicKey;
    tradeId: number;
    positionId: number;
    entryValue: BN;
    outputAmount: BN;
  }
) {
  const [tradeRequest] = pdas.tradeRequestPda(params.vault, params.tradeId, program.programId);
  const [vaultPosition] = pdas.vaultPositionPda(
    params.vault,
    params.positionId,
    program.programId
  );
  return program.methods
    .openPosition(
      new BN(params.positionId),
      params.entryValue,
      params.outputAmount
    )
    .accountsPartial({
      strategist: params.strategist,
      vault: params.vault,
      tradeRequest,
      vaultPosition,
    });
}

export function buildLaunchpadBuyRequestIx(
  program: OneVaultProgram,
  params: {
    strategist: PublicKey;
    vault: PublicKey;
    tradeId: number;
    baseMint: PublicKey;
    memeMint: PublicKey;
    amount: BN;
    minAmountOut: BN;
    maxSlippageBps?: number;
    strategistShareAccount: PublicKey;
    takeProfitBps?: number;
    stopLossBps?: number;
  }
) {
  const [protocolConfig] = pdas.protocolConfigPda(program.programId);
  const [license] = pdas.licensePda(params.strategist, program.programId);
  const [tradeRequest] = pdas.tradeRequestPda(
    params.vault,
    params.tradeId,
    program.programId
  );

  return program.methods
    .requestTrade(
      new BN(params.tradeId),
      { buy: {} },
      params.baseMint,
      params.memeMint,
      { fixed: {} },
      params.amount,
      params.maxSlippageBps ?? 100,
      params.minAmountOut,
      params.takeProfitBps ?? 0,
      params.stopLossBps ?? 0,
      new BN(0),
      { launchpad: {} }
    )
    .accountsPartial({
      strategist: params.strategist,
      protocolConfig,
      vault: params.vault,
      license,
      tradeRequest,
      strategistShareAccount: params.strategistShareAccount,
    });
}

export function onVaultClosingInitiated(
  program: OneVaultProgram,
  handler: (event: {
    vault: PublicKey;
    strategist: PublicKey;
    totalShares: BN;
    nav: BN;
  }) => void
): number {
  return program.addEventListener("vaultClosingInitiated", (e: {
    vault: PublicKey;
    strategist: PublicKey;
    totalShares: BN;
    nav: BN;
  }) => {
    handler(e);
  });
}
