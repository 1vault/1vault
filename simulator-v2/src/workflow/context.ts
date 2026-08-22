import { createContext, useContext } from "react";
import type { NodeStatus, ProtocolInfo, RetailSettings, SimMode, WorkflowNodeId } from "../../shared/events";
import type { WithdrawHolding } from "../shares";
import type { LicensePreview } from "../license";
import type { NodeView, WalletSlot } from "./graph";

export type WorkflowCtx = {
  views: Record<WorkflowNodeId, NodeView>;
  protocol?: ProtocolInfo;
  degen: WalletSlot;
  retail: WalletSlot;
  retails: WalletSlot[];
  settings: RetailSettings;
  activeVault?: { vaultId: number; vault: string; vaultType?: "pooled" | "sliced" };
  withdrawHoldings: WithdrawHolding[];
  withdrawHoldingsLoading: boolean;
  refreshWithdrawHoldings: () => Promise<void>;
  licensePreview?: LicensePreview;
  licensePreviewLoading: boolean;
  refreshLicensePreview: () => Promise<void>;
  running: boolean;
  runningMode?: SimMode;
  start: (mode: SimMode) => void;
  setDegen: (patch: Partial<WalletSlot>) => void;
  setRetail: (patch: Partial<WalletSlot>) => void;
  setRetailAt: (index: number, patch: Partial<WalletSlot>) => void;
  addRetail: () => void;
  removeRetail: (index: number) => void;
  setSettings: (patch: Partial<RetailSettings>) => void;
  importDegen: (mode: "secret" | "cli" | "wallet") => Promise<void>;
  importRetail: (mode: "secret" | "cli" | "wallet", index?: number) => Promise<void>;
};

export const WorkflowContext = createContext<WorkflowCtx | null>(null);

export function useWorkflow(): WorkflowCtx {
  const ctx = useContext(WorkflowContext);
  if (!ctx) throw new Error("WorkflowContext missing");
  return ctx;
}

export function statusLabel(status: NodeStatus): string {
  switch (status) {
    case "running":
      return "running";
    case "success":
      return "done";
    case "error":
      return "error";
    case "skipped":
      return "skip";
    case "ready":
      return "ready";
    default:
      return "idle";
  }
}

export function shortAddr(addr?: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}
