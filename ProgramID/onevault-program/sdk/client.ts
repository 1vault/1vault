import { AnchorProvider, BN, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { ONEVAULT_PROGRAM_ID, TradeVenue } from "./constants";
import * as pdas from "./pda";

/** Create Anchor Program instance. Pass IDL from `target/idl/onevault.json` after `anchor build`. */
export function createOneVaultProgram(
  connection: Connection,
  wallet: Wallet,
  idl: Idl,
  programId: PublicKey = ONEVAULT_PROGRAM_ID
): Program {
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  return new Program(idl, provider);
}

export { ONEVAULT_PROGRAM_ID, pdas, TradeVenue };

/** Fetch global protocol config */
export async function fetchProtocolConfig(program: Program) {
  const [protocolConfig] = pdas.protocolConfigPda(program.programId);
  return program.account.protocolConfig.fetch(protocolConfig);
}

/** Fetch vault by strategist + vaultId */
export async function fetchVault(
  program: Program,
  strategist: PublicKey,
  vaultId: number
) {
  const [vault] = pdas.vaultPda(strategist, vaultId, program.programId);
  return program.account.vault.fetch(vault);
}

/** Build deposit instruction (retail) */
export function buildDepositIx(
  program: Program,
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

/** Build launchpad buy trade request (step 1 of 2) */
export function buildLaunchpadBuyRequestIx(
  program: Program,
  params: {
    strategist: PublicKey;
    vault: PublicKey;
    tradeId: number;
    baseMint: PublicKey;
    memeMint: PublicKey;
    amount: BN;
    minAmountOut: BN;
    maxSlippageBps?: number;
  }
) {
  const [protocolConfig] = pdas.protocolConfigPda(program.programId);
  const [license] = pdas.licensePda(params.strategist, program.programId);
  const [vaultRisk] = pdas.vaultRiskPda(params.vault, program.programId);
  const [tradeRequest] = pdas.tradeRequestPda(
    params.vault,
    params.tradeId,
    program.programId
  );

  // Enum shapes match Anchor IDL after `anchor build` — verify against onevault.json
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
      false,
      0,
      0,
      0,
      0,
      { launchpad: {} }
    )
    .accountsPartial({
      strategist: params.strategist,
      protocolConfig,
      vault: params.vault,
      license,
      vaultRiskState: vaultRisk,
      tradeRequest,
    });
}

/** Listen for vault entering closure (notify retail to withdraw) */
export function onVaultClosingInitiated(
  program: Program,
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
