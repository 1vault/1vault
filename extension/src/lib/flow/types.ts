export type FlowMode =
  | "create-vault"
  | "deposit"
  | "open-position"
  | "exit-position"
  | "claim-fees"
  | "close-vault";

export type FlowEventStatus = "running" | "success" | "error" | "skipped";

export type FlowEvent = {
  at: string;
  step: string;
  status: FlowEventStatus;
  detail?: string;
  tx?: string;
};

export type FlowRunStatus = "idle" | "running" | "completed" | "failed";

export type FlowState = {
  status: FlowRunStatus;
  mode?: FlowMode;
  flowId?: string;
  events: FlowEvent[];
  error?: string;
  result?: {
    vault?: string;
    vaultId?: number;
    vaultTokenAccount?: string;
    closed?: boolean;
  };
};

export type FlowRunInput = {
  mode: FlowMode;
  strategist: string;
  vault?: string;
  vaultId?: number;
  vaultType?: "pooled" | "sliced";
  parkSol?: number;
  takeProfitBps?: number;
  stopLossBps?: number;
  positionId?: number;
  tradeId?: number;
  inputMint?: string;
  exitPercent?: number;
  baseAmount?: number;
};

export const DEFAULT_FLOW_SETTINGS = {
  parkSol: 0.1,
  takeProfitBps: 5000,
  stopLossBps: 2500,
  vaultType: "pooled" as const,
};
