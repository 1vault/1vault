import { createHash } from "node:crypto";

/** Anchor event discriminators: sha256("event:<Name>")[0..8] */
export const EVENT_DISCRIMINATORS: Record<string, string> = {
  ProtocolInitialized: eventDisc("ProtocolInitialized"),
  VaultCreated: eventDisc("VaultCreated"),
  InvestorDeposit: eventDisc("InvestorDeposit"),
  InvestorWithdraw: eventDisc("InvestorWithdraw"),
  TradeRequested: eventDisc("TradeRequested"),
  TradeExecuted: eventDisc("TradeExecuted"),
  PositionOpened: eventDisc("PositionOpened"),
  PositionUpdated: eventDisc("PositionUpdated"),
  PositionClosed: eventDisc("PositionClosed"),
  TpSlTriggered: eventDisc("TpSlTriggered"),
  FeeAccrued: eventDisc("FeeAccrued"),
  ReferralRewardAccrued: eventDisc("ReferralRewardAccrued"),
  InvestorMirrored: eventDisc("InvestorMirrored"),
  PlatformStaked: eventDisc("PlatformStaked"),
  PlatformUnstaked: eventDisc("PlatformUnstaked"),
  VaultSolStaked: eventDisc("VaultSolStaked"),
  VaultSolUnstaked: eventDisc("VaultSolUnstaked"),
  RiskCircuitBreakerTripped: eventDisc("RiskCircuitBreakerTripped"),
};

function eventDisc(name: string): string {
  return createHash("sha256").update(`event:${name}`).digest().subarray(0, 8).toString("hex");
}

export function parseEventName(hexDisc: string): string | null {
  for (const [name, disc] of Object.entries(EVENT_DISCRIMINATORS)) {
    if (disc === hexDisc) return name;
  }
  return null;
}

export function readPubkey(buf: Buffer, offset: number): string {
  return Buffer.from(buf.subarray(offset, offset + 32)).toString("hex");
}

export function readU64(buf: Buffer, offset: number): bigint {
  return buf.readBigUInt64LE(offset);
}

export function readI64(buf: Buffer, offset: number): bigint {
  return buf.readBigInt64LE(offset);
}
