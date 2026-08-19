import { createHash } from "node:crypto";

/** Anchor event discriminators: sha256("event:<Name>")[0..8] */
export const EVENT_DISCRIMINATORS: Record<string, string> = {
  ProtocolInitialized: eventDisc("ProtocolInitialized"),
  VaultCreated: eventDisc("VaultCreated"),
  VaultClosingInitiated: eventDisc("VaultClosingInitiated"),
  VaultClosed: eventDisc("VaultClosed"),
  VaultClosePayout: eventDisc("VaultClosePayout"),
  InvestorDeposit: eventDisc("InvestorDeposit"),
  InvestorWithdraw: eventDisc("InvestorWithdraw"),
  TradeRequested: eventDisc("TradeRequested"),
  TradeExecuted: eventDisc("TradeExecuted"),
  PositionOpened: eventDisc("PositionOpened"),
  PositionUpdated: eventDisc("PositionUpdated"),
  PositionClosed: eventDisc("PositionClosed"),
  PositionFollowersClosed: eventDisc("PositionFollowersClosed"),
  TpSlTriggered: eventDisc("TpSlTriggered"),
  FeeAccrued: eventDisc("FeeAccrued"),
  InvestorMirrored: eventDisc("InvestorMirrored"),
  UpgradeProposalCreated: eventDisc("UpgradeProposalCreated"),
  UpgradeProposalApproved: eventDisc("UpgradeProposalApproved"),
  UpgradeProposalReady: eventDisc("UpgradeProposalReady"),
  UpgradeProposalCancelled: eventDisc("UpgradeProposalCancelled"),
  UpgradeProposalExecuted: eventDisc("UpgradeProposalExecuted"),
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

export function readString(buf: Buffer, offset: number): { value: string; size: number } {
  if (offset + 4 > buf.length) return { value: "", size: 4 };
  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const end = Math.min(start + len, buf.length);
  return { value: buf.subarray(start, end).toString("utf8"), size: 4 + len };
}
