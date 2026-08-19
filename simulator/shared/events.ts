export type NodeStatus = "idle" | "ready" | "running" | "success" | "error" | "skipped";

export type SimMode = "create-vault" | "open-position" | "withdraw-wallet" | "close-vault" | "deposit";

export type WorkflowNodeId =
  | "degen"
  | "retail"
  | "protocol"
  | "license"
  | "vault"
  | "settings"
  | "deposit"
  | "ata"
  | "request"
  | "execute"
  | "openPos"
  | "mirror"
  | "mark"
  | "closePos"
  | "accrue"
  | "claim"
  | "withdraw"
  | "toWallet"
  | "platform"
  | "degenFee";

export type RetailSettings = {
  autoFollow: boolean;
  copyBps: number;
  maxPositionBps: number;
  followTpSl: boolean;
  parkSol: number;
  degenParkSol: number;
};

export type NodeUpdate = {
  id: WorkflowNodeId;
  status: NodeStatus;
  detail?: string;
  tx?: string;
  fields?: Record<string, string>;
};

export type ProtocolInfo = {
  cluster: "devnet";
  programId: string;
  protocolConfig: string;
  platformWallet: string;
  degenFeeWallet: string;
  explorerProgram: string;
  licenseMint: string;
  licenseName: string;
  licenseLockTokens: string;
};

export type WalletPreview = {
  pubkey: string;
  sol: string;
  lamports: number;
};
