import { createContext, useContext } from "react";
import type { NodeStatus, ProtocolInfo, RetailSettings, WorkflowNodeId } from "../../shared/events";
import type { NodeView, WalletSlot } from "./graph";

export type WorkflowCtx = {
  views: Record<WorkflowNodeId, NodeView>;
  protocol?: ProtocolInfo;
  degen: WalletSlot;
  retail: WalletSlot;
  settings: RetailSettings;
  activeVault?: { vaultId: number; vault: string };
  running: boolean;
  setDegen: (patch: Partial<WalletSlot>) => void;
  setRetail: (patch: Partial<WalletSlot>) => void;
  setSettings: (patch: Partial<RetailSettings>) => void;
  importDegen: (mode: "secret" | "cli") => Promise<void>;
  importRetail: (mode: "secret" | "cli") => Promise<void>;
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
