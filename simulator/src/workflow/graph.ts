import type { Node, Edge } from "@xyflow/react";
import type { NodeStatus, RetailSettings, WorkflowNodeId } from "../../shared/events";

export type { RetailSettings };

export type WalletSlot = {
  secret: string;
  useCli: boolean;
  pubkey?: string;
  sol?: string;
  error?: string;
};

export const defaultRetailSettings: RetailSettings = {
  autoFollow: true,
  copyBps: 5000,
  maxPositionBps: 5000,
  followTpSl: true,
  parkSol: 0.1,
  degenParkSol: 0.1,
  takeProfitBps: 2000,
  stopLossBps: 500,
};

export function emptyWallet(): WalletSlot {
  return { secret: "", useCli: false };
}

export type NodeView = {
  status: NodeStatus;
  detail?: string;
  tx?: string;
  fields?: Record<string, string>;
};

export const initialViews: Record<WorkflowNodeId, NodeView> = {
  degen: { status: "idle" },
  retail: { status: "idle" },
  protocol: { status: "idle" },
  license: { status: "idle" },
  vault: { status: "idle" },
  settings: { status: "idle" },
  deposit: { status: "idle" },
  ata: { status: "idle" },
  request: { status: "idle" },
  execute: { status: "idle" },
  openPos: { status: "idle" },
  mirror: { status: "idle" },
  mark: { status: "idle" },
  closePos: { status: "idle" },
  accrue: { status: "idle" },
  claim: { status: "idle" },
  withdraw: { status: "idle" },
  toWallet: { status: "idle" },
  platform: { status: "idle" },
  degenFee: { status: "idle" },
};

const C = 308;
const R = 286;
export const LAYOUT_REV = 12;
export const MAX_RETAILS = 4;
const RETAIL_STACK = 252;
const x = (col: number) => 48 + col * C;
const y = (row: number) => 40 + row * R;

export function buildNodes(retailCount = 1): Node[] {
  const n = Math.max(1, Math.min(MAX_RETAILS, retailCount));
  const nodes: Node[] = [
    { id: "degen", type: "wallet", position: { x: x(0), y: y(0) }, data: { role: "degen" } },
    { id: "license", type: "process", position: { x: x(1), y: y(0) }, data: { kind: "license" } },
    { id: "vault", type: "process", position: { x: x(2), y: y(0) }, data: { kind: "vault", ports: ["in", "out", "bottom"] } },
    { id: "ata", type: "process", position: { x: x(3), y: y(0) }, data: { kind: "ata" } },
    { id: "request", type: "process", position: { x: x(4), y: y(0) }, data: { kind: "request" } },
    { id: "execute", type: "process", position: { x: x(5), y: y(0) }, data: { kind: "execute", ports: ["in", "out", "bottom"] } },
    { id: "openPos", type: "process", position: { x: x(6), y: y(0) }, data: { kind: "openPos", ports: ["in"] } },

    { id: "retail", type: "wallet", position: { x: x(0), y: y(1) }, data: { role: "retail", index: 0 } },
    { id: "settings", type: "settings", position: { x: x(1), y: y(1) }, data: {} },
    { id: "deposit", type: "process", position: { x: x(2), y: y(1) }, data: { kind: "deposit", ports: ["in", "out", "top", "bottom"] } },
    { id: "mirror", type: "process", position: { x: x(3), y: y(1) }, data: { kind: "mirror", ports: ["in", "out", "top"] } },
    { id: "mark", type: "process", position: { x: x(4), y: y(1) }, data: { kind: "mark" } },
    { id: "closePos", type: "process", position: { x: x(5), y: y(1) }, data: { kind: "closePos", ports: ["in", "out", "bottom"] } },
    { id: "withdraw", type: "process", position: { x: x(6), y: y(1) }, data: { kind: "withdraw", ports: ["in"] } },

    { id: "protocol", type: "protocol", position: { x: x(0), y: y(2) + Math.max(0, n - 1) * RETAIL_STACK }, data: {} },
    { id: "toWallet", type: "process", position: { x: x(2), y: y(2) }, data: { kind: "toWallet", ports: ["in"] } },
    { id: "accrue", type: "process", position: { x: x(3), y: y(2) }, data: { kind: "accrue", ports: ["top", "out"] } },
    { id: "claim", type: "process", position: { x: x(4), y: y(2) }, data: { kind: "claim" } },
    { id: "degenFee", type: "sink", position: { x: x(5), y: y(2) }, data: { kind: "degenFee" } },
    { id: "platform", type: "sink", position: { x: x(6), y: y(2) }, data: { kind: "platform" } },
  ];
  for (let i = 1; i < n; i++) {
    nodes.push({
      id: `retail${i}`,
      type: "wallet",
      position: { x: x(0), y: y(1) + i * RETAIL_STACK },
      data: { role: "retail", index: i },
    });
  }
  return nodes;
}

export function buildEdges(views: Record<WorkflowNodeId, NodeView>, retailCount = 1): Edge[] {
  const defs: Array<[string, string, string, string, string]> = [
    ["degen", "license", "e-degen-license", "out", "in"],
    ["license", "vault", "e-license-vault", "out", "in"],
    ["vault", "ata", "e-vault-ata", "out", "in"],
    ["ata", "request", "e-ata-request", "out", "in"],
    ["request", "execute", "e-request-execute", "out", "in"],
    ["execute", "openPos", "e-execute-enter", "out", "in"],

    ["retail", "settings", "e-retail-settings", "out", "in"],
    ["settings", "deposit", "e-settings-vault", "out", "in"],
    ["deposit", "mirror", "e-vault-follow", "out", "in"],
    ["mirror", "mark", "e-follow-pnl", "out", "in"],
    ["mark", "closePos", "e-pnl-realize", "out", "in"],
    ["closePos", "withdraw", "e-realize-lock", "out", "in"],

    ["vault", "deposit", "e-create-join", "bottom", "top"],
    ["execute", "mirror", "e-exec-follow", "bottom", "top"],
    ["deposit", "toWallet", "e-park-wallet", "bottom", "in"],
    ["closePos", "accrue", "e-exit-fees", "bottom", "top"],
    ["accrue", "claim", "e-accrue-pay", "out", "in"],
    ["claim", "degenFee", "e-pay-degen", "out", "in"],
    ["degenFee", "platform", "e-degen-platform", "out", "in"],
  ];
  for (let i = 1; i < retailCount; i++) {
    defs.push([`retail${i}`, "settings", `e-retail${i}-settings`, "out", "in"]);
  }

  return defs.map(([source, target, id, sourceHandle, targetHandle]) => {
    const srcStatus =
      views[source as WorkflowNodeId]?.status ??
      (source.startsWith("retail") ? views.retail?.status : undefined) ??
      "idle";
    const tgtStatus =
      views[target as WorkflowNodeId]?.status ??
      (target.startsWith("retail") ? views.retail?.status : undefined) ??
      "idle";
    const active = srcStatus === "running" || tgtStatus === "running";
    const done =
      (srcStatus === "success" || srcStatus === "skipped") &&
      (tgtStatus === "success" || tgtStatus === "skipped" || tgtStatus === "running");
    const kind = done ? "done" : active ? "live" : "idle";
    return {
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: "smoothstep",
      pathOptions: { borderRadius: 28, offset: 18 },
      animated: active,
      className: `edge-${kind}`,
      zIndex: 0,
      style: {
        stroke: active ? "#5ec8f2" : done ? "#3ecf8e" : "rgba(94, 200, 242, 0.32)",
        strokeWidth: active ? 2.2 : 1.7,
      },
    };
  });
}
